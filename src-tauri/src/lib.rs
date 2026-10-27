pub mod commands;
pub mod context;
pub mod error;
pub mod pty;
pub mod state;
pub mod storage;

use state::AppState;

/// Punto de entrada principal y composición de la aplicación Tauri
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(AppState::new())
        .invoke_handler(tauri::generate_handler![
            commands::pty::start_pty,
            commands::pty::write_pty,
            commands::pty::resize_pty,
            commands::pty::close_pty,
            commands::pty::get_session_busy_state,
            commands::context::get_tab_cwd,
            commands::context::get_context,
            commands::suggestions::get_ghost_suggestion,
            commands::suggestions::record_command_habit,
            commands::suggestions::get_command_history,
            storage::load_config,
            storage::save_config,
            storage::load_session,
            storage::save_session
        ])
        .run(tauri::generate_context!())
        .expect("Error al ejecutar la aplicación Tauri");
}
