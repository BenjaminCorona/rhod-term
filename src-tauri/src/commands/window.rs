use tauri::Manager;
use tauri::window::{Effect, EffectState, EffectsBuilder};

#[tauri::command]
pub fn set_window_vibrancy(enable: bool, app: tauri::AppHandle) -> Result<(), String> {
    for window in app.webview_windows().values() {
        if enable {
            #[cfg(target_os = "macos")]
            {
                let effects = EffectsBuilder::new()
                    .effect(Effect::UnderWindowBackground)
                    .state(EffectState::Active)
                    .build();
                let _ = window.set_effects(effects);
            }
        } else {
            let _ = window.set_effects(None);
        }
    }
    let _ = (enable, app);
    Ok(())
}
