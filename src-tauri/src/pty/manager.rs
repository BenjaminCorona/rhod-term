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
    pending_resizes: Arc<Mutex<HashMap<String, (u16, u16)>>>,
}

impl PtyManager {
    pub fn new() -> Self {
        Self::default()
    }

    /// Inicializa una nueva terminal PTY, spawn del shell y arranca el hilo de streaming de eventos
    pub fn start_session(
        &self,
        id: &str,
        cols: Option<u16>,
        rows: Option<u16>,
        cwd: Option<String>,
        app: AppHandle,
    ) -> Result<(), AppError> {
        let pty_system = NativePtySystem::default();

        // Si ya llegó una solicitud de redimensionamiento previa, usarla prioritariamente
        let (initial_rows, initial_cols) = {
            let mut pending = self.pending_resizes.lock()?;
            if let Some((r, c)) = pending.remove(id) {
                (r, c)
            } else {
                (rows.unwrap_or(24).max(4), cols.unwrap_or(80).max(10))
            }
        };

        let pair = pty_system
            .openpty(PtySize {
                rows: initial_rows,
                cols: initial_cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| AppError::Pty(e.to_string()))?;

        let shell = Self::resolve_shell();
        let mut cmd = CommandBuilder::new(&shell);

        if let Some(ref dir) = cwd {
            let path = std::path::Path::new(dir);
            if path.is_dir() {
                cmd.cwd(path);
            }
        }

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
            // Si ya existía una sesión previa con el mismo ID, cerrarla para evitar duplicidad de hilos
            if let Some(existing) = sessions.remove(id) {
                drop(existing);
            }
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
        // Maneja de forma estricta los límites de bytes UTF-8 para evitar caracteres de reemplazo (\u{FFFD} / )
        let event_name = format!("pty-output-{}", id);
        let exit_event_name = format!("pty-exit-{}", id);
        thread::spawn(move || {
            let mut pending = Vec::with_capacity(4096);
            let mut buffer = [0u8; 4096];
            while let Ok(n) = reader.read(&mut buffer) {
                if n == 0 {
                    break;
                }
                pending.extend_from_slice(&buffer[..n]);

                let mut start = 0;
                loop {
                    match std::str::from_utf8(&pending[start..]) {
                        Ok(valid_str) => {
                            if !valid_str.is_empty() {
                                let _ = app.emit(&event_name, valid_str);
                            }
                            pending.clear();
                            break;
                        }
                        Err(err) => {
                            let valid_up_to = err.valid_up_to();
                            if valid_up_to > 0 {
                                if let Ok(valid_str) =
                                    std::str::from_utf8(&pending[start..start + valid_up_to])
                                {
                                    let _ = app.emit(&event_name, valid_str);
                                }
                            }
                            match err.error_len() {
                                None => {
                                    // Secuencia UTF-8 incompleta cortada entre lecturas de 4KB.
                                    // Retener estos bytes residuales para la siguiente lectura.
                                    pending.drain(..start + valid_up_to);
                                    break;
                                }
                                Some(error_len) => {
                                    // Byte genuinamente inválido en el flujo binario
                                    let _ = app.emit(&event_name, "\u{FFFD}");
                                    start += valid_up_to + error_len;
                                }
                            }
                        }
                    }
                }
            }
            // Si quedaron bytes al cerrar el proceso, emitirlos
            if !pending.is_empty() {
                let lossy = String::from_utf8_lossy(&pending).to_string();
                let _ = app.emit(&event_name, lossy);
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
        } else {
            // Si la sesión aún se está creando, registrar las dimensiones solicitadas
            let mut pending = self.pending_resizes.lock()?;
            pending.insert(id.to_string(), (rows, cols));
        }
        Ok(())
    }

    /// Cierra y elimina la sesión de la memoria
    pub fn close_session(&self, id: &str) -> Result<(), AppError> {
        {
            let mut sessions = self.sessions.lock()?;
            sessions.remove(id);
        }
        if let Ok(mut pending) = self.pending_resizes.lock() {
            pending.remove(id);
        }
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

#[cfg(test)]
mod tests {
    #[test]
    fn test_utf8_streaming_no_corrupted_replacements() {
        let sample = "Inicio ──────────────────────────────────────────────────────── Fin";
        let bytes = sample.as_bytes();
        for chunk_size in 1..=15 {
            let mut pending = Vec::new();
            let mut emitted = String::new();
            for chunk in bytes.chunks(chunk_size) {
                pending.extend_from_slice(chunk);
                let mut start = 0;
                loop {
                    match std::str::from_utf8(&pending[start..]) {
                        Ok(valid_str) => {
                            emitted.push_str(valid_str);
                            pending.clear();
                            break;
                        }
                        Err(err) => {
                            let valid_up_to = err.valid_up_to();
                            if valid_up_to > 0 {
                                emitted.push_str(
                                    std::str::from_utf8(&pending[start..start + valid_up_to])
                                        .unwrap(),
                                );
                            }
                            match err.error_len() {
                                None => {
                                    pending.drain(..start + valid_up_to);
                                    break;
                                }
                                Some(len) => {
                                    emitted.push('\u{FFFD}');
                                    start += valid_up_to + len;
                                }
                            }
                        }
                    }
                }
            }
            if !pending.is_empty() {
                emitted.push_str(&String::from_utf8_lossy(&pending));
            }
            assert_eq!(emitted, sample, "Failed for chunk size {}", chunk_size);
            assert!(!emitted.contains('\u{FFFD}'), "Should not contain replacement character");
        }
    }
}
