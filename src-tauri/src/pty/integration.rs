use portable_pty::CommandBuilder;
use std::path::PathBuf;
use std::sync::Once;

static INTEGRATION_INIT: Once = Once::new();

/// Directorio temporal donde se almacenan los scripts y plantillas de integración de shell
pub fn get_runtime_dir() -> PathBuf {
    std::env::temp_dir().join("rhod-shell")
}

/// Extrae las plantillas y scripts integrados en el binario una sola vez durante el ciclo de vida
pub fn ensure_shell_assets_extracted() {
    INTEGRATION_INIT.call_once(|| {
        let runtime_dir = get_runtime_dir();
        if let Err(e) = std::fs::create_dir_all(&runtime_dir) {
            eprintln!("[rhod] Error creando dir de shell integration: {e}");
            return;
        }

        #[cfg(target_os = "macos")]
        {
            let _ = std::fs::write(runtime_dir.join("rhod.zsh"), include_str!("../../shell-integration/rhod.zsh"));
            let _ = std::fs::write(runtime_dir.join(".zshrc"), include_str!("../../shell-integration/zshrc.template"));
            let _ = std::fs::write(runtime_dir.join(".zprofile"), include_str!("../../shell-integration/zprofile.template"));
            let _ = std::fs::write(runtime_dir.join(".zshenv"), include_str!("../../shell-integration/zshenv.template"));

            let syh_dir = runtime_dir.join("zsh-syntax-highlighting");
            let main_hl_dir = syh_dir.join("highlighters/main");
            let _ = std::fs::create_dir_all(&main_hl_dir);

            let _ = std::fs::write(
                syh_dir.join("zsh-syntax-highlighting.zsh"),
                include_str!("../../shell-integration/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh"),
            );
            let _ = std::fs::write(
                main_hl_dir.join("main-highlighter.zsh"),
                include_str!("../../shell-integration/zsh-syntax-highlighting/highlighters/main/main-highlighter.zsh"),
            );
            let _ = std::fs::write(
                syh_dir.join(".version"),
                include_str!("../../shell-integration/zsh-syntax-highlighting/.version"),
            );
            let _ = std::fs::write(
                syh_dir.join(".revision-hash"),
                include_str!("../../shell-integration/zsh-syntax-highlighting/.revision-hash"),
            );
        }

        #[cfg(target_os = "windows")]
        {
            let ps_file = runtime_dir.join("rhod.ps1");
            let _ = std::fs::write(&ps_file, include_str!("../../shell-integration/rhod.ps1"));
        }

        #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
        {
            let bash_file = runtime_dir.join("rhod.bash");
            let _ = std::fs::write(&bash_file, include_str!("../../shell-integration/rhod.bash"));
        }
    });
}

/// Inyecta variables de entorno, rutas al PATH y argumentos de integración de shell
pub fn setup_shell_integration(cmd: &mut CommandBuilder, _shell: &str) {
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");
    cmd.env("FORCE_COLOR", "3");
    cmd.env("CLICOLOR", "1");
    cmd.env("LSCOLORS", "exfxcxdxbxegedabagacad");
    cmd.env("RHOD_TERMINAL", "1");

    // Asegurar que herramientas de desarrollo (Cargo, Homebrew) estén en PATH
    if let Ok(current_path) = std::env::var("PATH") {
        let home = std::env::var("HOME").unwrap_or_default();
        let cargo_bin = format!("{}/.cargo/bin", home);
        let extra_paths = format!("{}:/opt/homebrew/bin:/usr/local/bin:{}", cargo_bin, current_path);
        cmd.env("PATH", extra_paths);
    }

    let runtime_dir = get_runtime_dir();

    #[cfg(target_os = "macos")]
    {
        if let Ok(orig) = std::env::var("ZDOTDIR") {
            cmd.env("_RHOD_ORIG_ZDOTDIR", orig);
        }
        cmd.env("ZDOTDIR", runtime_dir.to_string_lossy().to_string());
        cmd.env("RHOD_SHELL_DIR", runtime_dir.to_string_lossy().to_string());
        cmd.arg("-l");
    }

    #[cfg(target_os = "windows")]
    {
        let ps_file = runtime_dir.join("rhod.ps1");
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
        let bash_file = runtime_dir.join("rhod.bash");
        cmd.args(["--rcfile", &bash_file.to_string_lossy().to_string(), "-i"]);
    }
}
