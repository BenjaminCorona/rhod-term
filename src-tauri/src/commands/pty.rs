use crate::error::AppError;
use crate::state::AppState;
use tauri::{AppHandle, State};

/// Controlador IPC para iniciar una sesión de terminal PTY con dimensiones iniciales
#[tauri::command]
pub fn start_pty(
    id: String,
    cols: Option<u16>,
    rows: Option<u16>,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    state.pty_manager.start_session(&id, cols, rows, app)
}

/// Controlador IPC para enviar datos a una terminal activa
#[tauri::command]
pub fn write_pty(id: String, data: String, state: State<'_, AppState>) -> Result<(), AppError> {
    state.pty_manager.write_session(&id, &data)
}

/// Controlador IPC para cambiar dimensiones (filas/columnas) de la terminal
#[tauri::command]
pub fn resize_pty(
    id: String,
    rows: u16,
    cols: u16,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    state.pty_manager.resize_session(&id, rows, cols)
}

/// Controlador IPC para finalizar y liberar una sesión PTY
#[tauri::command]
pub fn close_pty(id: String, state: State<'_, AppState>) -> Result<(), AppError> {
    state.pty_manager.close_session(&id)
}
