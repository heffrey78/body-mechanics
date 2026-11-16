//! The host for Body Mechanics' engine (D2, #16). On both the desktop and Android the engine runs in
//! the webview; the ports it needs are commands here (#21): `git` (git2-port, libgit2 in process) and
//! `port` (files now, secrets with #25), with `listen` for the files port's watch events. Adapted from
//! writer's packages/mobile/src-tauri at writer e89d55c.

use bm_ports::files;
use serde_json::{Value, json};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::ipc::Channel;
use tauri::{Manager, State};

struct App {
    /// The app's own folder: its records, its git configuration.
    root: PathBuf,
    watches: files::Watches,
    /// Where the watches' events go: the page's channel, from `listen`.
    events: Arc<Mutex<Option<Channel<Value>>>>,
}

/// The platform the app runs on, as Rust sees it: "linux", "android", …
#[tauri::command]
fn host_platform() -> String {
    std::env::consts::OS.to_string()
}

/// The app's own folder, where its repositories live.
#[tauri::command]
fn data_dir(state: State<'_, App>) -> String {
    state.root.to_string_lossy().into_owned()
}

/// One git port operation (git2-port's `call`): its answer, or `{ code, message }`. A clone's or a
/// fetch's progress goes to `progress` as it comes.
#[tauri::command]
async fn git(op: String, dir: String, args: Value, progress: Channel<Value>) -> Result<Value, Value> {
    let answer = tauri::async_runtime::spawn_blocking(move || git2_port::call_with(&op, &dir, &args, &mut |p| drop(progress.send(p))))
        .await
        .map_err(|e| json!({ "code": "GIT", "message": e.to_string() }))?;
    match answer.get("err") {
        Some(err) => Err(err.clone()),
        None => Ok(answer.get("ok").cloned().unwrap_or(Value::Null)),
    }
}

/// The page's channel for watch events; a page that starts afresh stops the watches its last one left.
#[tauri::command]
fn listen(state: State<'_, App>, events: Channel<Value>) {
    state.watches.stop_all();
    *state.events.lock().unwrap() = Some(events);
}

/// The secrets port (#25): `get` / `set` / `delete` a named secret. The OS keychain on the desktop; on
/// Android, a file per secret sealed by a key in Android's keystore (bm-android).
fn secrets(app: &tauri::AppHandle, root: &std::path::Path, op: &str, args: &[Value]) -> Result<Value, String> {
    let name = args.first().and_then(Value::as_str).ok_or("No secret's name.")?;
    let value = args.get(1).and_then(Value::as_str);
    #[cfg(target_os = "android")]
    {
        let named = bm_ports::secrets::Named::new(root.join("secrets"), Keystore(app.clone()));
        let secret = named.named(name)?;
        return match op {
            "get" => secret.get().map(|v| v.map_or(Value::Null, Value::String)),
            "set" => secret.set(value.unwrap_or("")).map(|_| Value::Null),
            "delete" => secret.delete().map(|_| Value::Null),
            _ => Err(format!("No secrets operation {op}.")),
        };
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = (app, root);
        let entry = keyring::Entry::new("io.github.heffrey78.bodymechanics", name).map_err(|e| e.to_string())?;
        match op {
            "get" => match entry.get_password() {
                Ok(v) => Ok(Value::String(v)),
                Err(keyring::Error::NoEntry) => Ok(Value::Null),
                Err(e) => Err(format!("The keychain couldn't be read: {e}")),
            },
            "set" => entry.set_password(value.unwrap_or("")).map(|_| Value::Null).map_err(|e| format!("The keychain couldn't be written: {e}")),
            "delete" => match entry.delete_credential() {
                Ok(()) | Err(keyring::Error::NoEntry) => Ok(Value::Null),
                Err(e) => Err(e.to_string()),
            },
            _ => Err(format!("No secrets operation {op}.")),
        }
    }
}

/// Android's keystore, through the bm-android plugin, as the secrets store's cipher.
#[cfg(target_os = "android")]
#[derive(Clone)]
struct Keystore(tauri::AppHandle);

#[cfg(target_os = "android")]
impl bm_ports::secrets::Cipher for Keystore {
    fn seal(&self, plain: String) -> Result<String, String> {
        self.0.try_state::<bm_android::Android<tauri::Wry>>().ok_or("No keystore plugin.")?.seal(plain)
    }
    fn open(&self, sealed: String) -> Result<String, String> {
        self.0.try_state::<bm_android::Android<tauri::Wry>>().ok_or("No keystore plugin.")?.open(sealed)
    }
}

