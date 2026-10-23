import React, { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { Plus, ChevronLeft, ChevronRight } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { TabItem as TabItemType, TabGroup } from "../../types";
import { TabItem } from "./TabItem";
import { TabColorMenu } from "./TabColorMenu";
import { TabGroupPill } from "./TabGroupPill";
import { GroupContextMenu } from "./GroupContextMenu";
import { WindowControls } from "./WindowControls";

interface HeaderProps {
    tabs: TabItemType[];
    groups?: TabGroup[];
    activeTabId: string;
    selectedTabIds?: Set<string>;
    appVersion: string;
    modSymbol: string;
    isMac: boolean;
    onSelectTab: (id: string) => void;
    onSelectTabWithModifiers?: (
        id: string,
        e: { shiftKey?: boolean; metaKey?: boolean; ctrlKey?: boolean }
    ) => void;
    onCloseTab: (id: string, e: React.MouseEvent) => void;
    onCloseTabs?: (ids: string[]) => void;
    onAddTab: () => void;
    onReorderTabs: (fromIndex: number, toIndex: number) => void;
    onUnifiedDrop?: (
        from: { type: "tab" | "group"; id: string },
        to: { type: "tab" | "group"; id: string },
        isMovingRight: boolean
    ) => void;
    onCopyVersion: () => void;
    onSetTabColor?: (ids: string | string[], color: string | undefined) => void;
    onCreateGroup?: (ids: string | string[], title: string, color: string) => void;
    onAssignTabToGroup?: (ids: string | string[], groupId?: string) => void;
    onToggleGroupCollapsed?: (groupId: string) => void;
    onUpdateGroup?: (groupId: string, title: string, color: string) => void;
    onUngroupTabs?: (groupId: string) => void;
    onCloseGroup?: (groupId: string) => void;
    onReorderGroup?: (groupId: string, direction: "left" | "right") => void;
    onMoveGroupToIndex?: (groupId: string, targetIndex: number) => void;
    closingTabIds?: Set<string>;
}

interface DragState {
    dragIndex: number;
    startX: number;
    deltaX: number;
    isDragging: boolean;
    rects: Array<{ left: number; right: number; width: number; center: number }>;
    draggedWidth: number;
    gap: number;
    targetIndex: number;
    minDelta: number;
    maxDelta: number;
}

interface BarItemTab {
    type: "tab";
    id: string;
    key: string;
    tab: TabItemType;
    groupId?: string;
    isGroupCollapsed?: boolean;
}

interface BarItemGroup {
    type: "group";
    id: string;
    key: string;
    groupId: string;
    group: TabGroup;
    tabCount: number;
}

type BarItem = BarItemTab | BarItemGroup;

export function Header({
    tabs,
    groups = [],
    activeTabId,
    selectedTabIds = new Set(),
    appVersion,
    modSymbol,
    isMac,
    onSelectTab,
    onSelectTabWithModifiers,
    onCloseTab,
    onCloseTabs,
    onAddTab,
    onReorderTabs,
    onUnifiedDrop,
    onCopyVersion,
    onSetTabColor,
    onCreateGroup,
    onAssignTabToGroup,
    onToggleGroupCollapsed,
    onUpdateGroup,
    onUngroupTabs,
    onCloseGroup,
    onReorderGroup,
    onMoveGroupToIndex: _onMoveGroupToIndex,
    closingTabIds,
}: HeaderProps) {
    const tabsContainerRef = useRef<HTMLDivElement>(null);
    const [dragState, setDragState] = useState<DragState | null>(null);
    const dragStateRef = useRef<DragState | null>(null);

    const [colorMenu, setColorMenu] = useState<{
        tabId: string;
        x: number;
        y: number;
    } | null>(null);
    const [groupMenu, setGroupMenu] = useState<{
        group: TabGroup;
        x: number;
        y: number;
    } | null>(null);

    // Estructura lineal unificada de elementos en la barra (pestañas y pastillas de grupos)
    const barItems = useMemo<BarItem[]>(() => {
        const items: BarItem[] = [];
        const renderedPillIds = new Set<string>();

        tabs.forEach((tab) => {
            if (tab.groupId && !renderedPillIds.has(tab.groupId)) {
                renderedPillIds.add(tab.groupId);
                const g = groups.find((gr) => gr.id === tab.groupId);
                if (g) {
                    const count = tabs.filter((t) => t.groupId === g.id).length;
                    items.push({
                        type: "group",
                        id: g.id,
                        key: `pill-${g.id}`,
                        groupId: g.id,
                        group: g,
                        tabCount: count,
                    });
                }
            }

            const g = tab.groupId ? groups.find((gr) => gr.id === tab.groupId) : null;
            const isCollapsed = Boolean(g?.collapsed);

            items.push({
                type: "tab",
                id: tab.id,
                key: `tab-${tab.id}`,
                tab,
                groupId: tab.groupId,
                isGroupCollapsed: isCollapsed,
            });
        });

        return items;
    }, [tabs, groups]);

    // Elementos visibles actualmente en el track (excluye pestañas dentro de grupos colapsados)
    const visibleBarItems = useMemo<BarItem[]>(() => {
        return barItems.filter((item) => {
            if (item.type === "group") return true;
            return !item.isGroupCollapsed;
        });
    }, [barItems]);

    // Detección sutil de apertura de nueva pestaña para animación estilo Apple
    const [newTabId, setNewTabId] = useState<string | null>(null);
    const isInitialRender = useRef(true);
    const prevTabsLength = useRef(tabs.length);

    // Estados y funciones del carrusel responsivo
    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(false);

    const updateScrollState = useCallback(() => {
        const el = tabsContainerRef.current;
        if (!el) return;
        const maxScroll = el.scrollWidth - el.clientWidth;
        setCanScrollLeft(el.scrollLeft > 4);
        setCanScrollRight(el.scrollLeft < maxScroll - 4);
    }, []);

    useEffect(() => {
        const el = tabsContainerRef.current;
        if (!el) return;

        updateScrollState();
        el.addEventListener("scroll", updateScrollState, { passive: true });

        const resizeObserver = new ResizeObserver(() => {
            updateScrollState();
        });
        resizeObserver.observe(el);

        window.addEventListener("resize", updateScrollState);

        // Scroll horizontal nativo con la bolita del ratón (deltaY -> scrollLeft)
        const handleWheel = (e: WheelEvent) => {
            if (el.scrollWidth > el.clientWidth) {
                if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
                    e.preventDefault();
                    el.scrollLeft += e.deltaY;
                }
            }
        };

        el.addEventListener("wheel", handleWheel, { passive: false });

        return () => {
            el.removeEventListener("scroll", updateScrollState);
            el.removeEventListener("wheel", handleWheel);
            resizeObserver.disconnect();
            window.removeEventListener("resize", updateScrollState);
        };
    }, [updateScrollState, tabs.length, groups]);

    const handleScrollLeft = () => {
        const el = tabsContainerRef.current;
        if (!el) return;
        el.scrollBy({ left: -180, behavior: "smooth" });
    };

    const handleScrollRight = () => {
        const el = tabsContainerRef.current;
        if (!el) return;
        el.scrollBy({ left: 180, behavior: "smooth" });
    };

    // Auto-scroll para mantener la pestaña activa visible en el carrusel
    useEffect(() => {
        if (!activeTabId) return;
        const container = tabsContainerRef.current;
        if (!container) return;

        const activeEl = container.querySelector<HTMLElement>(".tab-item.active");
        if (activeEl) {
            const containerRect = container.getBoundingClientRect();
            const tabRect = activeEl.getBoundingClientRect();

            if (tabRect.left < containerRect.left) {
                container.scrollBy({
                    left: tabRect.left - containerRect.left - 12,
                    behavior: "smooth",
                });
            } else if (tabRect.right > containerRect.right) {
                container.scrollBy({
                    left: tabRect.right - containerRect.right + 12,
                    behavior: "smooth",
                });
            }
        }
    }, [activeTabId, groups]);

    useEffect(() => {
        const timer = setTimeout(() => {
            isInitialRender.current = false;
        }, 300);
        return () => clearTimeout(timer);
    }, []);

    useEffect(() => {
        if (!isInitialRender.current && tabs.length > prevTabsLength.current) {
            const addedTab = tabs[tabs.length - 1];
            if (addedTab) {
                setNewTabId(addedTab.id);
                if (tabsContainerRef.current) {
                    tabsContainerRef.current.scrollTo({
                        left: tabsContainerRef.current.scrollWidth,
                        behavior: "smooth",
                    });
                }
                const clearTimer = setTimeout(() => {
                    setNewTabId((current) =>
                        current === addedTab.id ? null : current
                    );
                }, 400);
                return () => clearTimeout(clearTimer);
            }
        }
        prevTabsLength.current = tabs.length;
    }, [tabs]);

    // ============================================================
    // ARRASTRE UNIFICADO DE ELEMENTOS (PESTAÑAS Y PASTILLAS DE GRUPOS)
    // ============================================================
    const handlePointerDown = useCallback(
        (visibleIndex: number, e: React.PointerEvent<HTMLDivElement>) => {
            setColorMenu(null);
            setGroupMenu(null);

            if (e.button !== 0) return;
            window.getSelection()?.removeAllRanges();

            const container = tabsContainerRef.current;
            if (!container) return;

            const trackElements = Array.from(
                container.querySelectorAll<HTMLElement>(".tabs-track-item:not(.is-group-collapsed)")
            );
            if (!trackElements[visibleIndex]) return;

            const rects = trackElements.map((el) => {
                const r = el.getBoundingClientRect();
                return {
                    left: r.left,
                    right: r.right,
                    width: r.width,
                    center: r.left + r.width / 2,
                };
            });

            const draggedRect = rects[visibleIndex];
            const gap =
                rects.length > 1
                    ? Math.max(0, rects[1].left - rects[0].right)
                    : 6;

            let minDelta = -draggedRect.left;
            let maxDelta = 0;
            if (rects.length > 0) {
                const firstRect = rects[0];
                const lastRect = rects[rects.length - 1];
                minDelta = firstRect.left - draggedRect.left;
                maxDelta = lastRect.right - draggedRect.right;
            }

            const state: DragState = {
                dragIndex: visibleIndex,
                startX: e.clientX,
                deltaX: 0,
                isDragging: false,
                rects,
                draggedWidth: draggedRect.width,
                gap,
                targetIndex: visibleIndex,
                minDelta,
                maxDelta,
            };

            dragStateRef.current = state;

            const handlePointerMove = (moveEvent: PointerEvent) => {
                const s = dragStateRef.current;
                if (!s) return;

                const deltaX = moveEvent.clientX - s.startX;

                if (!s.isDragging && Math.abs(deltaX) > 4) {
                    s.isDragging = true;
                    document.body.classList.add("dragging-tabs");
                }

                if (s.isDragging) {
                    moveEvent.preventDefault();
                    window.getSelection()?.removeAllRanges();

                    const scrollContainer = tabsContainerRef.current;
                    if (scrollContainer) {
                        const cRect = scrollContainer.getBoundingClientRect();
                        if (moveEvent.clientX < cRect.left + 30) {
                            scrollContainer.scrollLeft -= 6;
                        } else if (moveEvent.clientX > cRect.right - 30) {
                            scrollContainer.scrollLeft += 6;
                        }
                    }

                    const clampedDelta = Math.max(
                        s.minDelta,
                        Math.min(s.maxDelta, deltaX)
                    );
                    s.deltaX = clampedDelta;

                    const currentCenterX =
                        s.rects[s.dragIndex].center + clampedDelta;

                    let target = s.dragIndex;
                    for (let i = 0; i < s.rects.length; i++) {
                        if (i === s.dragIndex) continue;
                        const otherCenter = s.rects[i].center;
                        if (
                            s.dragIndex < i &&
                            currentCenterX > otherCenter
                        ) {
                            target = i;
                        } else if (
                            s.dragIndex > i &&
                            currentCenterX < otherCenter
                        ) {
                            target = i;
                            break;
                        }
                    }

                    if (isMac && target === 0 && s.dragIndex !== 0) {
                        const firstItemLeft = s.rects[0].left;
                        const draggedLeft =
                            s.rects[s.dragIndex].left + clampedDelta;
                        if (draggedLeft < firstItemLeft - 10) {
                            s.deltaX = firstItemLeft - s.rects[s.dragIndex].left;
                        }
                    }

                    if (
                        target > s.dragIndex &&
                        s.rects[target] &&
                        currentCenterX < s.rects[target].center - 10
                    ) {
                        target--;
                    }

                    s.targetIndex = target;
                    setDragState({ ...s });
                }
            };

            const handlePointerUp = () => {
                const s = dragStateRef.current;
                window.removeEventListener("pointermove", handlePointerMove);
                window.removeEventListener("pointerup", handlePointerUp);
                window.removeEventListener("pointercancel", handlePointerUp);

                document.body.classList.remove("dragging-tabs");
                window.getSelection()?.removeAllRanges();

                if (s && s.isDragging && s.targetIndex !== s.dragIndex) {
                    const fromItem = visibleBarItems[s.dragIndex];
                    const toItem = visibleBarItems[s.targetIndex];
                    const isMovingRight = s.targetIndex > s.dragIndex;

                    if (fromItem && toItem) {
                        if (onUnifiedDrop) {
                            onUnifiedDrop(
                                { type: fromItem.type, id: fromItem.id },
                                { type: toItem.type, id: toItem.id },
                                isMovingRight
                            );
                        } else if (fromItem.type === "tab" && toItem.type === "tab") {
                            const fromIndex = tabs.findIndex((t) => t.id === fromItem.id);
                            const toIndex = tabs.findIndex((t) => t.id === toItem.id);
                            if (fromIndex !== -1 && toIndex !== -1) {
                                onReorderTabs(fromIndex, toIndex);
                            }
                        }
                    }
                }

                dragStateRef.current = null;
                setDragState(null);
            };

            window.addEventListener("pointermove", handlePointerMove);
            window.addEventListener("pointerup", handlePointerUp);
            window.addEventListener("pointercancel", handlePointerUp);
        },
        [visibleBarItems, tabs, isMac, onUnifiedDrop, onReorderTabs]
    );

    // Determinar si el grupo seleccionado en el menú puede moverse a izquierda o derecha
    const canMoveGroupLeft = useMemo(() => {
        if (!groupMenu) return false;
        const groupTabs = tabs.filter((t) => t.groupId === groupMenu.group.id);
        if (groupTabs.length === 0) return false;
        const firstIdx = tabs.findIndex((t) => t.groupId === groupMenu.group.id);
        return firstIdx > 0;
    }, [groupMenu, tabs]);

    const canMoveGroupRight = useMemo(() => {
        if (!groupMenu) return false;
        const groupTabs = tabs.filter((t) => t.groupId === groupMenu.group.id);
        if (groupTabs.length === 0) return false;
        const lastIdx = tabs.map((t) => t.groupId).lastIndexOf(groupMenu.group.id);
        return lastIdx < tabs.length - 1;
    }, [groupMenu, tabs]);

    // Calcular las pestañas sobre las que opera el menú de color (soporte multi-selección)
    const effectiveColorMenuTargetIds = useMemo(() => {
        if (!colorMenu) return [];
        if (selectedTabIds.has(colorMenu.tabId) && selectedTabIds.size > 1) {
            return Array.from(selectedTabIds);
        }
        return [colorMenu.tabId];
    }, [colorMenu, selectedTabIds]);

    // Arrastre nativo de la ventana al interactuar con el área vacía del header (sin pestañas)
    const handleEmptyAreaPointerDown = useCallback((e: React.PointerEvent) => {
        if (e.button !== 0) return;
        const target = e.target as HTMLElement;
        if (
            target === tabsContainerRef.current ||
            target.classList.contains("tabs-container") ||
            target.classList.contains("tabs-carousel-wrapper")
        ) {
            if (e.detail === 2) {
                try {
                    getCurrentWindow().toggleMaximize().catch(() => {});
                } catch {
                    // Ignorar en pruebas web
                }
            } else {
                try {
                    getCurrentWindow().startDragging().catch(() => {});
                } catch {
                    // Ignorar en pruebas web
                }
            }
        }
    }, []);

    return (
        <header className="app-header" data-tauri-drag-region>
            {/* 1. Espacio exclusivo de 78px en macOS para el semáforo nativo de Apple */}
            {isMac && (
                <div className="header-macos-spacer" data-tauri-drag-region />
            )}

            {/* 2. Envoltura de carrusel responsivo con botones < > y scroll con rueda del ratón */}
            <div
                className="tabs-carousel-wrapper"
                data-tauri-drag-region
                onPointerDown={handleEmptyAreaPointerDown}
            >
                {canScrollLeft && (
                    <button
                        type="button"
                        className="btn-carousel-nav btn-carousel-left"
                        onClick={handleScrollLeft}
                        title="Desplazar pestañas a la izquierda"
                        aria-label="Pestañas anteriores"
                    >
                        <ChevronLeft size={13} />
                    </button>
                )}

                <div
                    ref={tabsContainerRef}
                    className={`tabs-container ${
                        dragState?.isDragging ? "has-dragging" : ""
                    }`}
                    data-tauri-drag-region
                    onPointerDown={handleEmptyAreaPointerDown}
                >
                    {(() => {
                        let currentVisibleIndex = 0;

                        return barItems.map((item) => {
                            const isItemCollapsed =
                                item.type === "tab" && Boolean(item.isGroupCollapsed);

                            let visibleIdx = -1;
                            if (!isItemCollapsed) {
                                visibleIdx = currentVisibleIndex++;
                            }

                            let itemStyle: React.CSSProperties = {
                                transform: "translate3d(0, 0, 0)",
                                transition: "transform 0.22s cubic-bezier(0.16, 1, 0.3, 1)",
                            };

                            const isBeingDragged =
                                !isItemCollapsed &&
                                Boolean(dragState?.isDragging) &&
                                dragState?.dragIndex === visibleIdx;

                            if (dragState?.isDragging && !isItemCollapsed && visibleIdx !== -1) {
                                if (isBeingDragged) {
                                    itemStyle = {
                                        transform: `translate3d(${dragState.deltaX}px, 0, 0) scale(1.02)`,
                                        zIndex: 50,
                                        transition: "none",
                                        pointerEvents: "none",
                                    };
                                } else {
                                    let shiftX = 0;
                                    if (dragState.targetIndex > dragState.dragIndex) {
                                        if (
                                            visibleIdx > dragState.dragIndex &&
                                            visibleIdx <= dragState.targetIndex
                                        ) {
                                            shiftX = -(
                                                dragState.draggedWidth + dragState.gap
                                            );
                                        }
                                    } else if (
                                        dragState.targetIndex < dragState.dragIndex
                                    ) {
                                        if (
                                            visibleIdx >= dragState.targetIndex &&
                                            visibleIdx < dragState.dragIndex
                                        ) {
                                            shiftX = +(
                                                dragState.draggedWidth + dragState.gap
                                            );
                                        }
                                    }

                                    itemStyle = {
                                        transform: `translate3d(${shiftX}px, 0, 0)`,
                                        transition:
                                            "transform 0.22s cubic-bezier(0.16, 1, 0.3, 1)",
                                        zIndex: 1,
                                    };
                                }
                            }

                            if (item.type === "group") {
                                return (
                                    <TabGroupPill
                                        key={item.key}
                                        group={item.group}
                                        tabCount={item.tabCount}
                                        isDragging={isBeingDragged}
                                        style={itemStyle}
                                        onToggleCollapse={() => {
                                            if (dragState?.isDragging) return;
                                            onToggleGroupCollapsed?.(item.group.id);
                                        }}
                                        onPointerDown={(e) => {
                                            if (visibleIdx !== -1) {
                                                handlePointerDown(visibleIdx, e);
                                            }
                                        }}
                                        onContextMenu={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            if (dragState?.isDragging) return;
                                            setColorMenu(null);
                                            setGroupMenu({
                                                group: item.group,
                                                x: e.clientX,
                                                y: e.clientY,
                                            });
                                        }}
                                    />
                                );
                            }

                            // Renderizado de pestaña (TabItem)
                            const tab = item.tab;
                            const group = tab.groupId
                                ? groups.find((g) => g.id === tab.groupId)
                                : null;
                            const tabOverallIndex = tabs.findIndex((t) => t.id === tab.id);

                            return (
                                <TabItem
                                    key={item.key}
                                    tab={tab}
                                    index={tabOverallIndex !== -1 ? tabOverallIndex : 0}
                                    isActive={tab.id === activeTabId}
                                    isMultiSelected={selectedTabIds.has(tab.id)}
                                    isGroupCollapsed={isItemCollapsed}
                                    groupColor={group?.color}
                                    groupTitle={group?.title}
                                    modSymbol={modSymbol}
                                    isDragging={isBeingDragged}
                                    isNew={tab.id === newTabId}
                                    isClosing={closingTabIds?.has(tab.id)}
                                    style={itemStyle}
                                    onPointerDown={(e) => {
                                        if (!isItemCollapsed && visibleIdx !== -1) {
                                            handlePointerDown(visibleIdx, e);
                                        }
                                    }}
                                    onContextMenu={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        if (dragState?.isDragging || isItemCollapsed) return;
                                        setGroupMenu(null);
                                        setColorMenu({
                                            tabId: tab.id,
                                            x: e.clientX,
                                            y: e.clientY,
                                        });
                                    }}
                                    onSelect={(e) => {
                                        if (dragState?.isDragging) return;
                                        if (onSelectTabWithModifiers) {
                                            onSelectTabWithModifiers(tab.id, e);
                                        } else {
                                            onSelectTab(tab.id);
                                        }
                                    }}
                                    onClose={(e) => {
                                        if (colorMenu?.tabId === tab.id) {
                                            setColorMenu(null);
                                        }
                                        if (
                                            selectedTabIds.has(tab.id) &&
                                            selectedTabIds.size > 1 &&
                                            onCloseTabs
                                        ) {
                                            onCloseTabs(Array.from(selectedTabIds));
                                        } else {
                                            onCloseTab(tab.id, e);
                                        }
                                    }}
                                />
                            );
                        });
                    })()}
                </div>

                {canScrollRight && (
                    <button
                        type="button"
                        className="btn-carousel-nav btn-carousel-right"
                        onClick={handleScrollRight}
                        title="Desplazar pestañas a la derecha"
                        aria-label="Pestañas siguientes"
                    >
                        <ChevronRight size={13} />
                    </button>
                )}

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

                {!isMac && <WindowControls />}
            </div>

            {/* Menú de colores y asignación a grupos para una o varias pestañas */}
            {colorMenu && onSetTabColor && (
                <TabColorMenu
                    tab={tabs.find((t) => t.id === colorMenu.tabId) || tabs[0]}
                    position={{ x: colorMenu.x, y: colorMenu.y }}
                    groups={groups}
                    selectedCount={effectiveColorMenuTargetIds.length}
                    onClose={() => setColorMenu(null)}
                    onSelectColor={(color) => {
                        onSetTabColor(effectiveColorMenuTargetIds, color);
                    }}
                    onCreateGroup={(title, color) => {
                        onCreateGroup?.(effectiveColorMenuTargetIds, title, color);
                    }}
                    onAssignGroup={(groupId) => {
                        onAssignTabToGroup?.(effectiveColorMenuTargetIds, groupId);
                    }}
                    onCloseSelected={() => {
                        onCloseTabs?.(effectiveColorMenuTargetIds);
                    }}
                />
            )}

            {/* Menú contextual de gestión del grupo de pestañas */}
            {groupMenu && onUpdateGroup && onUngroupTabs && onCloseGroup && (
                <GroupContextMenu
                    group={groups.find((g) => g.id === groupMenu.group.id) || groupMenu.group}
                    position={{ x: groupMenu.x, y: groupMenu.y }}
                    canMoveLeft={canMoveGroupLeft}
                    canMoveRight={canMoveGroupRight}
                    onClose={() => setGroupMenu(null)}
                    onUpdateGroup={(title, color) => {
                        onUpdateGroup(groupMenu.group.id, title, color);
                    }}
                    onUngroup={() => {
                        onUngroupTabs(groupMenu.group.id);
                    }}
                    onCloseGroup={() => {
                        onCloseGroup(groupMenu.group.id);
                    }}
                    onMoveLeft={() => {
                        onReorderGroup?.(groupMenu.group.id, "left");
                    }}
                    onMoveRight={() => {
                        onReorderGroup?.(groupMenu.group.id, "right");
                    }}
                />
            )}
        </header>
    );
}
