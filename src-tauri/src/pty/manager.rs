use super::integration::{ensure_shell_assets_extracted, setup_shell_integration};
use super::session::PtySession;
use crate::error::AppError;
use portable_pty::{CommandBuilder, NativePtySystem, PtySize, PtySystem};
use std::{
    collections::HashMap,
    io::{Read, Write},
    sync::{Arc, Mutex},
    thread,
};
use tauri::{AppHandle, Emitter};

/// Gestor centralizado del ciclo de vida y streaming de terminales PTY
#[derive(Default, Clone)]
pub struct PtyManager {
    sessions: Arc<Mutex<HashMap<String, PtySession>>>,
}

impl PtyManager {
    pub fn new() -> Self {
        Self::default()
    }

    /// Inicializa una nueva terminal PTY, spawn del shell y arranca el hilo de streaming de eventos
    pub fn start_session(&self, id: &str, app: AppHandle) -> Result<(), AppError> {
        let pty_system = NativePtySystem::default();
        let pair = pty_system
            .openpty(PtySize {
                rows: 24,
                cols: 80,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| AppError::Pty(e.to_string()))?;

        let shell = Self::resolve_shell();
        let mut cmd = CommandBuilder::new(&shell);

        ensure_shell_assets_extracted();
        setup_shell_integration(&mut cmd, &shell);

        let child = pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| AppError::Pty(e.to_string()))?;
        let pid = child.process_id();

        // Liberar el slave en el proceso padre para que el lector reciba EOF al salir el proceso
        drop(pair.slave);

        let mut reader = pair
            .master
            .try_clone_reader()
            .map_err(|e| AppError::Pty(e.to_string()))?;
        let writer = pair
            .master
            .take_writer()
            .map_err(|e| AppError::Pty(e.to_string()))?;

        {
            let mut sessions = self.sessions.lock()?;
            sessions.insert(
                id.to_string(),
                PtySession {
                    writer,
                    master: pair.master,
                    pid,
                },
            );
        }

        // Hilo en segundo plano que lee la salida de esta pestaña y emite su evento particular
        let event_name = format!("pty-output-{}", id);
        let exit_event_name = format!("pty-exit-{}", id);
        thread::spawn(move || {
            let mut buffer = [0u8; 4096];
            while let Ok(n) = reader.read(&mut buffer) {
                if n == 0 {
                    break;
                }
                let output = String::from_utf8_lossy(&buffer[..n]).to_string();
                let _ = app.emit(&event_name, output);
            }
            let _ = app.emit(&exit_event_name, ());
        });

        Ok(())
    }

    /// Envía datos (teclas/comandos) al descriptor de escritura de la sesión indicada
    pub fn write_session(&self, id: &str, data: &str) -> Result<(), AppError> {
        let mut sessions = self.sessions.lock()?;
        if let Some(session) = sessions.get_mut(id) {
            session.writer.write_all(data.as_bytes())?;
            session.writer.flush()?;
        }
        Ok(())
    }

    /// Redimensiona las filas y columnas de la sesión PTY
    pub fn resize_session(&self, id: &str, rows: u16, cols: u16) -> Result<(), AppError> {
        let mut sessions = self.sessions.lock()?;
        if let Some(session) = sessions.get_mut(id) {
            session
                .master
                .resize(PtySize {
                    rows,
                    cols,
                    pixel_width: 0,
                    pixel_height: 0,
                })
                .map_err(|e| AppError::Pty(e.to_string()))?;
        }
        Ok(())
    }

    /// Cierra y elimina la sesión de la memoria
    pub fn close_session(&self, id: &str) -> Result<(), AppError> {
        let mut sessions = self.sessions.lock()?;
        sessions.remove(id);
        Ok(())
    }

    /// Obtiene el PID del proceso shell asociado a una pestaña si existe
    pub fn get_session_pid(&self, id: &str) -> Result<Option<u32>, AppError> {
        let sessions = self.sessions.lock()?;
        Ok(sessions.get(id).and_then(|s| s.pid))
    }

    /// Resuelve el shell predeterminado del sistema operativo
    fn resolve_shell() -> String {
        #[cfg(target_os = "windows")]
        {
            if let Ok(custom) = std::env::var("RHOD_SHELL").or_else(|_| std::env::var("SHELL")) {
                custom
            } else {
                "powershell.exe".to_string()
            }
        }

        #[cfg(target_os = "macos")]
        {
            std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string())
        }

        #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
        {
            std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string())
        }
    }
}
