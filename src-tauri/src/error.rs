use std::fmt;

/// Errores de dominio tipados para el backend de Rhod
#[derive(Debug)]
pub enum AppError {
    Pty(String),
    SessionNotFound(String),
    LockError(String),
    Io(std::io::Error),
    PathUnavailable,
}

impl fmt::Display for AppError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Pty(msg) => write!(f, "Error en PTY: {msg}"),
            Self::SessionNotFound(id) => write!(f, "Sesión no encontrada: {id}"),
            Self::LockError(msg) => write!(f, "Error de sincronización de estado: {msg}"),
            Self::Io(err) => write!(f, "Error de E/S: {err}"),
            Self::PathUnavailable => write!(f, "Ruta no disponible"),
        }
    }
}

impl std::error::Error for AppError {}

// Serialización transparente a String para mantener compatibilidad IPC con Tauri
impl serde::Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

impl From<std::io::Error> for AppError {
    fn from(err: std::io::Error) -> Self {
        Self::Io(err)
    }
}

impl<T> From<std::sync::PoisonError<T>> for AppError {
    fn from(err: std::sync::PoisonError<T>) -> Self {
        Self::LockError(err.to_string())
    }
}
