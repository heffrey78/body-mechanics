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

/// An operation of the files port, as remote-ports.ts calls it: its answer, with bytes as
/// `{ "$bytes": base64 }`, or `{ code?, message }`.
#[tauri::command]
async fn port(state: State<'_, App>, port: String, op: String, args: Vec<Value>) -> Result<Value, Value> {
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
        .invoke_handler(tauri::generate_handler![host_platform, data_dir, git, listen, port, timer_start, timer_stop, smoke_report])
        .run(tauri::generate_context!())
        .expect("Body Mechanics failed to start");
}
