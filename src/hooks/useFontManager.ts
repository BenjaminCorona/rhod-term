import { useState, useCallback } from "react";
import { AVAILABLE_FONTS, DEFAULT_FONT_SIZE, MIN_FONT_SIZE, MAX_FONT_SIZE } from "../constants";

const STORAGE_FONT_SIZE_KEY = "rhod_font_size";
const STORAGE_FONT_ID_KEY = "rhod_font_id";

export function useFontManager(showToast: (msg: string) => void) {
    const [fontSize, setFontSize] = useState<number>(() => {
        const saved = localStorage.getItem(STORAGE_FONT_SIZE_KEY);
        if (saved) {
            const parsed = parseFloat(saved);
            if (!isNaN(parsed) && parsed >= MIN_FONT_SIZE && parsed <= MAX_FONT_SIZE) {
                return parsed;
            }
        }
        return DEFAULT_FONT_SIZE;
    });

    const [fontIndex, setFontIndex] = useState<number>(() => {
        const saved = localStorage.getItem(STORAGE_FONT_ID_KEY);
        const idx = AVAILABLE_FONTS.findIndex((f) => f.id === saved);
        return idx >= 0 ? idx : 0;
    });

    const currentFont = AVAILABLE_FONTS[fontIndex] || AVAILABLE_FONTS[0];

    const handleCycleFont = useCallback(() => {
        setFontIndex((prev) => {
            const next = (prev + 1) % AVAILABLE_FONTS.length;
            const font = AVAILABLE_FONTS[next];
            localStorage.setItem(STORAGE_FONT_ID_KEY, font.id);
            showToast(`Fuente: ${font.name}`);
            return next;
        });
    }, [showToast]);

    const handleSelectFont = useCallback((fontId: string) => {
        const idx = AVAILABLE_FONTS.findIndex((f) => f.id === fontId);
        if (idx >= 0) {
            setFontIndex(idx);
            const font = AVAILABLE_FONTS[idx];
            localStorage.setItem(STORAGE_FONT_ID_KEY, font.id);
            showToast(`Fuente: ${font.name}`);
        }
    }, [showToast]);

    const handleSetFontSize = useCallback((size: number) => {
        const clamped = Math.min(Math.max(size, MIN_FONT_SIZE), MAX_FONT_SIZE);
        setFontSize(clamped);
        localStorage.setItem(STORAGE_FONT_SIZE_KEY, clamped.toString());
    }, []);

    const handleZoomIn = useCallback(() => {
        setFontSize((prev) => {
            const next = Math.min(prev + 1, MAX_FONT_SIZE);
            localStorage.setItem(STORAGE_FONT_SIZE_KEY, next.toString());
            showToast(`Tamaño de fuente: ${next}px`);
            return next;
        });
    }, [showToast]);

    const handleZoomOut = useCallback(() => {
        setFontSize((prev) => {
            const next = Math.max(prev - 1, MIN_FONT_SIZE);
            localStorage.setItem(STORAGE_FONT_SIZE_KEY, next.toString());
            showToast(`Tamaño de fuente: ${next}px`);
            return next;
        });
    }, [showToast]);

    const handleZoomReset = useCallback(() => {
        setFontSize(DEFAULT_FONT_SIZE);
        localStorage.setItem(STORAGE_FONT_SIZE_KEY, DEFAULT_FONT_SIZE.toString());
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
