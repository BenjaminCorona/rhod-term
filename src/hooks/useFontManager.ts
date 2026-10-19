import { useState, useCallback } from "react";
import { AVAILABLE_FONTS, DEFAULT_FONT_SIZE, MIN_FONT_SIZE, MAX_FONT_SIZE } from "../constants";

export function useFontManager(showToast: (msg: string) => void) {
    const [fontSize, setFontSize] = useState<number>(DEFAULT_FONT_SIZE);
    const [fontIndex, setFontIndex] = useState<number>(() => {
        const saved = localStorage.getItem("rhod_font_id");
        const idx = AVAILABLE_FONTS.findIndex((f) => f.id === saved);
        return idx >= 0 ? idx : 0;
    });

    const currentFont = AVAILABLE_FONTS[fontIndex] || AVAILABLE_FONTS[0];

    const handleCycleFont = useCallback(() => {
        setFontIndex((prev) => {
            const next = (prev + 1) % AVAILABLE_FONTS.length;
            const font = AVAILABLE_FONTS[next];
            localStorage.setItem("rhod_font_id", font.id);
            showToast(`Fuente: ${font.name}`);
            return next;
        });
    }, [showToast]);

    const handleZoomIn = useCallback(() => {
        setFontSize((prev) => {
            const next = Math.min(prev + 1, MAX_FONT_SIZE);
            showToast(`Tamaño de fuente: ${next}px`);
            return next;
        });
    }, [showToast]);

    const handleZoomOut = useCallback(() => {
        setFontSize((prev) => {
            const next = Math.max(prev - 1, MIN_FONT_SIZE);
            showToast(`Tamaño de fuente: ${next}px`);
            return next;
        });
    }, [showToast]);

    const handleZoomReset = useCallback(() => {
        setFontSize(DEFAULT_FONT_SIZE);
        showToast(`Tamaño de fuente restablecido: ${DEFAULT_FONT_SIZE}px`);
    }, [showToast]);

    return {
        fontSize,
        currentFont,
        handleCycleFont,
        handleZoomIn,
        handleZoomOut,
        handleZoomReset,
    };
}
