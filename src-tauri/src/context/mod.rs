pub mod git;
pub mod platform;
pub mod process;
pub mod runtime;

use git::GitInspector;
use runtime::RuntimeInspector;
use serde::Serialize;

/// Modelo de datos con la telemetría del sistema expuesta al frontend
#[derive(Debug, Clone, Serialize)]
pub struct SystemContext {
    pub cwd: String,
    pub git_branch: String,
    pub node_version: String,
    pub shell: String,
    pub os: String,
    pub home: String,
}

/// Servicio para agrupar y coordinar la extracción de contexto del sistema
pub struct ContextService;

impl ContextService {
    pub fn collect_system_context(requested_path: Option<String>) -> SystemContext {
        let home = RuntimeInspector::get_user_home();
        let cwd = requested_path
            .filter(|p| !p.trim().is_empty())
            .unwrap_or_else(|| {
                std::env::current_dir()
                    .map(|p| p.to_string_lossy().to_string())
                    .unwrap_or_else(|_| home.clone())
            });

        let git_branch = GitInspector::get_current_branch(&cwd);
        let node_version = RuntimeInspector::get_node_version();
        let shell = RuntimeInspector::get_shell_name();
        let os = RuntimeInspector::get_os_name();

        SystemContext {
            cwd,
            git_branch,
            node_version,
            shell,
            os,
            home,
        }
    }
}
