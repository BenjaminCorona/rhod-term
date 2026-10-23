import { Terminal as TerminalIcon, X } from "lucide-react";
import { TabItem as TabItemType } from "../../types";
import { hexToRgba } from "../../utils";

interface TabItemProps {
    tab: TabItemType;
    index: number;
    isActive: boolean;
    modSymbol: string;
    isDragging?: boolean;
    isNew?: boolean;
    isClosing?: boolean;
    style?: React.CSSProperties;
    onPointerDown?: (e: React.PointerEvent<HTMLDivElement>) => void;
    onContextMenu?: (e: React.MouseEvent<HTMLDivElement>) => void;
    onSelect: () => void;
    onClose: (e: React.MouseEvent) => void;
}

export function TabItem({
    tab,
    index,
    isActive,
    modSymbol,
    isDragging = false,
    isNew = false,
    isClosing = false,
    style,
    onPointerDown,
    onContextMenu,
    onSelect,
    onClose,
}: TabItemProps) {
    const isNumbered = index < 9;

    const customColorStyles: React.CSSProperties = tab.color
        ? ({
              "--tab-custom-color": tab.color,
              "--tab-custom-bg": hexToRgba(tab.color, isActive ? 0.22 : 0.08),
          } as React.CSSProperties)
        : {};

    const combinedStyle: React.CSSProperties = {
        ...style,
        ...customColorStyles,
    };

    return (
        <div
            className={`tab-item ${isActive ? "active" : ""} ${
                isDragging ? "is-dragging" : ""
            } ${tab.color ? "has-custom-color" : ""} ${
                isNew ? "is-new-tab" : ""
            } ${isClosing ? "is-closing" : ""}`}
            style={combinedStyle}
            draggable={false}
            onDragStart={(e) => e.preventDefault()}
            onPointerDown={onPointerDown}
            onContextMenu={onContextMenu}
            onClick={onSelect}
            title={`Pestaña ${index + 1} (${modSymbol}${index + 1}) • Clic derecho para cambiar color`}
        >
            <TerminalIcon
                size={12}
                className="tab-icon"
                style={tab.color ? { color: tab.color } : undefined}
            />
            {tab.color && (
                <span
                    className="tab-color-dot"
                    style={{ backgroundColor: tab.color }}
                />
            )}
            <span className="tab-name">{tab.title}</span>
            {isNumbered && (
                <span className="tab-shortcut-badge">
                    {modSymbol}
                    {index + 1}
                </span>
            )}
            <button
                type="button"
                className="tab-close-btn"
                onPointerDown={(e) => e.stopPropagation()}
                onContextMenu={(e) => e.stopPropagation()}
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
