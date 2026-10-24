import { useState, useCallback, useEffect } from "react";
import { AVAILABLE_FONTS, DEFAULT_FONT_SIZE, MIN_FONT_SIZE, MAX_FONT_SIZE } from "../constants";
import { loadConfig, saveConfigDebounced } from "../services/storage";

export function useFontManager(showToast: (msg: string) => void) {
    const [fontSize, setFontSize] = useState<number>(() => {
        const saved = localStorage.getItem("rhod_font_size");
        if (saved) {
            const parsed = parseFloat(saved);
            if (!isNaN(parsed) && parsed >= MIN_FONT_SIZE && parsed <= MAX_FONT_SIZE) {
                return parsed;
            }
        }
        return DEFAULT_FONT_SIZE;
    });

    const [fontIndex, setFontIndex] = useState<number>(() => {
        const saved = localStorage.getItem("rhod_font_id");
        const idx = AVAILABLE_FONTS.findIndex((f) => f.id === saved);
        return idx >= 0 ? idx : 0;
    });

    // Cargar y sincronizar con ~/.rhod/config.json al montar
    useEffect(() => {
        loadConfig().then((cfg) => {
            if (cfg) {
                if (cfg.font_size && cfg.font_size >= MIN_FONT_SIZE && cfg.font_size <= MAX_FONT_SIZE) {
                    setFontSize(cfg.font_size);
                }
                if (cfg.font_id) {
                    const idx = AVAILABLE_FONTS.findIndex((f) => f.id === cfg.font_id);
                    if (idx >= 0) setFontIndex(idx);
                }
            }
        });
    }, []);

    const currentFont = AVAILABLE_FONTS[fontIndex] || AVAILABLE_FONTS[0];

    const handleCycleFont = useCallback(() => {
        setFontIndex((prev) => {
            const next = (prev + 1) % AVAILABLE_FONTS.length;
            const font = AVAILABLE_FONTS[next];
            saveConfigDebounced({ font_id: font.id });
            showToast(`Fuente: ${font.name}`);
            return next;
        });
    }, [showToast]);

    const handleSelectFont = useCallback((fontId: string) => {
        const idx = AVAILABLE_FONTS.findIndex((f) => f.id === fontId);
        if (idx >= 0) {
            setFontIndex(idx);
            const font = AVAILABLE_FONTS[idx];
            saveConfigDebounced({ font_id: font.id });
            showToast(`Fuente: ${font.name}`);
        }
    }, [showToast]);

    const handleSetFontSize = useCallback((size: number) => {
        const clamped = Math.min(Math.max(size, MIN_FONT_SIZE), MAX_FONT_SIZE);
        setFontSize(clamped);
        saveConfigDebounced({ font_size: clamped });
    }, []);

    const handleZoomIn = useCallback(() => {
        setFontSize((prev) => {
            const next = Math.min(prev + 1, MAX_FONT_SIZE);
            saveConfigDebounced({ font_size: next });
            showToast(`Tamaño de fuente: ${next}px`);
            return next;
        });
    }, [showToast]);

    const handleZoomOut = useCallback(() => {
        setFontSize((prev) => {
            const next = Math.max(prev - 1, MIN_FONT_SIZE);
            saveConfigDebounced({ font_size: next });
            showToast(`Tamaño de fuente: ${next}px`);
            return next;
        });
    }, [showToast]);

    const handleZoomReset = useCallback(() => {
        setFontSize(DEFAULT_FONT_SIZE);
        saveConfigDebounced({ font_size: DEFAULT_FONT_SIZE });
        showToast(`Tamaño restablecido: ${DEFAULT_FONT_SIZE}px`);
    }, [showToast]);

    return {
        fontSize,
        currentFont,
        availableFonts: AVAILABLE_FONTS,
        minFontSize: MIN_FONT_SIZE,
        maxFontSize: MAX_FONT_SIZE,
        defaultFontSize: DEFAULT_FONT_SIZE,
        handleCycleFont,
        handleSelectFont,
        handleSetFontSize,
        handleZoomIn,
        handleZoomOut,
        handleZoomReset,
    };
}
