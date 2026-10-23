import React from "react";
import { ChevronRight, ChevronDown } from "lucide-react";
import { TabGroup } from "../../types";
import { hexToRgba } from "../../utils";

interface TabGroupPillProps {
    group: TabGroup;
    tabCount: number;
    isDragging?: boolean;
    style?: React.CSSProperties;
    onToggleCollapse: () => void;
    onContextMenu: (e: React.MouseEvent) => void;
    onPointerDown?: (e: React.PointerEvent<HTMLDivElement>) => void;
}

export function TabGroupPill({
    group,
    tabCount,
    isDragging = false,
    style,
    onToggleCollapse,
    onContextMenu,
    onPointerDown,
}: TabGroupPillProps) {
    const bg = hexToRgba(group.color, 0.20);

    return (
        <div
            className={`tab-group-pill tabs-track-item ${group.collapsed ? "collapsed" : "expanded"} ${
                isDragging ? "is-dragging" : ""
            }`}
            style={{
                backgroundColor: bg,
                ...style,
            }}
            onClick={onToggleCollapse}
            onContextMenu={onContextMenu}
            draggable={false}
            onDragStart={(e) => e.preventDefault()}
            onPointerDown={onPointerDown}
            title={`Grupo: "${group.title}" (${tabCount} pestañas) • Clic para ${
                group.collapsed ? "expandir" : "colapsar"
            } • Arrastra para reordenar • Clic derecho para opciones`}
        >
            {/* Línea superior del color del grupo */}
            <div
                className="tab-group-top-bar"
                style={{ backgroundColor: group.color }}
            />

            {/* Título con el color de la pestaña */}
            <span
                className="group-pill-title"
                style={{ color: group.color }}
            >
                {group.title}
            </span>

            {group.collapsed ? (
                <>
                    <span className="group-pill-count">{tabCount}</span>
                    <ChevronRight size={10} className="group-pill-chevron" />
                </>
            ) : (
                <ChevronDown size={10} className="group-pill-chevron" />
            )}
        </div>
    );
}
