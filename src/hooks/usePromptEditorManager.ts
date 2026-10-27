import { useState, useEffect, useCallback } from "react";
import { loadConfig, saveConfigDebounced } from "../services/storage";

export function usePromptEditorManager(showToast?: (msg: string) => void) {
    const [promptEditorMode, setPromptEditorMode] = useState<boolean>(() => {
        try {
            const saved = localStorage.getItem("rhod_prompt_editor_mode");
            if (saved !== null) {
                return saved === "true";
            }
        } catch {}
        return true;
    });

    // Cargar y sincronizar con ~/.rhod/config.json al montar
    useEffect(() => {
        loadConfig().then((cfg) => {
            if (cfg && typeof cfg.prompt_editor_mode === "boolean") {
                setPromptEditorMode(cfg.prompt_editor_mode);
                try {
                    localStorage.setItem("rhod_prompt_editor_mode", String(cfg.prompt_editor_mode));
                } catch {}
            }
        });
    }, []);

    const handleTogglePromptEditorMode = useCallback(() => {
        setPromptEditorMode((prev) => {
            const next = !prev;
            try {
                localStorage.setItem("rhod_prompt_editor_mode", String(next));
            } catch {}
            saveConfigDebounced({ prompt_editor_mode: next });
            if (showToast) {
                showToast(next ? "Modo Editor activado" : "Modo Clásico TTY activado");
            }
            return next;
        });
    }, [showToast]);

    const handleSetPromptEditorMode = useCallback((enabled: boolean) => {
        setPromptEditorMode(enabled);
        try {
            localStorage.setItem("rhod_prompt_editor_mode", String(enabled));
        } catch {}
        saveConfigDebounced({ prompt_editor_mode: enabled });
        if (showToast) {
            showToast(enabled ? "Modo Editor activado" : "Modo Clásico TTY activado");
        }
    }, [showToast]);

    return {
        promptEditorMode,
        handleTogglePromptEditorMode,
        handleSetPromptEditorMode,
    };
}
