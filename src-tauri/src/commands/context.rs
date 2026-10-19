use crate::context::{process::ProcessInspector, ContextService, SystemContext};
use crate::error::AppError;
use crate::state::AppState;
use tauri::State;

/// Controlador IPC para resolver el CWD actual del proceso shell de una pestaña
#[tauri::command]
pub fn get_tab_cwd(id: String, state: State<'_, AppState>) -> Result<String, AppError> {
    let pid = state
        .pty_manager
        .get_session_pid(&id)?
        .ok_or(AppError::PathUnavailable)?;
    ProcessInspector::get_process_cwd(pid)
}

/// Controlador IPC para obtener metadatos de entorno, Git y SO
#[tauri::command]
pub fn get_context(path: Option<String>) -> SystemContext {
    ContextService::collect_system_context(path)
}
