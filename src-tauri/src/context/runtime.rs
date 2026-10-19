use super::platform::create_silent_command;

/// Inspector del entorno de ejecución, herramientas instaladas y sistema operativo
pub struct RuntimeInspector;

impl RuntimeInspector {
    /// Consulta la versión de Node.js instalada en el sistema
    pub fn get_node_version() -> String {
        create_silent_command("node")
            .arg("-v")
            .output()
            .ok()
            .and_then(|out| String::from_utf8(out.stdout).ok())
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| "-".to_string())
    }

    /// Identifica el nombre del shell activo
    pub fn get_shell_name() -> String {
        #[cfg(target_os = "windows")]
        {
            "powershell".to_string()
        }

        #[cfg(target_os = "macos")]
        {
            std::env::var("SHELL")
                .map(|s| s.rsplit('/').next().unwrap_or("zsh").to_string())
                .unwrap_or_else(|_| "zsh".to_string())
        }

        #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
        {
            std::env::var("SHELL")
                .map(|s| s.rsplit('/').next().unwrap_or("bash").to_string())
                .unwrap_or_else(|_| "bash".to_string())
        }
    }

    /// Identifica el identificador del sistema operativo
    pub fn get_os_name() -> String {
        #[cfg(target_os = "macos")]
        {
            "macos".to_string()
        }
        #[cfg(target_os = "windows")]
        {
            "windows".to_string()
        }
        #[cfg(target_os = "linux")]
        {
            "linux".to_string()
        }
        #[cfg(all(not(target_os = "macos"), not(target_os = "windows"), not(target_os = "linux")))]
        {
            "other".to_string()
        }
    }

    /// Resuelve el directorio home del usuario de forma cross-platform
    pub fn get_user_home() -> String {
        std::env::var("HOME")
            .or_else(|_| std::env::var("USERPROFILE"))
            .unwrap_or_else(|_| "~".to_string())
    }
}
