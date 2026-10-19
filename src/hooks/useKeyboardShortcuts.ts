import { useEffect, useMemo, useCallback } from "react";
import { ShortcutItem, TerminalHandle } from "../types";

interface KeyboardShortcutsParams {
    modSymbol: string;
    isMac: boolean;
    activeTabId: string;
    tabsCount: number;
    tabRefs: React.MutableRefObject<Record<string, TerminalHandle | null>>;
    onAddTab: () => void;
    onCloseTab: (id: string) => void;
    onSelectTab: (index: number) => void;
    onTogglePalette: () => void;
    onClosePalette: () => void;
    onZoomIn: () => void;
    onZoomOut: () => void;
    onZoomReset: () => void;
    onCycleFont: () => void;
    showToast: (msg: string) => void;
}

export function useKeyboardShortcuts({
    modSymbol,
    isMac,
    activeTabId,
    tabsCount,
    tabRefs,
    onAddTab,
    onCloseTab,
    onSelectTab,
    onTogglePalette,
    onClosePalette,
    onZoomIn,
    onZoomOut,
    onZoomReset,
    onCycleFont,
    showToast,
}: KeyboardShortcutsParams) {
    const handleClear = useCallback(() => {
        tabRefs.current[activeTabId]?.clear();
        showToast("Pantalla limpia");
    }, [activeTabId, tabRefs, showToast]);

    const handleRestart = useCallback(() => {
        tabRefs.current[activeTabId]?.restart();
        showToast("Sesión reiniciada");
    }, [activeTabId, tabRefs, showToast]);

    const handleCopy = useCallback(() => {
        const text = tabRefs.current[activeTabId]?.getSelectionOrCwd();
        if (text) {
            navigator.clipboard.writeText(text);
            showToast("Copiado al portapapeles");
        }
    }, [activeTabId, tabRefs, showToast]);

    const handlePaste = useCallback(async () => {
        try {
            const text = await navigator.clipboard.readText();
            if (text) {
                tabRefs.current[activeTabId]?.sendRaw(text);
                showToast("Pegado");
            }
        } catch {
            // Ignorar restricciones de portapapeles
        }
    }, [activeTabId, tabRefs, showToast]);

    const handleInterrupt = useCallback(() => {
        tabRefs.current[activeTabId]?.sendRaw("\x03");
        showToast("Interrumpido (Ctrl+C)");
    }, [activeTabId, tabRefs, showToast]);

    const shortcutsCatalog: ShortcutItem[] = useMemo(() => [
        {
            id: "zoom-in",
            keys: [modSymbol, "+"],
            label: "Aumentar fuente",
            desc: "Agranda el texto de la terminal",
            category: "Terminal",
            actionType: "zoom-in",
        },
        {
            id: "zoom-out",
            keys: [modSymbol, "-"],
            label: "Disminuir fuente",
            desc: "Reduce el tamaño del texto de la terminal",
            category: "Terminal",
            actionType: "zoom-out",
        },
        {
            id: "zoom-reset",
            keys: [modSymbol, "0"],
            label: "Restablecer fuente",
            desc: "Restaura el tamaño por defecto (13.5px)",
            category: "Terminal",
            actionType: "zoom-reset",
        },
        {
            id: "change-font",
            keys: [modSymbol, "Shift", "F"],
            label: "Cambiar tipografía",
            desc: "Alterna entre JetBrains Mono, Geist Mono y Sistema",
            category: "Terminal",
            actionType: "change-font",
        },
        {
            id: "new-tab",
            keys: [modSymbol, "T"],
            label: "Nueva pestaña",
            desc: "Abre una nueva sesión de terminal independiente",
            category: "Pestañas",
            actionType: "new-tab",
        },
        {
            id: "close-tab",
            keys: [modSymbol, "W"],
            label: "Cerrar pestaña",
            desc: "Cierra la pestaña y termina el shell actual",
            category: "Pestañas",
            actionType: "close-tab",
        },
        {
            id: "switch-tab",
            keys: [modSymbol, "1..9"],
            label: "Cambiar de pestaña",
            desc: "Salta directamente a la pestaña correspondiente",
            category: "Pestañas",
        },
        {
            id: "open-shortcuts",
            keys: [modSymbol, "K"],
            label: "Menú de atajos",
            desc: "Abre o cierra esta ventana con todos los atajos",
            category: "Navegación",
        },
        {
            id: "copy",
            keys: isMac ? ["⌘", "C"] : ["Ctrl", "Shift", "C"],
            label: "Copiar selección",
            desc: isMac
                ? "Copia la selección o la ruta al portapapeles"
                : "Copia la selección al portapapeles (Ctrl+Shift+C)",
            category: "Terminal",
            actionType: "copy",
        },
        {
            id: "paste",
            keys: isMac ? ["⌘", "V"] : ["Ctrl", "Shift", "V"],
            label: "Pegar portapapeles",
            desc: isMac
                ? "Pega el contenido del portapapeles en el shell"
                : "Pega el texto en la terminal (Ctrl+Shift+V)",
            category: "Terminal",
            actionType: "paste",
        },
        {
            id: "clear",
            keys: ["Ctrl", "L"],
            label: "Limpiar pantalla",
            desc: "Limpia el buffer visible de la terminal activa",
            category: "Terminal",
            actionType: "clear",
        },
        {
            id: "interrupt",
            keys: ["Ctrl", "C"],
            label: "Interrumpir proceso",
            desc: "Envía señal SIGINT al proceso en ejecución",
            category: "Terminal",
            actionType: "interrupt",
        },
        {
            id: "restart",
            keys: [modSymbol, "R"],
            label: "Reiniciar sesión",
            desc: "Reinicia el shell de la pestaña activa",
            category: "Terminal",
            actionType: "restart",
        },
        {
            id: "autocomplete",
            keys: ["Tab"],
            label: "Autocompletar",
            desc: "Completa comandos, carpetas y nombres de archivo",
            category: "Terminal",
        },
        {
            id: "history",
            keys: ["↑", "↓"],
            label: "Historial de comandos",
            desc: "Navega por los comandos ejecutados recientemente",
            category: "Navegación",
        },
    ], [modSymbol, isMac]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const isCmdOrCtrl = e.metaKey || e.ctrlKey;
            const key = e.key.toLowerCase();

            // Zoom
            if (isCmdOrCtrl && (e.key === "+" || e.key === "=")) {
                e.preventDefault();
                onZoomIn();
                return;
            }

            if (isCmdOrCtrl && (e.key === "-" || e.key === "_")) {
                e.preventDefault();
                onZoomOut();
                return;
            }

            if (isCmdOrCtrl && e.key === "0") {
                e.preventDefault();
                onZoomReset();
                return;
            }

            // Pestañas
            if (isCmdOrCtrl && key === "t") {
                e.preventDefault();
                onAddTab();
                return;
            }

            if (isCmdOrCtrl && key === "w") {
                e.preventDefault();
                onCloseTab(activeTabId);
                return;
            }

            // Menú de atajos
            if (isCmdOrCtrl && key === "k") {
                e.preventDefault();
                onTogglePalette();
                return;
            }

            // Reiniciar
            if (isCmdOrCtrl && key === "r") {
                e.preventDefault();
                handleRestart();
                return;
            }

            // Cambiar fuente con atajo
            if (isCmdOrCtrl && e.shiftKey && key === "f") {
                e.preventDefault();
                onCycleFont();
                return;
            }

            // Copiar / Pegar cross-platform
            if (
                (isMac && e.metaKey && key === "c" && tabRefs.current[activeTabId]?.hasSelection()) ||
                (!isMac && e.ctrlKey && e.shiftKey && key === "c")
            ) {
                e.preventDefault();
                handleCopy();
                return;
            }

            if (
                (isMac && e.metaKey && key === "v") ||
                (!isMac && e.ctrlKey && e.shiftKey && key === "v")
            ) {
                e.preventDefault();
                handlePaste();
                return;
            }

            // Cambio rápido de pestaña con número 1..9
            if (isCmdOrCtrl && /^[1-9]$/.test(e.key)) {
                const index = parseInt(e.key, 10) - 1;
                if (index < tabsCount) {
                    e.preventDefault();
                    onSelectTab(index);
                }
                return;
            }

            if (e.key === "Escape") {
                onClosePalette();
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [
        tabsCount,
        activeTabId,
        isMac,
        tabRefs,
        onZoomIn,
        onZoomOut,
        onZoomReset,
        onCycleFont,
        onAddTab,
        onCloseTab,
        onSelectTab,
        onTogglePalette,
        onClosePalette,
        handleRestart,
        handleCopy,
        handlePaste,
    ]);

    return {
        shortcutsCatalog,
        handleClear,
        handleRestart,
        handleCopy,
        handlePaste,
        handleInterrupt,
    };
}
