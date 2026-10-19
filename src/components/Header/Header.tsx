import { Plus } from "lucide-react";
import { TabItem as TabItemType } from "../../types";
import { TabItem } from "./TabItem";
import { WindowControls } from "./WindowControls";

interface HeaderProps {
    tabs: TabItemType[];
    activeTabId: string;
    appVersion: string;
    modSymbol: string;
    isMac: boolean;
    onSelectTab: (id: string) => void;
    onCloseTab: (id: string, e: React.MouseEvent) => void;
    onAddTab: () => void;
    onCopyVersion: () => void;
}

export function Header({
    tabs,
    activeTabId,
    appVersion,
    modSymbol,
    isMac,
    onSelectTab,
    onCloseTab,
    onAddTab,
    onCopyVersion,
}: HeaderProps) {
    return (
        <header className="app-header" data-tauri-drag-region>
            <div className="tabs-container" data-tauri-drag-region>
                {tabs.map((tab, idx) => (
                    <TabItem
                        key={tab.id}
                        tab={tab}
                        index={idx}
                        isActive={tab.id === activeTabId}
                        modSymbol={modSymbol}
                        onSelect={() => onSelectTab(tab.id)}
                        onClose={(e) => onCloseTab(tab.id, e)}
                    />
                ))}

                <button
                    type="button"
                    className="btn-new-tab"
                    onClick={onAddTab}
                    title={`Nueva pestaña (${modSymbol}T)`}
                >
                    <Plus size={13} />
                </button>
            </div>

            <div className="header-right" data-tauri-drag-region>
                <span
                    className="header-version"
                    onClick={onCopyVersion}
                    title="Versión de Rhod (clic para copiar)"
                >
                    v{appVersion}
                </span>

                {/* En Windows y Linux se renderizan los controles de ventana integrados a la derecha */}
                {!isMac && <WindowControls />}
            </div>
        </header>
    );
}
