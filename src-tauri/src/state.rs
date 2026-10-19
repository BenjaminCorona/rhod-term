use crate::pty::PtyManager;

/// Estado global de la aplicación inyectado en el runtime de Tauri
#[derive(Default, Clone)]
pub struct AppState {
    pub pty_manager: PtyManager,
}

impl AppState {
    pub fn new() -> Self {
        Self::default()
    }
}
