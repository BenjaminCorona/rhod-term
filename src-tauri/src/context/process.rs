use crate::error::AppError;

/// Inspector de procesos para resolver rutas activas de pestañas
pub struct ProcessInspector;

impl ProcessInspector {
    /// Resuelve el directorio de trabajo actual (CWD) de un proceso dado su PID
    pub fn get_process_cwd(pid: u32) -> Result<String, AppError> {
        #[cfg(target_os = "macos")]
        {
            let output = std::process::Command::new("lsof")
                .args(["-a", "-p", &pid.to_string(), "-d", "cwd", "-Fn"])
                .output()?;

            let text = String::from_utf8_lossy(&output.stdout);
            for line in text.lines() {
                if let Some(path) = line.strip_prefix('n').filter(|p| !p.is_empty()) {
                    return Ok(path.to_string());
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
            if let Ok(profile) = std::env::var("USERPROFILE") {
                return Ok(profile);
            }
        }

        Err(AppError::PathUnavailable)
    }
}
