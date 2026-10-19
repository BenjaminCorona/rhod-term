use crate::error::AppError;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserConfig {
    pub font_size: f32,
    pub font_family: String,
}

impl Default for UserConfig {
    fn default() -> Self {
        Self {
            font_size: 14.0,
            font_family: "MesloLGS NF".to_string(),
        }
    }
}
