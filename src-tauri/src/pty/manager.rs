use serde::{Deserialize, Serialize};
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionBusyInfo {
    pub is_busy: bool,
    pub foreground_process: Option<String>,
}

#[cfg(target_os = "macos")]
unsafe extern "C" {
    fn proc_listchildpids(ppid: i32, buffer: *mut i32, buffersize: i32) -> i32;
    fn proc_name(pid: i32, buffer: *mut u8, buffersize: u32) -> i32;
    fn getpgid(pid: i32) -> i32;
}

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

    /// Determina si la sesión PTY tiene procesos hijos en ejecución (terminal ocupada)
    pub fn get_session_busy_state(&self, id: &str) -> Result<SessionBusyInfo, AppError> {
        let sessions = self.sessions.lock()?;
        let Some(session) = sessions.get(id) else {
            return Ok(SessionBusyInfo {
                is_busy: false,
                foreground_process: None,
            });
        };

        let Some(shell_pid) = session.pid else {
            return Ok(SessionBusyInfo {
                is_busy: false,
                foreground_process: None,
            });
        };

        #[cfg(target_os = "macos")]
        {
            let mut queue = std::collections::VecDeque::new();
            queue.push_back(shell_pid as i32);
            let mut all_descendants = Vec::new();
            let mut child_pids = [0i32; 64];

            while let Some(current_pid) = queue.pop_front() {
                let count = unsafe {
                    proc_listchildpids(
                        current_pid,
                        child_pids.as_mut_ptr(),
                        (child_pids.len() * std::mem::size_of::<i32>()) as i32,
                    )
                };

                if count > 0 {
                    let num_children = count.min(child_pids.len() as i32) as usize;
                    for &c_pid in &child_pids[..num_children] {
                        if c_pid > 0 && !all_descendants.contains(&c_pid) {
                            all_descendants.push(c_pid);
                            queue.push_back(c_pid);
                        }
                    }
                }
            }

            if !all_descendants.is_empty() {
                // Obtener el nombre del proceso hoja más reciente (ej. node, nest, cargo, git)
                let target_pid = *all_descendants.last().unwrap();
                let mut name_buf = [0u8; 256];
                let len = unsafe {
                    proc_name(
                        target_pid,
                        name_buf.as_mut_ptr(),
                        name_buf.len() as u32,
                    )
                };
                let process_name = if len > 0 {
                    String::from_utf8_lossy(&name_buf[..len as usize]).to_string()
                } else {
                    "proceso".to_string()
                };

                return Ok(SessionBusyInfo {
                    is_busy: true,
                    foreground_process: Some(process_name),
                });
            }

            // También comprobar el grupo de procesos en primer plano del master PTY si estuviera disponible
            #[cfg(unix)]
            if let Some(leader) = session.master.process_group_leader() {
                let shell_pgid = unsafe { getpgid(shell_pid as i32) };
                if leader > 0 && leader != shell_pid as i32 && leader != shell_pgid {
                    let mut name_buf = [0u8; 256];
                    let len = unsafe {
                        proc_name(
                            leader,
                            name_buf.as_mut_ptr(),
                            name_buf.len() as u32,
                        )
                    };
                    let process_name = if len > 0 {
                        String::from_utf8_lossy(&name_buf[..len as usize]).to_string()
                    } else {
                        "proceso".to_string()
                    };

                    return Ok(SessionBusyInfo {
                        is_busy: true,
                        foreground_process: Some(process_name),
                    });
                }
            }

            Ok(SessionBusyInfo {
                is_busy: false,
                foreground_process: None,
            })
        }

        #[cfg(target_os = "linux")]
        {
            let mut queue = std::collections::VecDeque::new();
            queue.push_back(shell_pid);
            let mut all_descendants = Vec::new();

            while let Some(curr_pid) = queue.pop_front() {
                let path = format!("/proc/{}/task/{}/children", curr_pid, curr_pid);
                if let Ok(children_str) = std::fs::read_to_string(&path) {
                    for token in children_str.split_whitespace() {
                        if let Ok(child_pid) = token.parse::<u32>() {
                            if child_pid > 0 && !all_descendants.contains(&child_pid) {
                                all_descendants.push(child_pid);
                                queue.push_back(child_pid);
                            }
                        }
                    }
                }
            }

            if !all_descendants.is_empty() {
                let target_pid = *all_descendants.last().unwrap();
                let comm_path = format!("/proc/{}/comm", target_pid);
                let process_name = std::fs::read_to_string(&comm_path)
                    .map(|s| s.trim().to_string())
                    .unwrap_or_else(|_| "proceso".to_string());

                return Ok(SessionBusyInfo {
                    is_busy: true,
                    foreground_process: Some(process_name),
                });
            }

            #[cfg(unix)]
            if let Some(leader) = session.master.process_group_leader() {
                if leader > 0 && leader as u32 != shell_pid {
                    let comm_path = format!("/proc/{}/comm", leader);
                    let process_name = std::fs::read_to_string(&comm_path)
                        .map(|s| s.trim().to_string())
                        .unwrap_or_else(|_| "proceso".to_string());

                    return Ok(SessionBusyInfo {
                        is_busy: true,
                        foreground_process: Some(process_name),
                    });
                }
            }

            Ok(SessionBusyInfo {
                is_busy: false,
                foreground_process: None,
            })
        }

        #[cfg(target_os = "windows")]
        {
            use windows_sys::Win32::Foundation::{CloseHandle, INVALID_HANDLE_VALUE};
            use windows_sys::Win32::System::Diagnostics::ToolHelp::{
                CreateToolhelp32Snapshot, Process32First, Process32Next, PROCESSENTRY32,
                TH32CS_SNAPPROCESS,
            };

            let mut all_descendants = Vec::new();
            let mut queue = std::collections::VecDeque::new();
            queue.push_back(shell_pid);

            let snapshot = unsafe { CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) };
            if snapshot != INVALID_HANDLE_VALUE {
                let mut entries = Vec::new();
                let mut entry: PROCESSENTRY32 = unsafe { std::mem::zeroed() };
                entry.dwSize = std::mem::size_of::<PROCESSENTRY32>() as u32;

                if unsafe { Process32First(snapshot, &mut entry) } != 0 {
                    loop {
                        let name_len = entry
                            .szExeFile
                            .iter()
                            .position(|&c| c == 0)
                            .unwrap_or(entry.szExeFile.len());
                        let name = String::from_utf8_lossy(
                            &entry.szExeFile[..name_len]
                                .iter()
                                .map(|&c| c as u8)
                                .collect::<Vec<u8>>(),
                        )
                        .to_string();

                        entries.push((entry.th32ProcessID, entry.th32ParentProcessID, name));
                        if unsafe { Process32Next(snapshot, &mut entry) } == 0 {
                            break;
                        }
                    }
                }
                unsafe { CloseHandle(snapshot) };

                let mut last_name = None;
                while let Some(curr_pid) = queue.pop_front() {
                    for &(pid, parent_pid, ref name) in &entries {
                        if parent_pid == curr_pid && pid > 0 && !all_descendants.contains(&pid) {
                            all_descendants.push(pid);
                            queue.push_back(pid);
                            last_name = Some(name.clone());
                        }
                    }
                }

                if !all_descendants.is_empty() {
                    return Ok(SessionBusyInfo {
                        is_busy: true,
                        foreground_process: last_name,
                    });
                }
            }

            Ok(SessionBusyInfo {
                is_busy: false,
                foreground_process: None,
            })
        }

        #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
        {
            #[cfg(unix)]
            if let Some(leader) = session.master.process_group_leader() {
                if leader > 0 && leader as u32 != shell_pid {
                    return Ok(SessionBusyInfo {
                        is_busy: true,
                        foreground_process: Some("proceso".to_string()),
                    });
                }
            }

            Ok(SessionBusyInfo {
                is_busy: false,
                foreground_process: None,
            })
        }
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
    use super::*;
    #[test]
    fn test_busy_state_non_existent_session() {
        let manager = PtyManager::new();
        let busy = manager.get_session_busy_state("non-existent").unwrap();
        assert_eq!(busy.is_busy, false);
        assert_eq!(busy.foreground_process, None);
    }

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
