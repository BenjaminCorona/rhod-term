import React from "react";
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
    isMultiSelected?: boolean;
    isBusy?: boolean;
    isGroupCollapsed?: boolean;
    isBundleLeader?: boolean;
    isBundleFollower?: boolean;
    dragBundleCount?: number;
    isUnbundling?: boolean;
    unbundleIndex?: number;
    groupColor?: string;
    groupTitle?: string;
    style?: React.CSSProperties;
    onPointerDown?: (e: React.PointerEvent<HTMLDivElement>) => void;
    onContextMenu?: (e: React.MouseEvent<HTMLDivElement>) => void;
    onSelect: (e: React.MouseEvent) => void;
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
    isMultiSelected = false,
    isBusy: _isBusy = false,
    isGroupCollapsed = false,
    isBundleLeader = false,
    isBundleFollower = false,
    dragBundleCount,
    isUnbundling = false,
    unbundleIndex = 0,
    groupColor,
    groupTitle,
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

    const unbundleStyle = isUnbundling
        ? ({ "--unbundle-index": unbundleIndex } as React.CSSProperties)
        : {};

    const combinedStyle: React.CSSProperties = {
        ...style,
        ...customColorStyles,
        ...unbundleStyle,
    };

    return (
        <div
            className={`tab-item tabs-track-item ${isActive ? "active" : ""} ${
                isDragging ? "is-dragging" : ""
            } ${tab.color ? "has-custom-color" : ""} ${
                isNew ? "is-new-tab" : ""
            } ${isClosing ? "is-closing" : ""} ${
                isMultiSelected ? "is-multi-selected" : ""
            } ${groupColor ? "tab-in-group" : ""} ${
                isGroupCollapsed ? "is-group-collapsed" : ""
            } ${isBundleLeader ? "is-bundle-leader" : ""} ${
                isBundleFollower ? "is-bundle-follower" : ""
            } ${isUnbundling ? "is-unbundling" : ""}`}
            style={combinedStyle}
            draggable={false}
            onDragStart={(e) => e.preventDefault()}
            onPointerDown={onPointerDown}
            onContextMenu={onContextMenu}
            onClick={onSelect}
            title={
                groupTitle
                    ? `Pestaña ${index + 1} (${modSymbol}${index + 1}) • Grupo: "${groupTitle}" • Shift/Cmd+Clic para seleccionar varias`
                    : `Pestaña ${index + 1} (${modSymbol}${index + 1}) • Clic derecho para opciones • Shift/Cmd+Clic para seleccionar varias`
            }
        >
            {/* Indicador visual de pertenencia a grupo: barra de acento superior con el color del grupo */}
            {groupColor && (
                <div
                    className="tab-group-indicator-bar"
                    style={{ backgroundColor: groupColor }}
                />
            )}

            {/* Barra de acento inferior para pestañas seleccionadas en bloque */}
            {isMultiSelected && (
                <div className="tab-multi-select-indicator" />
            )}

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
            {isBundleLeader && dragBundleCount && dragBundleCount > 1 ? (
                <span className="tab-bundle-badge" title={`${dragBundleCount} pestañas en movimiento`}>
                    {dragBundleCount} pestañas
                </span>
            ) : isMultiSelected ? (
                <span className="tab-multi-selected-badge" title="Pestaña seleccionada en bloque (Shift/Cmd)">
                    ✓
                </span>
            ) : null}
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
                title={
                    isMultiSelected
                        ? `Cerrar pestañas seleccionadas (${modSymbol}W)`
                        : `Cerrar pestaña (${modSymbol}W)`
                }
                aria-label="Cerrar pestaña"
            >
                <X size={11} />
            </button>
        </div>
    );
}
