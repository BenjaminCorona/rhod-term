import { Terminal as TerminalIcon, X } from "lucide-react";
import { TabItem as TabItemType } from "../../types";

interface TabItemProps {
    tab: TabItemType;
    index: number;
    isActive: boolean;
    modSymbol: string;
    onSelect: () => void;
    onClose: (e: React.MouseEvent) => void;
}

export function TabItem({
    tab,
    index,
    isActive,
    modSymbol,
    onSelect,
    onClose,
}: TabItemProps) {
    const isNumbered = index < 9;

    return (
        <div
            className={`tab-item ${isActive ? "active" : ""}`}
            onClick={onSelect}
            title={`Pestaña ${index + 1} (${modSymbol}${index + 1})`}
        >
            <TerminalIcon size={12} className="tab-icon" />
            <span className="tab-name">{tab.title}</span>
            {isNumbered && (
                <span className="tab-shortcut-badge">{modSymbol}{index + 1}</span>
            )}
            <button
                type="button"
                className="tab-close-btn"
                onClick={onClose}
                title={`Cerrar pestaña (${modSymbol}W)`}
                aria-label="Cerrar pestaña"
            >
                <X size={11} />
            </button>
        </div>
    );
}
