import React, { useState, useRef, useCallback, useEffect, useMemo, Fragment } from "react";
import { Plus, ChevronLeft, ChevronRight } from "lucide-react";
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
    appVersion: string;
    modSymbol: string;
    isMac: boolean;
    onSelectTab: (id: string) => void;
    onCloseTab: (id: string, e: React.MouseEvent) => void;
    onAddTab: () => void;
    onReorderTabs: (fromIndex: number, toIndex: number) => void;
    onCopyVersion: () => void;
    onSetTabColor?: (id: string, color: string | undefined) => void;
    onCreateGroup?: (tabId: string, title: string, color: string) => void;
    onAssignTabToGroup?: (tabId: string, groupId?: string) => void;
    onToggleGroupCollapsed?: (groupId: string) => void;
    onUpdateGroup?: (groupId: string, title: string, color: string) => void;
    onUngroupTabs?: (groupId: string) => void;
    onCloseGroup?: (groupId: string) => void;
    closingTabIds?: Set<string>;
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
    groups = [],
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
    onCreateGroup,
    onAssignTabToGroup,
    onToggleGroupCollapsed,
    onUpdateGroup,
    onUngroupTabs,
    onCloseGroup,
    closingTabIds,
}: HeaderProps) {
    const tabsContainerRef = useRef<HTMLDivElement>(null);
    const [dragState, setDragState] = useState<DragState | null>(null);
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
    const dragStateRef = useRef<DragState | null>(null);

    // Pestañas visibles en el DOM (excluye las pestañas dentro de grupos colapsados)
    const visibleTabs = useMemo(() => {
        return tabs.filter((tab) => {
            if (!tab.groupId) return true;
            const group = groups.find((g) => g.id === tab.groupId);
            return !group?.collapsed;
        });
    }, [tabs, groups]);

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

    const handlePointerDown = useCallback(
        (visibleIndex: number, e: React.PointerEvent<HTMLDivElement>) => {
            // Cerrar menú de color y de grupo si estuvieran abiertos
            setColorMenu(null);
            setGroupMenu(null);

            // Solo botón primario del ratón
            if (e.button !== 0) return;

            // Evitar selección accidental de texto en WebKit/macOS
            window.getSelection()?.removeAllRanges();

            const container = tabsContainerRef.current;
            if (!container) return;

            const tabElements = Array.from(
                container.querySelectorAll<HTMLElement>(".tab-item")
            );
            if (!tabElements[visibleIndex]) return;

            const rects = tabElements.map((el) => {
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
                tabRects: rects,
                draggedWidth: draggedRect.width,
                gap,
                targetIndex: visibleIndex,
                minDelta,
                maxDelta,
            };

            dragStateRef.current = state;

            const handlePointerMove = (moveEvent: PointerEvent) => {
                const state = dragStateRef.current;
                if (!state) return;

                const deltaX = moveEvent.clientX - state.startX;

                if (!state.isDragging && Math.abs(deltaX) > 4) {
                    state.isDragging = true;
                    document.body.classList.add("dragging-tabs");
                }

                if (state.isDragging) {
                    moveEvent.preventDefault();
                    window.getSelection()?.removeAllRanges();

                    // Auto-scroll durante arrastre si el cursor se acerca a los extremos del carrusel
                    const scrollContainer = tabsContainerRef.current;
                    if (scrollContainer) {
                        const cRect = scrollContainer.getBoundingClientRect();
                        if (moveEvent.clientX < cRect.left + 30) {
                            scrollContainer.scrollLeft -= 6;
                        } else if (moveEvent.clientX > cRect.right - 30) {
                            scrollContainer.scrollLeft += 6;
                        }
                    }

                    // Contener el desplazamiento dentro del área visible de pestañas
                    const clampedDelta = Math.max(
                        state.minDelta,
                        Math.min(state.maxDelta, deltaX)
                    );
                    state.deltaX = clampedDelta;

                    const currentCenterX =
                        state.tabRects[state.dragIndex].center + clampedDelta;

                    let target = state.dragIndex;
                    for (let i = 0; i < state.tabRects.length; i++) {
                        if (i === state.dragIndex) continue;
                        const otherCenter = state.tabRects[i].center;
                        if (
                            state.dragIndex < i &&
                            currentCenterX > otherCenter
                        ) {
                            target = i;
                        } else if (
                            state.dragIndex > i &&
                            currentCenterX < otherCenter
                        ) {
                            target = i;
                            break;
                        }
                    }

                    if (isMac && target === 0 && state.dragIndex !== 0) {
                        const firstTabLeft = state.tabRects[0].left;
                        const draggedLeft =
                            state.tabRects[state.dragIndex].left + clampedDelta;
                        if (draggedLeft < firstTabLeft - 10) {
                            state.deltaX = firstTabLeft - state.tabRects[state.dragIndex].left;
                        }
                    }

                    if (
                        target > state.dragIndex &&
                        state.tabRects[target] &&
                        currentCenterX < state.tabRects[target].center - 10
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
                        const fromTab = visibleTabs[state.dragIndex];
                        const toTab = visibleTabs[state.targetIndex];
                        if (fromTab && toTab && fromTab.id !== toTab.id) {
                            const fromIndex = tabs.findIndex((t) => t.id === fromTab.id);
                            const toIndex = tabs.findIndex((t) => t.id === toTab.id);
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
        [visibleTabs, tabs, onReorderTabs]
    );

    return (
        <header className="app-header" data-tauri-drag-region>
            {/* 1. Espacio exclusivo de 78px en macOS para el semáforo nativo de Apple */}
            {isMac && (
                <div className="header-macos-spacer" data-tauri-drag-region />
            )}

            {/* 2. Envoltura de carrusel responsivo con botones < > y scroll con rueda del ratón */}
            <div className="tabs-carousel-wrapper">
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
                >
                    {(() => {
                        const renderedPillIds = new Set<string>();
                        let currentVisibleIndex = 0;

                        return tabs.map((tab) => {
                            let pillElement: React.ReactNode = null;
                            if (tab.groupId && !renderedPillIds.has(tab.groupId)) {
                                renderedPillIds.add(tab.groupId);
                                const group = groups.find((g) => g.id === tab.groupId);
                                if (group) {
                                    const count = tabs.filter((t) => t.groupId === group.id).length;
                                    pillElement = (
                                        <TabGroupPill
                                            key={`pill-${group.id}`}
                                            group={group}
                                            tabCount={count}
                                            onToggleCollapse={() => onToggleGroupCollapsed?.(group.id)}
                                            onContextMenu={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                setColorMenu(null);
                                                setGroupMenu({
                                                    group,
                                                    x: e.clientX,
                                                    y: e.clientY,
                                                });
                                            }}
                                        />
                                    );
                                }
                            }

                            const group = tab.groupId
                                ? groups.find((g) => g.id === tab.groupId)
                                : null;
                            const isCollapsed = Boolean(group?.collapsed);

                            if (isCollapsed) {
                                return pillElement ? (
                                    <Fragment key={`pill-wrap-${tab.id}`}>
                                        {pillElement}
                                    </Fragment>
                                ) : null;
                            }

                            const visibleIdx = currentVisibleIndex++;
                            let tabStyle: React.CSSProperties = {
                                transform: "translate3d(0, 0, 0)",
                                transition: "transform 0.22s cubic-bezier(0.16, 1, 0.3, 1)",
                            };
                            const isBeingDragged =
                                Boolean(dragState?.isDragging) &&
                                dragState?.dragIndex === visibleIdx;

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

                                    tabStyle = {
                                        transform: `translate3d(${shiftX}px, 0, 0)`,
                                        transition:
                                            "transform 0.22s cubic-bezier(0.16, 1, 0.3, 1)",
                                        zIndex: 1,
                                    };
                                }
                            }

                            const tabNode = (
                                <TabItem
                                    key={tab.id}
                                    tab={tab}
                                    index={visibleIdx}
                                    isActive={tab.id === activeTabId}
                                    modSymbol={modSymbol}
                                    isDragging={isBeingDragged}
                                    isNew={tab.id === newTabId}
                                    isClosing={closingTabIds?.has(tab.id)}
                                    style={tabStyle}
                                    onPointerDown={(e) => handlePointerDown(visibleIdx, e)}
                                    onContextMenu={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        if (dragState?.isDragging) return;
                                        setGroupMenu(null);
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

                            if (pillElement) {
                                return (
                                    <Fragment key={`group-wrapper-${tab.id}`}>
                                        {pillElement}
                                        {tabNode}
                                    </Fragment>
                                );
                            }

                            return tabNode;
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

                {/* En Windows y Linux se renderizan los controles de ventana integrados a la derecha */}
                {!isMac && <WindowControls />}
            </div>

            {/* Menú de colores y asignación a grupos para una pestaña */}
            {colorMenu && onSetTabColor && (
                <TabColorMenu
                    tab={tabs.find((t) => t.id === colorMenu.tabId) || tabs[0]}
                    position={{ x: colorMenu.x, y: colorMenu.y }}
                    groups={groups}
                    onClose={() => setColorMenu(null)}
                    onSelectColor={(color) => {
                        onSetTabColor(colorMenu.tabId, color);
                    }}
                    onCreateGroup={(title, color) => {
                        onCreateGroup?.(colorMenu.tabId, title, color);
                    }}
                    onAssignGroup={(groupId) => {
                        onAssignTabToGroup?.(colorMenu.tabId, groupId);
                    }}
                />
            )}

            {/* Menú contextual de gestión del grupo de pestañas */}
            {groupMenu && onUpdateGroup && onUngroupTabs && onCloseGroup && (
                <GroupContextMenu
                    group={groups.find((g) => g.id === groupMenu.group.id) || groupMenu.group}
                    position={{ x: groupMenu.x, y: groupMenu.y }}
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
                />
            )}
        </header>
    );
}
