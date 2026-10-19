use super::platform::create_silent_command;

/// Inspector para consultar metadatos de Git en un directorio dado
pub struct GitInspector;

impl GitInspector {
    /// Determina la rama actual de git en el directorio indicado o '-' si no es un repo o falla
    pub fn get_current_branch(cwd: &str) -> String {
        create_silent_command("git")
            .args(["-C", cwd, "branch", "--show-current"])
            .output()
            .ok()
            .and_then(|out| String::from_utf8(out.stdout).ok())
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| "-".to_string())
    }
}
