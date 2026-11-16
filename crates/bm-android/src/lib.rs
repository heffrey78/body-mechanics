//! Body Mechanics' Android plugin (#22, #25). Its Kotlin (android/) seals and opens secrets with a key
//! in Android's keystore, and runs a foreground service while a hold
//! or rest timer runs: a notification whose clock Android keeps ticking, a partial wake lock so the
//! cue comes on time with the screen locked, and at the target a vibration and the notification
//! sound. Elsewhere there's no service: the page keeps time and cues itself.

use serde::Serialize;
use tauri::Runtime;
use tauri::plugin::{Builder, TauriPlugin};
#[cfg(target_os = "android")]
use tauri::Manager;

/// A timer for the service: a hold counts up and cues at its target; a rest counts down and cues at 0.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TimerSpec {
    /// "hold" or "rest".
    pub kind: String,
    /// The notification's title, e.g. "Plank · set 2".
    pub label: String,
    pub target_seconds: u32,
    /// How long it has already run, when a timer is resumed.
    pub elapsed_seconds: u32,
}

#[derive(Serialize)]
#[cfg_attr(not(target_os = "android"), allow(dead_code))]
struct Nothing {}

#[derive(Serialize, serde::Deserialize)]
#[cfg_attr(not(target_os = "android"), allow(dead_code))]
struct Bytes {
    /// Base64.
    data: String,
}

pub struct Android<R: Runtime>(#[allow(dead_code)] tauri::plugin::PluginHandle<R>);

impl<R: Runtime> Android<R> {
    pub fn start_timer(&self, spec: TimerSpec) -> Result<(), String> {
        #[cfg(target_os = "android")]
        return self.0.run_mobile_plugin::<serde_json::Value>("startTimer", spec).map(|_| ()).map_err(|e| e.to_string());
        #[cfg(not(target_os = "android"))]
        return Err(format!("No timer service for {}: it's Android's.", spec.label));
    }

    pub fn stop_timer(&self) -> Result<(), String> {
        #[cfg(target_os = "android")]
        return self.0.run_mobile_plugin::<serde_json::Value>("stopTimer", Nothing {}).map(|_| ()).map_err(|e| e.to_string());
        #[cfg(not(target_os = "android"))]
        return Err("No timer service: it's Android's.".into());
    }
}

impl<R: Runtime> Android<R> {
    fn bytes(&self, op: &str, data: String) -> Result<String, String> {
        #[cfg(target_os = "android")]
        return self.0.run_mobile_plugin::<Bytes>(op, Bytes { data }).map(|b| b.data).map_err(|e| e.to_string());
        #[cfg(not(target_os = "android"))]
        return Err(format!("No keystore here to {op} {} bytes: it's Android's.", data.len()));
    }

    /// `plain` (base64) sealed with the keystore's key (#25): base64 of the nonce and the ciphertext.
    pub fn seal(&self, plain: String) -> Result<String, String> {
        self.bytes("seal", plain)
    }

    /// What `seal` sealed, back; an error if the key that sealed it is gone.
    pub fn open(&self, sealed: String) -> Result<String, String> {
        self.bytes("open", sealed)
    }
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("bm-android")
        .setup(|app, api| {
            #[cfg(target_os = "android")]
            app.manage(Android(api.register_android_plugin("io.github.heffrey78.bodymechanics.android", "BmPlugin")?));
            #[cfg(not(target_os = "android"))]
            let _ = (app, api);
            Ok(())
        })
        .build()
}
