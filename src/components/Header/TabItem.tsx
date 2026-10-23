import { Terminal as TerminalIcon, X } from "lucide-react";
import { TabItem as TabItemType } from "../../types";

interface TabItemProps {
    tab: TabItemType;
    index: number;
    isActive: boolean;
    modSymbol: string;
    isDragging?: boolean;
    style?: React.CSSProperties;
    onPointerDown?: (e: React.PointerEvent<HTMLDivElement>) => void;
    onSelect: () => void;
    onClose: (e: React.MouseEvent) => void;
}

export function TabItem({
    tab,
    index,
    isActive,
    modSymbol,
    isDragging = false,
    style,
    onPointerDown,
    onSelect,
    onClose,
}: TabItemProps) {
    const isNumbered = index < 9;

    return (
        <div
            className={`tab-item ${isActive ? "active" : ""} ${isDragging ? "is-dragging" : ""}`}
            style={style}
            draggable={false}
            onDragStart={(e) => e.preventDefault()}
            onPointerDown={onPointerDown}
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
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                    e.stopPropagation();
                    onClose(e);
                }}
                title={`Cerrar pestaña (${modSymbol}W)`}
                aria-label="Cerrar pestaña"
            >
                <X size={11} />
            </button>
        </div>
    );
}
