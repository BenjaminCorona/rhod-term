import React from "react";
import { Layers, Terminal as TerminalIcon, X } from "lucide-react";
import { TabItem as TabItemType } from "../../types";

export interface BarItemBundle {
    type: "bundle";
    id: string;
    key: string;
    leadTab: TabItemType;
    tabs: TabItemType[];
    tabIds: string[];
    groupId?: string;
    isGroupCollapsed?: boolean;
    initialOffsets?: Record<string, number>;
}

interface TabBundleItemProps {
    bundle: BarItemBundle;
    isDragging: boolean;
    style?: React.CSSProperties;
    groupColor?: string;
    onPointerDown?: (e: React.PointerEvent<HTMLDivElement>) => void;
    onContextMenu?: (e: React.MouseEvent<HTMLDivElement>) => void;
    onClick: (e: React.MouseEvent) => void;
    onClose: (e: React.MouseEvent) => void;
}

export function TabBundleItem({
    bundle,
    isDragging = false,
    style,
    groupColor,
    onPointerDown,
    onContextMenu,
    onClick,
    onClose,
}: TabBundleItemProps) {
    const count = bundle.tabs.length;
    const titleText = `${count} pestañas`;

    return (
        <div
            className={`tab-item tab-bundle-item tabs-track-item ${
                isDragging ? "is-dragging" : ""
            } ${groupColor ? "tab-in-group" : ""}`}
            style={style}
            draggable={false}
            onDragStart={(e) => e.preventDefault()}
            onPointerDown={onPointerDown}
            onContextMenu={onContextMenu}
            onClick={onClick}
            title={`${count} pestañas seleccionadas • Arrastra para mover el bloque • Clic para desagrupar • Cmd+W para cerrar todas`}
        >
            {/* Animación física de fusión (~1s): las pestañas vuelan desde sus posiciones en la barra hacia la pestaña líder */}
            {bundle.tabs.map((tab, idx) => {
                if (tab.id === bundle.leadTab.id) return null;
                const offset = bundle.initialOffsets?.[tab.id] ?? 0;
                return (
                    <div
                        key={`fusing-${tab.id}`}
                        className="bundle-fusing-follower"
                        style={{
                            "--initial-offset-x": `${offset}px`,
                            "--tab-accent-color": tab.color || "#60a5fa",
                            zIndex: 10 - idx,
                        } as React.CSSProperties}
                    >
                        <TerminalIcon size={12} className="tab-icon" />
                        <span className="tab-name bundle-fusing-title">{tab.title}</span>
                    </div>
                );
            })}

            {/* Capas 3D de cartas apiladas con animación de colapso al formarse el lote */}
            <div className="bundle-stack-layer bundle-layer-back" />
            <div className="bundle-stack-layer bundle-layer-mid" />

            <div className="tab-bundle-content">
                {/* Indicador de pertenencia a grupo */}
                {groupColor && (
                    <div
                        className="tab-group-indicator-bar"
                        style={{ backgroundColor: groupColor }}
                    />
                )}

                {/* Icono de capas apiladas */}
                <Layers size={13} className="tab-bundle-icon" />

                {/* Título del paquete de pestañas */}
                <span className="tab-name tab-bundle-title">{titleText}</span>

                {/* Insignia con el conteo de pestañas */}
                <span className="tab-bundle-count-pill" title={`${count} pestañas agrupadas`}>
                    {count}
                </span>

                {/* Botón de cerrar todas las pestañas agrupadas */}
                <button
                    type="button"
                    className="tab-close-btn"
                    onPointerDown={(e) => e.stopPropagation()}
                    onContextMenu={(e) => e.stopPropagation()}
                    onClick={(e) => {
                        e.stopPropagation();
                        onClose(e);
                    }}
                    title="Cerrar bloque de pestañas (Cmd+W)"
                    aria-label="Cerrar bloque de pestañas"
                >
                    <X size={11} />
                </button>
            </div>
        </div>
    );
}
