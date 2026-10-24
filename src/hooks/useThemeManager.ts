import { useState, useEffect, useCallback } from "react";
import { AVAILABLE_THEMES } from "../constants";
import { loadConfig, saveConfigDebounced } from "../services/storage";

export function useThemeManager(showToast: (msg: string) => void) {
    const [themeIndex, setThemeIndex] = useState<number>(() => {
        const saved = localStorage.getItem("rhod_theme_id");
        const idx = AVAILABLE_THEMES.findIndex((t) => t.id === saved);
        return idx >= 0 ? idx : 0;
    });

    // Cargar y sincronizar tema desde ~/.rhod/config.json al montar
    useEffect(() => {
        loadConfig().then((cfg) => {
            if (cfg && cfg.theme_id) {
                const idx = AVAILABLE_THEMES.findIndex((t) => t.id === cfg.theme_id);
                if (idx >= 0) {
                    setThemeIndex(idx);
                }
            }
        });
    }, []);

    const currentTheme = AVAILABLE_THEMES[themeIndex] || AVAILABLE_THEMES[0];

    // Aplicar variables CSS al elemento raíz del DOM cuando cambia el tema
    useEffect(() => {
        const root = document.documentElement;
        const { ui } = currentTheme;

        root.style.setProperty("--bg-canvas", ui.bgCanvas);
        root.style.setProperty("--bg-surface", ui.bgSurface);
        root.style.setProperty("--bg-surface-elevated", ui.bgSurfaceElevated);
        root.style.setProperty("--bg-hover", ui.bgHover);
        root.style.setProperty("--border-subtle", ui.borderSubtle);
        root.style.setProperty("--border-medium", ui.borderMedium);
        root.style.setProperty("--text-main", ui.textMain);
        root.style.setProperty("--text-secondary", ui.textSecondary);
        root.style.setProperty("--text-muted", ui.textMuted);
        root.style.setProperty("--accent", ui.accent);
    }, [currentTheme]);

    const handleCycleTheme = useCallback(() => {
        setThemeIndex((prev) => {
            const next = (prev + 1) % AVAILABLE_THEMES.length;
            const theme = AVAILABLE_THEMES[next];
            saveConfigDebounced({ theme_id: theme.id });
            showToast(`Tema: ${theme.name}`);
            return next;
        });
    }, [showToast]);

    const handleSelectTheme = useCallback((themeId: string) => {
        const idx = AVAILABLE_THEMES.findIndex((t) => t.id === themeId);
        if (idx >= 0) {
            setThemeIndex(idx);
            const theme = AVAILABLE_THEMES[idx];
            saveConfigDebounced({ theme_id: theme.id });
            showToast(`Tema: ${theme.name}`);
        }
    }, [showToast]);

    return {
        currentTheme,
        handleCycleTheme,
        handleSelectTheme,
        availableThemes: AVAILABLE_THEMES,
    };
}
