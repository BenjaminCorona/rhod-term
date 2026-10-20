import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

export function useVibrancyManager(showToast?: (msg: string) => void) {
    const [vibrancyEnabled, setVibrancyEnabled] = useState<boolean>(() => {
        const saved = localStorage.getItem("rhod_vibrancy_enabled");
        if (saved !== null) {
            return saved === "true";
        }
        return true;
    });

    const applyVibrancyState = useCallback((enabled: boolean) => {
        invoke("set_window_vibrancy", { enable: enabled }).catch((err) => {
            console.warn("No se pudo sincronizar el estado de vibrancy con el sistema:", err);
        });
    }, []);

    // Sincronizar con el backend nativo al montar y cuando cambie
    useEffect(() => {
        applyVibrancyState(vibrancyEnabled);
    }, [vibrancyEnabled, applyVibrancyState]);

    const handleToggleVibrancy = useCallback(() => {
        setVibrancyEnabled((prev) => {
            const next = !prev;
            localStorage.setItem("rhod_vibrancy_enabled", String(next));
            applyVibrancyState(next);
            if (showToast) {
                showToast(next ? "Efecto de cristal activado" : "Efecto de cristal desactivado");
            }
            return next;
        });
    }, [applyVibrancyState, showToast]);

    const handleSetVibrancy = useCallback(
        (enabled: boolean) => {
            setVibrancyEnabled(enabled);
            localStorage.setItem("rhod_vibrancy_enabled", String(enabled));
            applyVibrancyState(enabled);
            if (showToast) {
                showToast(enabled ? "Efecto de cristal activado" : "Efecto de cristal desactivado");
            }
        },
        [applyVibrancyState, showToast]
    );

    return {
        vibrancyEnabled,
        handleToggleVibrancy,
        handleSetVibrancy,
    };
}
