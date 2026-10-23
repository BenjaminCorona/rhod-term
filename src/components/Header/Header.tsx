import { useState, useRef, useCallback } from "react";
import { Plus } from "lucide-react";
import { TabItem as TabItemType } from "../../types";
import { TabItem } from "./TabItem";
import { TabColorMenu } from "./TabColorMenu";
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
    onReorderTabs: (fromIndex: number, toIndex: number) => void;
    onCopyVersion: () => void;
    onSetTabColor?: (id: string, color: string | undefined) => void;
}

interface DragState {
    dragIndex: number;
    startX: number;
    deltaX: number;
    isDragging: boolean;
    tabRects: Array<{ left: number; right: number; width: number; center: number }>;
    draggedWidth: number;
    gap: number;
    targetIndex: number;
    minDelta: number;
    maxDelta: number;
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
    onReorderTabs,
    onCopyVersion,
    onSetTabColor,
}: HeaderProps) {
    const tabsContainerRef = useRef<HTMLDivElement>(null);
    const [dragState, setDragState] = useState<DragState | null>(null);
    const [colorMenu, setColorMenu] = useState<{
        tabId: string;
        x: number;
        y: number;
    } | null>(null);
    const dragStateRef = useRef<DragState | null>(null);

    const handlePointerDown = useCallback(
        (index: number, e: React.PointerEvent<HTMLDivElement>) => {
            // Cerrar menú de color si estuviera abierto
            setColorMenu(null);

            // Solo botón primario del ratón
            if (e.button !== 0) return;

            // Evitar selección accidental de texto en WebKit/macOS
            window.getSelection()?.removeAllRanges();

            const container = tabsContainerRef.current;
            if (!container) return;

            const tabElements = Array.from(
                container.querySelectorAll<HTMLElement>(".tab-item")
            );
            if (!tabElements[index]) return;

            const containerRect = container.getBoundingClientRect();
            const rects = tabElements.map((el) => {
                const r = el.getBoundingClientRect();
                return {
                    left: r.left,
                    right: r.right,
                    width: r.width,
                    center: r.left + r.width / 2,
                };
            });

            const gap =
                rects.length > 1 ? Math.max(0, rects[1].left - rects[0].right) : 4;
            const draggedWidth = rects[index].width;
            const minDelta = containerRect.left - rects[index].left;
            const maxDelta = containerRect.right - rects[index].right;

            const initialDragState: DragState = {
                dragIndex: index,
                startX: e.clientX,
                deltaX: 0,
                isDragging: false,
                tabRects: rects,
                draggedWidth,
                gap,
                targetIndex: index,
                minDelta,
                maxDelta,
            };

            dragStateRef.current = initialDragState;
            setDragState(initialDragState);

            const handlePointerMove = (moveEvent: PointerEvent) => {
                const state = dragStateRef.current;
                if (!state) return;

                const rawDelta = moveEvent.clientX - state.startX;

                // Umbral de 4px para no estorbar clics normales
                if (!state.isDragging && Math.abs(rawDelta) > 4) {
                    state.isDragging = true;
                    document.body.classList.add("dragging-tabs");
                    window.getSelection()?.removeAllRanges();
                }

                if (state.isDragging) {
                    moveEvent.preventDefault();
                    window.getSelection()?.removeAllRanges();

                    // Contener el desplazamiento dentro del área visible de pestañas
                    const clampedDelta = Math.max(
                        state.minDelta,
                        Math.min(state.maxDelta, rawDelta)
                    );
                    state.deltaX = clampedDelta;

                    const draggedCenter =
                        state.tabRects[state.dragIndex].center + clampedDelta;
                    let target = state.targetIndex;

                    // Hacia la derecha: debe cruzar el centro de la pestaña adyacente a su derecha
                    while (
                        target < state.tabRects.length - 1 &&
                        draggedCenter > state.tabRects[target + 1].center
                    ) {
                        target++;
                    }

                    // Hacia la izquierda: debe cruzar el centro de la pestaña adyacente a su izquierda
                    while (
                        target > 0 &&
                        draggedCenter < state.tabRects[target - 1].center
                    ) {
                        target--;
                    }

                    state.targetIndex = target;
                    setDragState({ ...state });
                }
            };

            const handlePointerUp = () => {
                const state = dragStateRef.current;
                window.removeEventListener("pointermove", handlePointerMove);
                window.removeEventListener("pointerup", handlePointerUp);
                window.removeEventListener("pointercancel", handlePointerUp);

                document.body.classList.remove("dragging-tabs");
                window.getSelection()?.removeAllRanges();

                if (state) {
                    if (state.isDragging && state.targetIndex !== state.dragIndex) {
                        onReorderTabs(state.dragIndex, state.targetIndex);
                    }
                }

                dragStateRef.current = null;
                setDragState(null);
            };

            window.addEventListener("pointermove", handlePointerMove);
            window.addEventListener("pointerup", handlePointerUp);
            window.addEventListener("pointercancel", handlePointerUp);
        },
        [onReorderTabs]
    );

    return (
        <header className="app-header" data-tauri-drag-region>
            <div
                ref={tabsContainerRef}
                className={`tabs-container ${
                    dragState?.isDragging ? "has-dragging" : ""
                }`}
                data-tauri-drag-region
            >
                {tabs.map((tab, idx) => {
                    let tabStyle: React.CSSProperties = {
                        transform: "translate3d(0, 0, 0)",
                        transition: "transform 0.22s cubic-bezier(0.16, 1, 0.3, 1)",
                    };
                    const isBeingDragged =
                        Boolean(dragState?.isDragging) &&
                        dragState?.dragIndex === idx;

                    if (dragState?.isDragging) {
                        if (isBeingDragged) {
                            tabStyle = {
                                transform: `translate3d(${dragState.deltaX}px, 0, 0) scale(1.02)`,
                                zIndex: 50,
                                transition: "none",
                                pointerEvents: "none",
                            };
                        } else {
                            let shiftX = 0;
                            if (dragState.targetIndex > dragState.dragIndex) {
                                if (
                                    idx > dragState.dragIndex &&
                                    idx <= dragState.targetIndex
                                ) {
                                    shiftX = -(
                                        dragState.draggedWidth + dragState.gap
                                    );
                                }
                            } else if (
                                dragState.targetIndex < dragState.dragIndex
                            ) {
                                if (
                                    idx >= dragState.targetIndex &&
                                    idx < dragState.dragIndex
                                ) {
                                    shiftX = +(
                                        dragState.draggedWidth + dragState.gap
                                    );
                                }
                            }

                            tabStyle = {
                                transform: `translate3d(${shiftX}px, 0, 0)`,
                                transition:
                                    "transform 0.22s cubic-bezier(0.16, 1, 0.3, 1)",
                                zIndex: 1,
                            };
                        }
                    }

                    return (
                        <TabItem
                            key={tab.id}
                            tab={tab}
                            index={idx}
                            isActive={tab.id === activeTabId}
                            modSymbol={modSymbol}
                            isDragging={isBeingDragged}
                            style={tabStyle}
                            onPointerDown={(e) => handlePointerDown(idx, e)}
                            onContextMenu={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                if (dragState?.isDragging) return;
                                setColorMenu({
                                    tabId: tab.id,
                                    x: e.clientX,
                                    y: e.clientY,
                                });
                            }}
                            onSelect={() => onSelectTab(tab.id)}
                            onClose={(e) => {
                                if (colorMenu?.tabId === tab.id) {
                                    setColorMenu(null);
                                }
                                onCloseTab(tab.id, e);
                            }}
                        />
                    );
                })}

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

            {colorMenu && onSetTabColor && (
                <TabColorMenu
                    tab={tabs.find((t) => t.id === colorMenu.tabId) || tabs[0]}
                    position={{ x: colorMenu.x, y: colorMenu.y }}
                    onClose={() => setColorMenu(null)}
                    onSelectColor={(color) => {
                        onSetTabColor(colorMenu.tabId, color);
                    }}
                />
            )}
        </header>
    );
}
