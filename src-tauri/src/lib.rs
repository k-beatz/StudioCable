/// Native shell for the StudioCable web UI (desktop and mobile).
/// All app logic lives in the TypeScript frontend; Rust only provides
/// the window and the file dialogs / file access plugins.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .run(tauri::generate_context!())
        .expect("error while running StudioCable");
}
