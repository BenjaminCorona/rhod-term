use portable_pty::MasterPty;
use std::io::Write;

/// Representa una sesión activa de pseudo-terminal con sus descriptores de E/S y PID asociado
pub struct PtySession {
    pub writer: Box<dyn Write + Send>,
    pub master: Box<dyn MasterPty + Send>,
    pub pid: Option<u32>,
}
