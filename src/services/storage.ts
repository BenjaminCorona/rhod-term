import { invoke } from "@tauri-apps/api/core";
import { TabItem, TabGroup } from "../types";

export interface UserConfig {
    font_size: number;
    font_id: string;
    theme_id: string;
    prompt_editor_mode: boolean;
}

export interface SessionData {
    tabs: TabItem[];
    activeTabId: string;
    tabCwds: Record<string, string>;
    groups: TabGroup[];
}

let cachedConfig: UserConfig | null = null;
let saveConfigTimer: number | null = null;
let saveSessionTimer: number | null = null;

/**
 * Carga la configuración visual desde ~/.rhod/config.json.
 * Si el archivo no existe aún, migra de forma transparente desde localStorage.
 */
export async function loadConfig(): Promise<UserConfig | null> {
    try {
        const conf = await invoke<UserConfig | null>("load_config");
        if (conf) {
            if (conf.prompt_editor_mode === undefined) {
                conf.prompt_editor_mode = true;
            }
            cachedConfig = conf;
            return conf;
        }
    } catch (err) {
        console.warn("[Storage] Error al cargar config desde disco:", err);
    }

    // Migración transparente desde localStorage si existe
    try {
        const savedSize = localStorage.getItem("rhod_font_size");
        const savedFont = localStorage.getItem("rhod_font_id");
        const savedTheme = localStorage.getItem("rhod_theme_id");

        const savedEditor = localStorage.getItem("rhod_prompt_editor_mode");
        if (savedSize || savedFont || savedTheme || savedEditor !== null) {
            const migrated: UserConfig = {
                font_size: savedSize ? parseFloat(savedSize) || 14.0 : 14.0,
                font_id: savedFont || "meslo",
                theme_id: savedTheme || "rhod-dark",
                prompt_editor_mode: savedEditor !== null ? savedEditor === "true" : true,
            };
            cachedConfig = migrated;
            invoke("save_config", { config: migrated }).catch(console.error);
            return migrated;
        }
    } catch {
        // Ignorar
    }

    return null;
}

/**
 * Guarda la configuración visual en disco (~/.rhod/config.json) con debounce.
 */
export function saveConfigDebounced(updates: Partial<UserConfig>) {
    if (!cachedConfig) {
        cachedConfig = {
            font_size: 14.0,
            font_id: "meslo",
            theme_id: "rhod-dark",
            prompt_editor_mode: true,
        };
    }
    cachedConfig = { ...cachedConfig, ...updates };

    if (saveConfigTimer !== null) {
        window.clearTimeout(saveConfigTimer);
    }
    saveConfigTimer = window.setTimeout(() => {
        if (cachedConfig) {
            invoke("save_config", { config: cachedConfig }).catch(console.error);
        }
    }, 60);
}

/**
 * Carga la sesión completa desde ~/.rhod/session.json.
 * Si el archivo no existe aún, migra de forma transparente desde localStorage.
 */
export async function loadSession(): Promise<SessionData | null> {
    try {
        const session = await invoke<SessionData | null>("load_session");
        if (session && Array.isArray(session.tabs) && session.tabs.length > 0) {
            return session;
        }
    } catch (err) {
        console.warn("[Storage] Error al cargar sesión desde disco:", err);
    }

    // Migración transparente desde localStorage si existe
    try {
        const raw = localStorage.getItem("rhod_terminal_session");
        if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed.tabs) && parsed.tabs.length > 0) {
                const migrated: SessionData = {
                    tabs: parsed.tabs,
                    activeTabId: parsed.activeTabId || parsed.tabs[0].id,
                    tabCwds: parsed.tabCwds || {},
                    groups: parsed.groups || [],
                };
                invoke("save_session", { session: migrated }).catch(console.error);
                return migrated;
            }
        }
    } catch {
        // Ignorar
    }

    return null;
}

/**
 * Guarda la sesión completa en disco (~/.rhod/session.json) con debounce.
 */
export function saveSessionDebounced(session: SessionData) {
    if (saveSessionTimer !== null) {
        window.clearTimeout(saveSessionTimer);
    }
    saveSessionTimer = window.setTimeout(() => {
        invoke("save_session", { session }).catch(console.error);
    }, 80);
}
