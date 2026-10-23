import React from "react";
import { ChevronRight, ChevronDown } from "lucide-react";
import { TabGroup } from "../../types";
import { hexToRgba } from "../../utils";

interface TabGroupPillProps {
    group: TabGroup;
    tabCount: number;
    onToggleCollapse: () => void;
    onContextMenu: (e: React.MouseEvent) => void;
}

export function TabGroupPill({
    group,
    tabCount,
    onToggleCollapse,
    onContextMenu,
}: TabGroupPillProps) {
    const bg = hexToRgba(group.color, 0.18);
    const border = hexToRgba(group.color, 0.40);

    return (
        <div
            className={`tab-group-pill ${group.collapsed ? "collapsed" : "expanded"}`}
            style={{
                backgroundColor: bg,
                borderColor: border,
            }}
            onClick={onToggleCollapse}
            onContextMenu={onContextMenu}
            title={`Grupo: ${group.title} (${tabCount} pestañas) • Clic para ${
                group.collapsed ? "expandir" : "colapsar"
            } • Clic derecho para opciones`}
        >
            <span
                className="group-pill-dot"
                style={{ backgroundColor: group.color }}
            />
            <span className="group-pill-title">{group.title}</span>

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