/// An operation of the files or secrets port, as remote-ports.ts calls it: its answer, with bytes as
/// `{ "$bytes": base64 }`, or `{ code?, message }`.
#[tauri::command]
async fn port(app: tauri::AppHandle, state: State<'_, App>, port: String, op: String, args: Vec<Value>) -> Result<Value, Value> {
    let failed = |message: String| json!({ "message": message });
    match (port.as_str(), op.as_str()) {
        ("files", "watch") => {
            let events = Arc::clone(&state.events);
            let root = args.first().and_then(Value::as_str).unwrap_or("").to_string();
            let send = Arc::new(move |e: Value| {
                if let Some(channel) = events.lock().unwrap().as_ref() {
                    let _ = channel.send(e);
                }
            });
            state.watches.start(&root, send).map(Value::String).map_err(|e| e.to_json())
        }
        ("files", "unwatch") => {
            state.watches.stop(args.first().and_then(Value::as_str).unwrap_or(""));
            Ok(Value::Null)
        }
        ("files", _) => tauri::async_runtime::spawn_blocking(move || files::call(&op, &args).map_err(|e| e.to_json()))
            .await
            .map_err(|e| failed(e.to_string()))?,
        ("secrets", _) => {
            let root = state.root.clone();
            tauri::async_runtime::spawn_blocking(move || secrets(&app, &root, &op, &args))
                .await
                .map_err(|e| failed(e.to_string()))?
                .map_err(failed)
        }
        _ => Err(failed(format!("No {port} operation {op}."))),
    }
}

/// A hold or rest timer in Android's foreground service (#22), so it runs and cues with the screen
/// locked: true if the service took it. Elsewhere false, and the page keeps time and cues itself.
#[tauri::command]
fn timer_start(app: tauri::AppHandle, kind: String, label: String, target_seconds: u32, elapsed_seconds: u32) -> Result<bool, String> {
    let spec = bm_android::TimerSpec { kind, label, target_seconds, elapsed_seconds };
    match app.try_state::<bm_android::Android<tauri::Wry>>() {
        Some(android) => android.start_timer(spec).map(|_| true),
        None => Ok(false),
    }
}

#[tauri::command]
fn timer_stop(app: tauri::AppHandle) -> Result<(), String> {
    match app.try_state::<bm_android::Android<tauri::Wry>>() {
        Some(android) => android.stop_timer(),
        None => Ok(()),
    }
}

/// Extra smoke checks asked for by environment (#28): BM_SMOKE_STORAGE=<sessions> runs the storage check.
#[tauri::command]
fn smoke_storage() -> Option<u32> {
    std::env::var("BM_SMOKE_STORAGE").ok().and_then(|v| v.parse().ok())
}

/// The smoke test (#20, #21): with BM_SMOKE set, the page reports what it rendered and checked, and the
/// app exits, so CI checks the webview, the engine and the ports end to end. Otherwise it does nothing.
#[tauri::command]
fn smoke_report(app: tauri::AppHandle, report: String) {
    if std::env::var_os("BM_SMOKE").is_some() {
        println!("BM_SMOKE {report}");
        app.exit(0);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(bm_android::init())
        .setup(|app| {
            let root = app.path().app_data_dir()?;
            std::fs::create_dir_all(&root)?;
            // git's global configuration is the app's own, in its folder, on every platform: the
            // identity it commits as is the app's business (and an Android app has no home folder).
            // libgit2 only writes to a global file that's there.
            unsafe { git2::opts::set_search_path(git2::ConfigLevel::Global, &root)? };
            let config = root.join(".gitconfig");
            if !config.exists() {
                std::fs::write(config, "")?;
            }
            // The device's own trusted certificates, for libgit2's OpenSSL, added in memory
            // (git2_port::trust_certificates_in says why): Conscrypt's, then the system's.
            #[cfg(target_os = "android")]
            git2_port::trust_certificates_in(&["/apex/com.android.conscrypt/cacerts", "/system/etc/security/cacerts"])?;
            app.manage(App { root, watches: files::Watches::default(), events: Arc::default() });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![host_platform, data_dir, git, listen, port, timer_start, timer_stop, smoke_storage, smoke_report])
        .run(tauri::generate_context!())
        .expect("Body Mechanics failed to start");
}
