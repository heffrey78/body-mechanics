//! The host for Body Mechanics' engine (D2, #16). On both the desktop and Android the engine runs
//! in the webview; the ports it needs (files, git, secrets) are commands here, added by #21.

/// The platform the app runs on, as Rust sees it: "linux", "android", …
#[tauri::command]
fn host_platform() -> String {
    std::env::consts::OS.to_string()
}

/// The smoke test (#20): with BM_SMOKE set, the page reports what it rendered and the app exits, so CI
/// checks the webview, the engine package and this bridge end to end. Otherwise it does nothing.
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
        .invoke_handler(tauri::generate_handler![host_platform, smoke_report])
        .run(tauri::generate_context!())
        .expect("Body Mechanics failed to start");
}
