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

// Preparar scripts de integración de shell nativos para Rhod
fn setup_shell_integration(cmd: &mut CommandBuilder, _shell: &str) {
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");
    cmd.env("FORCE_COLOR", "3");
    cmd.env("CLICOLOR", "1");
    cmd.env("LSCOLORS", "exfxcxdxbxegedabagacad");
    cmd.env("RHOD_TERMINAL", "1");

    // Asegurar que herramientas de desarrollo (Cargo, Homebrew) esten en PATH
    if let Ok(current_path) = std::env::var("PATH") {
        let home = std::env::var("HOME").unwrap_or_default();
        let cargo_bin = format!("{}/.cargo/bin", home);
        let extra_paths = format!("{}:/opt/homebrew/bin:/usr/local/bin:{}", cargo_bin, current_path);
        cmd.env("PATH", extra_paths);
    }

    let runtime_dir = std::env::temp_dir().join("rhod-shell");
    if let Err(e) = std::fs::create_dir_all(&runtime_dir) {
        eprintln!("[rhod] Error creando dir de shell integration: {}", e);
        return;
    }

    #[cfg(target_os = "macos")]
    {
        let zsh_integration = include_str!("../shell-integration/rhod.zsh");
        let _ = std::fs::write(runtime_dir.join("rhod.zsh"), zsh_integration);

        let zshrc = include_str!("../shell-integration/zshrc.template");
        let _ = std::fs::write(runtime_dir.join(".zshrc"), zshrc);

        let zprofile = include_str!("../shell-integration/zprofile.template");
        let _ = std::fs::write(runtime_dir.join(".zprofile"), zprofile);

        let zshenv = include_str!("../shell-integration/zshenv.template");
        let _ = std::fs::write(runtime_dir.join(".zshenv"), zshenv);

        // Extraer zsh-syntax-highlighting empaquetado en el binario
        let syh_dir = runtime_dir.join("zsh-syntax-highlighting");
        let main_hl_dir = syh_dir.join("highlighters/main");
        let _ = std::fs::create_dir_all(&main_hl_dir);

        let _ = std::fs::write(
            syh_dir.join("zsh-syntax-highlighting.zsh"),
            include_str!("../shell-integration/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh"),
        );
        let _ = std::fs::write(
            main_hl_dir.join("main-highlighter.zsh"),
            include_str!("../shell-integration/zsh-syntax-highlighting/highlighters/main/main-highlighter.zsh"),
        );
        let _ = std::fs::write(
            syh_dir.join(".version"),
            include_str!("../shell-integration/zsh-syntax-highlighting/.version"),
        );
        let _ = std::fs::write(
            syh_dir.join(".revision-hash"),
            include_str!("../shell-integration/zsh-syntax-highlighting/.revision-hash"),
        );

        if let Ok(orig) = std::env::var("ZDOTDIR") {
            cmd.env("_RHOD_ORIG_ZDOTDIR", orig);
        }
        cmd.env("ZDOTDIR", runtime_dir.to_string_lossy().to_string());
        cmd.env("RHOD_SHELL_DIR", runtime_dir.to_string_lossy().to_string());
        cmd.arg("-l");
    }

    #[cfg(target_os = "windows")]
    {
        let ps_integration = include_str!("../shell-integration/rhod.ps1");
        let ps_file = runtime_dir.join("rhod.ps1");
        let _ = std::fs::write(&ps_file, ps_integration);

        cmd.args([
            "-NoExit",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            &ps_file.to_string_lossy().to_string(),
        ]);
    }

    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    {
        let bash_integration = include_str!("../shell-integration/rhod.bash");
        let bash_file = runtime_dir.join("rhod.bash");
        let _ = std::fs::write(&bash_file, bash_integration);

        cmd.args(["--rcfile", &bash_file.to_string_lossy().to_string(), "-i"]);
    }
}

// 1. Iniciar sesión de terminal cross-platform (Windows: ConPTY, macOS/Linux: POSIX PTY)
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

    // Elegir el shell adecuado y robusto según el sistema operativo
    #[cfg(target_os = "windows")]
    let shell = {
        // En Windows se prefiere powershell.exe sobre cmd.exe, permitiendo override por entorno
        if let Ok(custom) = std::env::var("RHOD_SHELL").or_else(|_| std::env::var("SHELL")) {
            custom
        } else {
            "powershell.exe".to_string()
        }
    };

    #[cfg(target_os = "macos")]
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());

    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string());

    let mut cmd = CommandBuilder::new(&shell);
    setup_shell_integration(&mut cmd, &shell);

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

// 2. Enviar teclas a una sesión específica
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

// 3. Ajustar dimensiones de una sesión específica
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

// 4. Cerrar una sesión y liberar sus recursos
#[tauri::command]
fn close_pty(id: String, state: State<'_, PtyState>) -> Result<(), String> {
    let mut sessions = state.sessions.lock().map_err(|e| e.to_string())?;
    sessions.remove(&id);
    Ok(())
}

// 5. Obtener la ruta actual del proceso shell de la pestaña por su PID (macOS, Linux y Windows)
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

            #[cfg(target_os = "windows")]
            {
                // En Windows, retornamos el directorio de usuario si el proceso está activo
                if let Ok(profile) = std::env::var("USERPROFILE") {
                    return Ok(profile);
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
    os: String,
    home: String,
}

// Helper para crear comandos sin parpadeo de ventana de consola en Windows (GUI app)
fn create_silent_command(program: &str) -> std::process::Command {
    #[allow(unused_mut)]
    let mut cmd = std::process::Command::new(program);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}

// 6. Obtener el contexto de sistema, Git y SO para la ruta consultada
#[tauri::command]
fn get_context(path: Option<String>) -> SystemContext {
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .unwrap_or_else(|_| "~".to_string());

    let cwd = path
        .filter(|p| !p.trim().is_empty())
        .unwrap_or_else(|| {
            std::env::current_dir()
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_else(|_| home.clone())
        });

    let git_branch = create_silent_command("git")
        .args(["-C", &cwd, "branch", "--show-current"])
        .output()
        .ok()
        .and_then(|out| String::from_utf8(out.stdout).ok())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "-".to_string());

    let node_version = create_silent_command("node")
        .arg("-v")
        .output()
        .ok()
        .and_then(|out| String::from_utf8(out.stdout).ok())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "-".to_string());

    #[cfg(target_os = "windows")]
    let shell = "powershell".to_string();

    #[cfg(target_os = "macos")]
    let shell = std::env::var("SHELL")
        .map(|s| s.rsplit('/').next().unwrap_or("zsh").to_string())
        .unwrap_or_else(|_| "zsh".to_string());

    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    let shell = std::env::var("SHELL")
        .map(|s| s.rsplit('/').next().unwrap_or("bash").to_string())
        .unwrap_or_else(|_| "bash".to_string());

    #[cfg(target_os = "macos")]
    let os = "macos".to_string();
    #[cfg(target_os = "windows")]
    let os = "windows".to_string();
    #[cfg(target_os = "linux")]
    let os = "linux".to_string();
    #[cfg(all(not(target_os = "macos"), not(target_os = "windows"), not(target_os = "linux")))]
    let os = "other".to_string();

    SystemContext {
        cwd,
        git_branch,
        node_version,
        shell,
        os,
        home,
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
