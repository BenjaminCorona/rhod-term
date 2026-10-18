use portable_pty::{CommandBuilder, MasterPty, NativePtySystem, PtySize, PtySystem};
use std::{
    collections::HashMap,
    io::{Read, Write},
    sync::{Arc, Mutex},
    thread,
};
use tauri::{AppHandle, Emitter, State};

struct PtySession {
    writer: Box<dyn Write + Send>,
    master: Box<dyn MasterPty + Send>,
    pid: Option<u32>,
}

#[derive(Default)]
struct PtyState {
    sessions: Arc<Mutex<HashMap<String, PtySession>>>,
}

// 1. Comando para iniciar una sesión de terminal identificada por su `id`
#[tauri::command]
fn start_pty(id: String, app: AppHandle, state: State<'_, PtyState>) -> Result<(), String> {
    let pty_system = NativePtySystem::default();

    // Crear la pseudo-terminal con tamaño inicial de 80x24
    let pair = pty_system
        .openpty(PtySize {
            rows: 24,
            cols: 80,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;

    // Elegir el shell según el sistema operativo
    #[cfg(target_os = "windows")]
    let shell = std::env::var("COMSPEC").unwrap_or_else(|_| "powershell.exe".to_string());
    #[cfg(not(target_os = "windows"))]
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());

    let mut cmd = CommandBuilder::new(&shell);
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");

    let child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
    let pid = child.process_id();
    // Liberar el slave en el proceso padre para que el lector reciba EOF al salir el proceso
    drop(pair.slave);

    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;

    {
        let mut sessions = state.sessions.lock().map_err(|e| e.to_string())?;
        sessions.insert(
            id.clone(),
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

// 2. Comando para enviar teclas a una sesión específica
#[tauri::command]
fn write_pty(id: String, data: String, state: State<'_, PtyState>) -> Result<(), String> {
    let mut sessions = state.sessions.lock().map_err(|e| e.to_string())?;
    if let Some(session) = sessions.get_mut(&id) {
        session
            .writer
            .write_all(data.as_bytes())
            .map_err(|e| e.to_string())?;
        session.writer.flush().map_err(|e| e.to_string())?;
    }
    Ok(())
}

// 3. Comando para ajustar dimensiones de una sesión específica
#[tauri::command]
fn resize_pty(id: String, rows: u16, cols: u16, state: State<'_, PtyState>) -> Result<(), String> {
    let mut sessions = state.sessions.lock().map_err(|e| e.to_string())?;
    if let Some(session) = sessions.get_mut(&id) {
        session
            .master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

// 4. Comando para cerrar una sesión y liberar sus recursos
#[tauri::command]
fn close_pty(id: String, state: State<'_, PtyState>) -> Result<(), String> {
    let mut sessions = state.sessions.lock().map_err(|e| e.to_string())?;
    sessions.remove(&id);
    Ok(())
}

// 5. Obtener la ruta actual del proceso shell de la pestaña por su PID
#[tauri::command]
fn get_tab_cwd(id: String, state: State<'_, PtyState>) -> Result<String, String> {
    let sessions = state.sessions.lock().map_err(|e| e.to_string())?;
    if let Some(session) = sessions.get(&id) {
        if let Some(pid) = session.pid {
            #[cfg(target_os = "macos")]
            {
                let output = std::process::Command::new("lsof")
                    .args(["-a", "-p", &pid.to_string(), "-d", "cwd", "-Fn"])
                    .output()
                    .map_err(|e| e.to_string())?;

                let text = String::from_utf8_lossy(&output.stdout);
                for line in text.lines() {
                    if let Some(path) = line.strip_prefix('n') {
                        if !path.is_empty() {
                            return Ok(path.to_string());
                        }
                    }
                }
            }

            #[cfg(target_os = "linux")]
            {
                if let Ok(path) = std::fs::read_link(format!("/proc/{}/cwd", pid)) {
                    return Ok(path.to_string_lossy().to_string());
                }
            }
        }
    }
    Err("Ruta no disponible".to_string())
}

#[derive(serde::Serialize)]
struct SystemContext {
    cwd: String,
    git_branch: String,
    node_version: String,
    shell: String,
}

// 6. Obtener el contexto de sistema y rama de Git para la ruta consultada
#[tauri::command]
fn get_context(path: Option<String>) -> SystemContext {
    let cwd = path
        .filter(|p| !p.trim().is_empty())
        .unwrap_or_else(|| {
            std::env::current_dir()
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_else(|_| ".".to_string())
        });

    let git_branch = std::process::Command::new("git")
        .args(["-C", &cwd, "branch", "--show-current"])
        .output()
        .ok()
        .and_then(|out| String::from_utf8(out.stdout).ok())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "-".to_string());

    let node_version = std::process::Command::new("node")
        .arg("-v")
        .output()
        .ok()
        .and_then(|out| String::from_utf8(out.stdout).ok())
        .map(|s| s.trim().to_string())
        .unwrap_or_else(|| "v24.14.0".to_string());

    #[cfg(target_os = "windows")]
    let shell = "powershell".to_string();
    #[cfg(not(target_os = "windows"))]
    let shell = std::env::var("SHELL")
        .map(|s| s.rsplit('/').next().unwrap_or("zsh").to_string())
        .unwrap_or_else(|_| "zsh".to_string());

    SystemContext {
        cwd,
        git_branch,
        node_version,
        shell,
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(PtyState::default())
        .invoke_handler(tauri::generate_handler![
            start_pty,
            write_pty,
            resize_pty,
            close_pty,
            get_tab_cwd,
            get_context
        ])
        .run(tauri::generate_context!())
        .expect("Error al ejecutar la aplicación Tauri");
}