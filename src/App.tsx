import { useState, useCallback } from "react";
import {
    useToast,
    useFontManager,
    useThemeManager,
    useSystemContext,
    useTerminalTabs,
    useKeyboardShortcuts,
    useAppUpdater,
} from "./hooks";
import {
    Header,
    TerminalContainer,
    StatusBar,
    SettingsModal,
    UpdateBanner,
    Toast,
} from "./components";
import { ShortcutItem } from "./types";
import { SettingsTab } from "./components/SettingsModal/SettingsModal";
import "./App.css";

export default function App() {
    const { toastMessage, showToast } = useToast();
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [settingsInitialTab, setSettingsInitialTab] = useState<SettingsTab>("temas");

    // 1. Gestión de pestañas y rutas CWD
    const {
        tabs,
        groups,
        activeTabId,
        selectedTabIds,
        closingTabIds,
        unbundlingTabIds,
        triggerUnbundleAnimation,
        tabRefs,
        tabCwds,
        setActiveTabId,
        handleSelectTabWithModifiers,
        handleAddTab,
        handleCloseTab,
        handleCloseTabs,
        handleCwdUpdate,
        handleReorderTabs,
        handleSetTabColor,
        handleCreateGroup,
        handleAssignTabToGroup,
        handleToggleGroupCollapsed,
        handleUpdateGroup,
        handleUngroupTabs,
        handleCloseGroup,
        handleReorderGroup,
        handleMoveGroupToIndex,
        handleUnifiedDrop,
    } = useTerminalTabs(showToast, (_tabId, cleanPath) => {
        refreshContext(cleanPath);
    });

    // 2. Telemetría de contexto y SO
    const {
        context,
        appVersion,
        isMac,
        modSymbol,
        refreshContext,
    } = useSystemContext(activeTabId, tabCwds[activeTabId]);

    // 3. Tipografía y zoom con persistencia en localStorage
    const {
        fontSize,
        currentFont,
        availableFonts,
        minFontSize,
        maxFontSize,
        defaultFontSize,
        handleCycleFont,
        handleSelectFont,
        handleSetFontSize,
        handleZoomIn,
        handleZoomOut,
        handleZoomReset,
    } = useFontManager(showToast);

    // 4. Catálogo de temas visuales y paletas ANSI con persistencia en localStorage
    const {
        currentTheme,
        availableThemes,
        handleCycleTheme,
        handleSelectTheme,
    } = useThemeManager(showToast);

    // 5. Sistema de actualizaciones automáticas
    const {
        status: updateStatus,
        newVersion,
        downloadProgress,
        checkForUpdates,
        downloadAndApplyUpdate,
        dismissUpdate,
    } = useAppUpdater(showToast);

    // 6. Apertura y control del Modal de Configuración
    const handleOpenSettings = useCallback((tab: SettingsTab = "temas") => {
        setSettingsInitialTab(tab);
        setSettingsOpen(true);
    }, []);

    const handleCloseSettings = useCallback(() => {
        setSettingsOpen(false);
    }, []);

    const handleSelectTabByIndex = useCallback(
        (index: number) => {
            if (tabs[index]) {
                setActiveTabId(tabs[index].id);
            }
        },
        [tabs, setActiveTabId]
    );

    // 7. Catálogo y escuchador de atajos de teclado
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
        selectedTabIds,
        tabsCount: tabs.length,
        tabRefs,
        onAddTab: handleAddTab,
        onCloseTab: (id) => handleCloseTab(id),
        onCloseTabs: handleCloseTabs,
        onSelectTab: handleSelectTabByIndex,
        onTogglePalette: (tab) => handleOpenSettings(tab || "atajos"),
        onClosePalette: handleCloseSettings,
        onZoomIn: handleZoomIn,
        onZoomOut: handleZoomOut,
        onZoomReset: handleZoomReset,
        onCycleFont: handleCycleFont,
        onCycleTheme: handleCycleTheme,
        showToast,
    });

    // 8. Ejecución interactiva desde el modal de atajos
    const handleExecuteShortcut = useCallback(
        (shortcut: ShortcutItem) => {
            switch (shortcut.actionType) {
                case "new-tab":
                    handleAddTab();
                    break;
                case "close-tab":
                    if (selectedTabIds && selectedTabIds.size > 1) {
                        handleCloseTabs(Array.from(selectedTabIds));
                    } else {
                        handleCloseTab(activeTabId);
                    }
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
                case "change-theme":
                    handleCycleTheme();
                    break;
            }
            setSettingsOpen(false);
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
            handleCycleTheme,
        ]
    );

    return (
        <div className={`app-layout platform-${context.os}`}>
            {/* 1. Header con pestañas y botón nueva pestaña */}
            <Header
                tabs={tabs}
                groups={groups}
                activeTabId={activeTabId}
                selectedTabIds={selectedTabIds}
                closingTabIds={closingTabIds}
                unbundlingTabIds={unbundlingTabIds}
                onTriggerUnbundleAnimation={triggerUnbundleAnimation}
                modSymbol={modSymbol}
                isMac={isMac}
                onSelectTab={setActiveTabId}
                onSelectTabWithModifiers={handleSelectTabWithModifiers}
                onCloseTab={handleCloseTab}
                onCloseTabs={handleCloseTabs}
                onAddTab={handleAddTab}
                onReorderTabs={handleReorderTabs}
                onSetTabColor={handleSetTabColor}
                onCreateGroup={handleCreateGroup}
                onAssignTabToGroup={handleAssignTabToGroup}
                onToggleGroupCollapsed={handleToggleGroupCollapsed}
                onUpdateGroup={handleUpdateGroup}
                onUngroupTabs={handleUngroupTabs}
                onCloseGroup={handleCloseGroup}
                onReorderGroup={handleReorderGroup}
                onMoveGroupToIndex={handleMoveGroupToIndex}
                onUnifiedDrop={handleUnifiedDrop}
            />

            {/* 2. Área principal de terminales con tema reactivo */}
            <TerminalContainer
                tabs={tabs}
                activeTabId={activeTabId}
                cwd={context.cwd}
                tabCwds={tabCwds}
                fontSize={fontSize}
                fontFamily={currentFont.family}
                theme={currentTheme.terminal}
                onCwdChange={handleCwdUpdate}
                tabRefs={tabRefs}
                onFocusActiveTab={() => tabRefs.current[activeTabId]?.focus()}
            />

            {/* 3. Barra de estado inferior conectada a Configuración */}
            <StatusBar
                appVersion={appVersion}
                sessionsCount={tabs.length}
                modSymbol={modSymbol}
                onCopyVersion={() => {
                    navigator.clipboard.writeText(`v${appVersion}`);
                    showToast(`Versión v${appVersion} copiada`);
                }}
                onOpenSettings={handleOpenSettings}
            />

            {/* 4. Modal unificado de Configuración (Temas, Tipografía & Zoom, Atajos, Actualizaciones) */}
            <SettingsModal
                isOpen={settingsOpen}
                initialTab={settingsInitialTab}
                appVersion={appVersion}
                modSymbol={modSymbol}
                currentTheme={currentTheme}
                availableThemes={availableThemes}
                onSelectTheme={handleSelectTheme}
                currentFont={currentFont}
                availableFonts={availableFonts}
                fontSize={fontSize}
                minFontSize={minFontSize}
                maxFontSize={maxFontSize}
                defaultFontSize={defaultFontSize}
                onSelectFont={handleSelectFont}
                onSetFontSize={handleSetFontSize}
                onResetZoom={handleZoomReset}
                shortcutsCatalog={shortcutsCatalog}
                onExecuteShortcut={handleExecuteShortcut}
                updateStatus={updateStatus}
                newVersion={newVersion}
                onCheckForUpdates={() => checkForUpdates(true)}
                onApplyUpdate={downloadAndApplyUpdate}
                onClose={handleCloseSettings}
            />

            {/* 5. Banner de actualización automática discreto */}
            <UpdateBanner
                status={updateStatus}
                newVersion={newVersion}
                downloadProgress={downloadProgress}
                onApplyUpdate={downloadAndApplyUpdate}
                onDismiss={dismissUpdate}
            />

            {/* 6. Notificación Toast */}
            <Toast message={toastMessage} />
        </div>
    );
}
