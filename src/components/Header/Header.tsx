import { Plus } from "lucide-react";
import { TabItem as TabItemType } from "../../types";
import { TabItem } from "./TabItem";

interface HeaderProps {
    tabs: TabItemType[];
    activeTabId: string;
    appVersion: string;
    modSymbol: string;
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
    onSelectTab,
    onCloseTab,
    onAddTab,
    onCopyVersion,
}: HeaderProps) {
    return (
        <header className="app-header">
            <div className="tabs-container">
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

            <div className="header-right">
                <span
                    className="header-version"
                    onClick={onCopyVersion}
                    title="Versión de Rhod (clic para copiar)"
                >
                    v{appVersion}
                </span>
            </div>
        </header>
    );
}
