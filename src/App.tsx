import { useState, useCallback } from "react";
import {
    useToast,
    useFontManager,
    useSystemContext,
    useTerminalTabs,
    useKeyboardShortcuts,
} from "./hooks";
import {
    Header,
    TerminalContainer,
    StatusBar,
    ShortcutsModal,
    Toast,
} from "./components";
import { ShortcutItem } from "./types";
import "./App.css";

export default function App() {
    const { toastMessage, showToast } = useToast();
    const [paletteOpen, setPaletteOpen] = useState(false);

    // 1. Gestión de pestañas y rutas CWD
    const {
        tabs,
        activeTabId,
        tabRefs,
        tabCwds,
        setActiveTabId,
        handleAddTab,
        handleCloseTab,
        handleCwdUpdate,
    } = useTerminalTabs(showToast, (_tabId, cleanPath) => {
        refreshContext(cleanPath);
    });

    // 2. Telemetría de contexto y SO
    const {
        context,
        appVersion,
        isMac,
        modSymbol,
        displayPath,
        refreshContext,
    } = useSystemContext(activeTabId, tabCwds[activeTabId]);

    // 3. Tipografía y zoom
    const {
        fontSize,
        currentFont,
        handleCycleFont,
        handleZoomIn,
        handleZoomOut,
        handleZoomReset,
    } = useFontManager(showToast);

    // 4. Manejo de estado del modal de atajos
    const handleTogglePalette = useCallback(() => {
        setPaletteOpen((prev) => !prev);
    }, []);

    const handleClosePalette = useCallback(() => {
        setPaletteOpen(false);
    }, []);

    const handleSelectTabByIndex = useCallback(
        (index: number) => {
            if (tabs[index]) {
                setActiveTabId(tabs[index].id);
            }
        },
        [tabs, setActiveTabId]
    );

    // 5. Catálogo y escuchador de atajos de teclado
    const {
        shortcutsCatalog,
        handleClear,
        handleRestart,
        handleCopy,
        handlePaste,
        handleInterrupt,
    } = useKeyboardShortcuts({
        modSymbol,
        isMac,
        activeTabId,
        tabsCount: tabs.length,
        tabRefs,
        onAddTab: handleAddTab,
        onCloseTab: (id) => handleCloseTab(id),
        onSelectTab: handleSelectTabByIndex,
        onTogglePalette: handleTogglePalette,
        onClosePalette: handleClosePalette,
        onZoomIn: handleZoomIn,
        onZoomOut: handleZoomOut,
        onZoomReset: handleZoomReset,
        onCycleFont: handleCycleFont,
        showToast,
    });

    // 6. Ejecución interactiva desde el modal de atajos
    const handleExecuteShortcut = useCallback(
        (shortcut: ShortcutItem) => {
            switch (shortcut.actionType) {
                case "new-tab":
                    handleAddTab();
                    break;
                case "close-tab":
                    handleCloseTab(activeTabId);
                    break;
                case "clear":
                    handleClear();
                    break;
                case "restart":
                    handleRestart();
                    break;
                case "copy":
                    handleCopy();
                    break;
                case "paste":
                    handlePaste();
                    break;
                case "interrupt":
                    handleInterrupt();
                    break;
                case "zoom-in":
                    handleZoomIn();
                    break;
                case "zoom-out":
                    handleZoomOut();
                    break;
                case "zoom-reset":
                    handleZoomReset();
                    break;
                case "change-font":
                    handleCycleFont();
                    break;
            }
            setPaletteOpen(false);
        },
        [
            activeTabId,
            handleAddTab,
            handleCloseTab,
            handleClear,
            handleRestart,
            handleCopy,
            handlePaste,
            handleInterrupt,
            handleZoomIn,
            handleZoomOut,
            handleZoomReset,
            handleCycleFont,
        ]
    );

    return (
        <div className="app-layout">
            {/* 1. Header con pestañas y botón nueva pestaña */}
            <Header
                tabs={tabs}
                activeTabId={activeTabId}
                appVersion={appVersion}
                modSymbol={modSymbol}
                onSelectTab={setActiveTabId}
                onCloseTab={handleCloseTab}
                onAddTab={handleAddTab}
                onCopyVersion={() => {
                    navigator.clipboard.writeText(`v${appVersion}`);
                    showToast(`Versión v${appVersion} copiada`);
                }}
            />

            {/* 2. Área principal de terminales */}
            <TerminalContainer
                tabs={tabs}
                activeTabId={activeTabId}
                cwd={context.cwd}
                fontSize={fontSize}
                fontFamily={currentFont.family}
                onCwdChange={handleCwdUpdate}
                tabRefs={tabRefs}
                onFocusActiveTab={() => tabRefs.current[activeTabId]?.focus()}
            />

            {/* 3. Barra de estado inferior */}
            <StatusBar
                context={context}
                displayPath={displayPath}
                appVersion={appVersion}
                currentFont={currentFont}
                fontSize={fontSize}
                sessionsCount={tabs.length}
                modSymbol={modSymbol}
                onCopyPath={() => {
                    navigator.clipboard.writeText(context.cwd);
                    showToast("Ruta copiada");
                }}
                onGitStatus={() => {
                    tabRefs.current[activeTabId]?.executeCommand("git status");
                    showToast("git status");
                }}
                onOpenPalette={handleTogglePalette}
                onCopyVersion={() => {
                    navigator.clipboard.writeText(`v${appVersion}`);
                    showToast(`Versión v${appVersion} copiada`);
                }}
                onCycleFont={handleCycleFont}
                onResetZoom={handleZoomReset}
            />

            {/* 4. Modal de atajos de teclado */}
            <ShortcutsModal
                isOpen={paletteOpen}
                appVersion={appVersion}
                shortcutsCatalog={shortcutsCatalog}
                onClose={handleClosePalette}
                onExecuteShortcut={handleExecuteShortcut}
            />

            {/* 5. Notificación Toast */}
            <Toast message={toastMessage} />
        </div>
    );
}
