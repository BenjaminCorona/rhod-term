use crate::error::AppError;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

/// Estructura de configuración visual del usuario (fuente, tema, zoom)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserConfig {
    pub font_size: f32,
    pub font_id: String,
    pub theme_id: String,
}

impl Default for UserConfig {
    fn default() -> Self {
        Self {
            font_size: 14.0,
            font_id: "meslo".to_string(),
            theme_id: "rhod-dark".to_string(),
        }
    }
}

/// Representación de una pestaña individual para persistencia
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TabItemData {
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub cwd: Option<String>,
    #[serde(default)]
    pub color: Option<String>,
    #[serde(default, rename = "groupId")]
    pub group_id: Option<String>,
}

/// Representación de un grupo de pestañas
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TabGroupData {
    pub id: String,
    pub title: String,
    pub color: String,
    #[serde(default)]
    pub collapsed: Option<bool>,
}

/// Estructura completa de sesión persistente (pestañas, grupos, rutas)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionData {
    pub tabs: Vec<TabItemData>,
    #[serde(rename = "activeTabId")]
    pub active_tab_id: String,
    #[serde(default, rename = "tabCwds")]
    pub tab_cwds: HashMap<String, String>,
    #[serde(default)]
    pub groups: Vec<TabGroupData>,
}

impl Default for SessionData {
    fn default() -> Self {
        Self {
            tabs: vec![TabItemData {
                id: "term-1".to_string(),
                title: "terminal 1".to_string(),
                cwd: None,
                color: None,
                group_id: None,
            }],
            active_tab_id: "term-1".to_string(),
            tab_cwds: HashMap::new(),
            groups: Vec::new(),
        }
    }
}

/// Obtiene el directorio base de usuario ($HOME en Unix, %USERPROFILE% en Windows)
fn get_user_home() -> Option<PathBuf> {
    std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from)
}

/// Ruta de la carpeta .rhod (~/.rhod)
fn get_rhod_dir() -> Option<PathBuf> {
    get_user_home().map(|h| h.join(".rhod"))
}

/// Ruta del archivo de configuración (~/.rhod/config.json)
fn get_config_file_path() -> Option<PathBuf> {
    get_rhod_dir().map(|d| d.join("config.json"))
}

/// Ruta del archivo de sesión (~/.rhod/session.json)
fn get_session_file_path() -> Option<PathBuf> {
    get_rhod_dir().map(|d| d.join("session.json"))
}

/// Carga la configuración visual desde ~/.rhod/config.json
#[tauri::command]
pub fn load_config() -> Result<Option<UserConfig>, AppError> {
    let Some(path) = get_config_file_path() else {
        return Ok(None);
    };
    if !path.exists() {
        return Ok(None);
    }
    let content = fs::read_to_string(&path)?;
    let config: UserConfig = serde_json::from_str(&content)
        .map_err(|e| AppError::Pty(format!("Error parsing config.json: {e}")))?;
    Ok(Some(config))
}

/// Guarda la configuración visual en ~/.rhod/config.json de forma atómica
#[tauri::command]
pub fn save_config(config: UserConfig) -> Result<(), AppError> {
    let Some(path) = get_config_file_path() else {
        return Err(AppError::PathUnavailable);
    };
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let json = serde_json::to_string_pretty(&config)
        .map_err(|e| AppError::Pty(format!("Error serializing config: {e}")))?;
    fs::write(&path, json)?;
    Ok(())
}

/// Carga la sesión (pestañas, grupos, rutas) desde ~/.rhod/session.json
#[tauri::command]
pub fn load_session() -> Result<Option<SessionData>, AppError> {
    let Some(path) = get_session_file_path() else {
        return Ok(None);
    };
    if !path.exists() {
        return Ok(None);
    }
    let content = fs::read_to_string(&path)?;
    let session: SessionData = serde_json::from_str(&content)
        .map_err(|e| AppError::Pty(format!("Error parsing session.json: {e}")))?;
    Ok(Some(session))
}

/// Guarda la sesión en ~/.rhod/session.json de forma atómica
#[tauri::command]
pub fn save_session(session: SessionData) -> Result<(), AppError> {
    let Some(path) = get_session_file_path() else {
        return Err(AppError::PathUnavailable);
    };
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let json = serde_json::to_string_pretty(&session)
        .map_err(|e| AppError::Pty(format!("Error serializing session: {e}")))?;
    fs::write(&path, json)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_config_serialization() {
        let config = UserConfig::default();
        let json = serde_json::to_string(&config).unwrap();
        let deserialized: UserConfig = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.font_size, 14.0);
        assert_eq!(deserialized.font_id, "meslo");
        assert_eq!(deserialized.theme_id, "rhod-dark");
    }

    #[test]
    fn test_session_serialization() {
        let mut session = SessionData::default();
        session.tab_cwds.insert("term-1".to_string(), "/tmp".to_string());
        let json = serde_json::to_string(&session).unwrap();
        let deserialized: SessionData = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.tabs.len(), 1);
        assert_eq!(deserialized.active_tab_id, "term-1");
        assert_eq!(deserialized.tab_cwds.get("term-1").unwrap(), "/tmp");
    }
}
