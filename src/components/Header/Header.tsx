import React, { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { Plus, ChevronLeft, ChevronRight } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { TabItem as TabItemType, TabGroup } from "../../types";
import { TabItem } from "./TabItem";
import { TabColorMenu } from "./TabColorMenu";
import { TabGroupPill } from "./TabGroupPill";
import { GroupContextMenu } from "./GroupContextMenu";
import { WindowControls } from "./WindowControls";
import { TabBundleItem, BarItemBundle } from "./TabBundleItem";

interface HeaderProps {
    tabs: TabItemType[];
    groups?: TabGroup[];
    activeTabId: string;
    selectedTabIds?: Set<string>;
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
        from: { type: "tab" | "group"; id: string; ids?: string[] },
        to: { type: "tab" | "group"; id: string },
        isMovingRight: boolean
    ) => void;
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
    unbundlingTabIds?: Set<string>;
    onTriggerUnbundleAnimation?: (tabIds: string[]) => void;
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
    isBundle?: boolean;
    bundleIds?: string[];
    leadTabId?: string;
    bundleOffsets?: Record<string, number>;
    needsRemergeMeasure?: boolean;
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

type BarItem = BarItemTab | BarItemGroup | BarItemBundle;

export function Header({
    tabs,
    groups = [],
    activeTabId,
    selectedTabIds = new Set(),
    modSymbol,
    isMac,
    onSelectTab,
    onSelectTabWithModifiers,
    onCloseTab,
    onCloseTabs,
    onAddTab,
    onReorderTabs,
    onUnifiedDrop,
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
    unbundlingTabIds,
    onTriggerUnbundleAnimation,
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

    // Solo se agrupan visualmente en un único bundle cuando se inicia el arrastre (drag)
    const isBundledDuringDrag = Boolean(
        dragState?.isDragging &&
        dragState?.isBundle &&
        dragState?.bundleIds &&
        dragState.bundleIds.length > 1
    );

    // Estructura lineal unificada de elementos en la barra (pestañas, pastillas de grupos y bundle durante drag)
    const barItems = useMemo<BarItem[]>(() => {
        const items: BarItem[] = [];
        const renderedPillIds = new Set<string>();

        const bundleActive = isBundledDuringDrag;
        const bundleSet = bundleActive && dragState?.bundleIds ? new Set(dragState.bundleIds) : null;
        let hasRenderedBundle = false;

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

            // Solo se colapsan en una sola pestaña agrupada cuando el usuario está arrastrando el lote
            if (bundleSet && bundleSet.has(tab.id)) {
                if (!hasRenderedBundle) {
                    hasRenderedBundle = true;
                    const bundleTabs = tabs.filter((t) => bundleSet.has(t.id));
                    const leadId = dragState?.leadTabId || activeTabId;
                    const leadTab = bundleTabs.find((t) => t.id === leadId) || bundleTabs[0];
                    const allInSameGroup = bundleTabs.every((t) => t.groupId === leadTab.groupId);
                    const bundleGroupId = allInSameGroup ? leadTab.groupId : undefined;
                    const isBundleCollapsed = bundleGroupId
                        ? Boolean(groups.find((g) => g.id === bundleGroupId)?.collapsed)
                        : false;

                    items.push({
                        type: "bundle",
                        id: leadTab.id,
                        key: `bundle-${leadTab.id}`,
                        leadTab,
                        tabs: bundleTabs,
                        tabIds: bundleTabs.map((t) => t.id),
                        groupId: bundleGroupId,
                        isGroupCollapsed: isBundleCollapsed,
                        initialOffsets: dragState?.bundleOffsets,
                    });
                }
                return;
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
    }, [tabs, groups, isBundledDuringDrag, dragState?.bundleIds, activeTabId]);

    // Elementos visibles actualmente en el track (excluye pestañas dentro de grupos colapsados)
    const visibleBarItems = useMemo<BarItem[]>(() => {
        return barItems.filter((item) => {
            if (item.type === "group") return true;
            return !item.isGroupCollapsed;
        });
    }, [barItems]);

    const visibleBarItemsRef = useRef(visibleBarItems);
    useEffect(() => {
        visibleBarItemsRef.current = visibleBarItems;
    }, [visibleBarItems]);

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

            const clickedItem = visibleBarItems[visibleIndex];
            let isBundle = false;
            let bundleIds: string[] = [];
            let leadTabId: string | undefined = undefined;

            if (clickedItem && clickedItem.type === "tab") {
                leadTabId = clickedItem.tab.id;
                // Si la pestaña forma parte de una selección múltiple existente:
                if (selectedTabIds.has(clickedItem.tab.id) && selectedTabIds.size > 1) {
                    isBundle = true;
                    bundleIds = tabs.filter((t) => selectedTabIds.has(t.id)).map((t) => t.id);
                } else {
                    bundleIds = [clickedItem.tab.id];
                }
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
                isBundle,
                bundleIds,
                leadTabId,
            };

            dragStateRef.current = state;

            const handlePointerMove = (moveEvent: PointerEvent) => {
                const s = dragStateRef.current;
                if (!s) return;

                const deltaX = moveEvent.clientX - s.startX;

                if (!s.isDragging && Math.abs(deltaX) > 4) {
                    s.isDragging = true;
                    if (s.isBundle && s.bundleIds) {
                        const leadId = s.leadTabId || tabs.find((t) => s.bundleIds?.includes(t.id))?.id;
                        const leadItemIdx = visibleBarItems.findIndex(
                            (it) => it.type === "tab" && it.tab.id === leadId
                        );
                        const leadRect = leadItemIdx !== -1 ? s.rects[leadItemIdx] : null;

                        const bundleOffsets: Record<string, number> = {};
                        if (leadRect) {
                            s.bundleIds.forEach((id) => {
                                const idx = visibleBarItems.findIndex(
                                    (it) => it.type === "tab" && it.tab.id === id
                                );
                                if (idx !== -1 && s.rects[idx]) {
                                    bundleOffsets[id] = s.rects[idx].left - leadRect.left;
                                }
                            });
                        }
                        s.bundleOffsets = bundleOffsets;

                        if (leadItemIdx !== -1) {
                            s.dragIndex = leadItemIdx;
                            s.targetIndex = leadItemIdx;
                        }
                        s.needsRemergeMeasure = true;
                    }
                    document.body.classList.add("dragging-tabs");
                    setDragState({ ...s });
                }

                if (s.isDragging) {
                    moveEvent.preventDefault();
                    window.getSelection()?.removeAllRanges();

                    if (s.needsRemergeMeasure) {
                        const scrollContainer = tabsContainerRef.current;
                        if (scrollContainer) {
                            const bundleEl = scrollContainer.querySelector<HTMLElement>(".tab-bundle-item");
                            if (bundleEl) {
                                const trackElements = Array.from(
                                    scrollContainer.querySelectorAll<HTMLElement>(".tabs-track-item:not(.is-group-collapsed)")
                                );
                                if (trackElements.length > 0) {
                                    s.rects = trackElements.map((el) => {
                                        const r = el.getBoundingClientRect();
                                        return {
                                            left: r.left,
                                            right: r.right,
                                            width: r.width,
                                            center: r.left + r.width / 2,
                                        };
                                    });
                                    const bundleElIndex = trackElements.indexOf(bundleEl);
                                    if (bundleElIndex !== -1) {
                                        s.dragIndex = bundleElIndex;
                                        s.targetIndex = bundleElIndex;
                                        const draggedRect = s.rects[bundleElIndex];
                                        s.draggedWidth = draggedRect.width;
                                        s.minDelta = s.rects[0].left - draggedRect.left;
                                        s.maxDelta = s.rects[s.rects.length - 1].right - draggedRect.right;
                                        s.needsRemergeMeasure = false;
                                    }
                                }
                            }
                        }
                    }

                    const scrollContainer = tabsContainerRef.current;
                    if (scrollContainer) {
                        const cRect = scrollContainer.getBoundingClientRect();
                        if (moveEvent.clientX < cRect.left + 30) {
                            scrollContainer.scrollLeft -= 6;
                        } else if (moveEvent.clientX > cRect.right - 30) {
                            scrollContainer.scrollLeft += 6;
                        }
                    }

                    const clampedDelta =
                        s.minDelta !== 0 || s.maxDelta !== 0
                            ? Math.max(s.minDelta, Math.min(s.maxDelta, deltaX))
                            : deltaX;
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

                if (s && s.isDragging) {
                    if (s.targetIndex !== s.dragIndex) {
                        const currentVisible = visibleBarItemsRef.current;
                        const fromItem = currentVisible[s.dragIndex];
                        const toItem = currentVisible[s.targetIndex];
                        const isMovingRight = s.targetIndex > s.dragIndex;

                        if (fromItem && toItem) {
                            if (onUnifiedDrop) {
                                const fromPayload =
                                    fromItem.type === "bundle"
                                        ? {
                                              type: "tab" as const,
                                              id: fromItem.leadTab.id,
                                              ids: fromItem.tabIds,
                                          }
                                        : {
                                              type: fromItem.type as "tab" | "group",
                                              id: fromItem.id,
                                              ids: s.isBundle ? s.bundleIds : undefined,
                                          };

                                const toPayload =
                                    toItem.type === "bundle"
                                        ? {
                                              type: "tab" as const,
                                              id: toItem.leadTab.id,
                                          }
                                        : {
                                              type: toItem.type as "tab" | "group",
                                              id: toItem.id,
                                          };

                                onUnifiedDrop(fromPayload, toPayload, isMovingRight);
                            } else if (fromItem.type !== "group" && toItem.type !== "group") {
                                const fromId = fromItem.type === "bundle" ? fromItem.leadTab.id : fromItem.id;
                                const toId = toItem.type === "bundle" ? toItem.leadTab.id : toItem.id;
                                const fromIndex = tabs.findIndex((t) => t.id === fromId);
                                const toIndex = tabs.findIndex((t) => t.id === toId);
                                if (fromIndex !== -1 && toIndex !== -1) {
                                    onReorderTabs(fromIndex, toIndex);
                                }
                            }
                        }
                    } else {
                        // Si se soltó en la misma posición, desagrupar con animación
                        if (s.isBundle && s.bundleIds && s.bundleIds.length > 1) {
                            onTriggerUnbundleAnimation?.(s.bundleIds);
                        }
                        const fromItem = visibleBarItems[s.dragIndex];
                        if (fromItem && fromItem.type === "bundle") {
                            onSelectTab(fromItem.leadTab.id);
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
        [
            visibleBarItems,
            tabs,
            isMac,
            onUnifiedDrop,
            onReorderTabs,
            selectedTabIds,
            onSelectTabWithModifiers,
            activeTabId,
        ]
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

    // Bloqueo de enfriamiento para evitar llamadas dobles o rebotes al maximizar
    const toggleMaximizeCooldownRef = useRef(false);

    const handleSafeToggleMaximize = useCallback(() => {
        // En macOS, AppKit gestiona el doble clic de data-tauri-drag-region de forma nativa.
        // Si JavaScript también llama a toggleMaximize(), colisiona con el SO produciendo el doble rebote.
        if (isMac) return;

        if (toggleMaximizeCooldownRef.current) return;
        toggleMaximizeCooldownRef.current = true;
        setTimeout(() => {
            toggleMaximizeCooldownRef.current = false;
        }, 400);

        try {
            getCurrentWindow().toggleMaximize().catch(() => {});
        } catch {
            // Ignorar en pruebas web
        }
    }, [isMac]);

    // Arrastre nativo de la ventana al interactuar con el área vacía del header (sin pestañas)
    const handleEmptyAreaPointerDown = useCallback((e: React.PointerEvent) => {
        if (e.button !== 0) return;
        const target = e.target as HTMLElement;

        // Si se hizo clic sobre una pestaña, grupo o botón, no interferir
        if (
            target.closest(".tab-item") ||
            target.closest(".tab-group-pill") ||
            target.closest(".btn-carousel-nav") ||
            target.closest(".btn-new-tab") ||
            target.closest("button")
        ) {
            return;
        }

        e.stopPropagation();

        if (e.detail === 2) {
            if (!isMac) {
                handleSafeToggleMaximize();
            }
        } else if (e.detail === 1) {
            try {
                getCurrentWindow().startDragging().catch(() => {});
            } catch {
                // Ignorar en pruebas web
            }
        }
    }, [handleSafeToggleMaximize, isMac]);

    // Doble clic seguro en áreas vacías del header (espaciadores, área derecha)
    const handleHeaderDoubleClick = useCallback((e: React.MouseEvent) => {
        if (isMac) return;

        const target = e.target as HTMLElement;
        if (
            target.closest(".tab-item") ||
            target.closest(".tab-group-pill") ||
            target.closest(".btn-carousel-nav") ||
            target.closest(".btn-new-tab") ||
            target.closest(".header-version") ||
            target.closest(".window-controls") ||
            target.closest("button")
        ) {
            return;
        }
        e.preventDefault();
        e.stopPropagation();
        handleSafeToggleMaximize();
    }, [handleSafeToggleMaximize, isMac]);

    return (
        <header
            className="app-header"
            data-tauri-drag-region
            onDoubleClick={handleHeaderDoubleClick}
        >
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
                                (item.type === "bundle"
                                    ? true
                                    : dragState?.dragIndex === visibleIdx);

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

                            if (item.type === "bundle") {
                                const group = item.groupId
                                    ? groups.find((g) => g.id === item.groupId)
                                    : null;

                                return (
                                    <TabBundleItem
                                        key={item.key}
                                        bundle={item}
                                        isDragging={isBeingDragged}
                                        style={itemStyle}
                                        groupColor={group?.color}
                                        onPointerDown={(e) => {
                                            if (!isItemCollapsed && visibleIdx !== -1) {
                                                handlePointerDown(visibleIdx, e);
                                            }
                                        }}
                                        onContextMenu={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            if (dragState?.isDragging) return;
                                            setColorMenu(null);
                                            setGroupMenu(null);
                                        }}
                                        onClick={() => {
                                            if (dragState?.isDragging) return;
                                            // Clic en la pestaña agrupada: desagrupar y activar pestaña principal con animación
                                            onTriggerUnbundleAnimation?.(item.tabIds);
                                            onSelectTab(item.leadTab.id);
                                        }}
                                        onClose={() => {
                                            onCloseTabs?.(item.tabIds);
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

                            const isAnchorBeingDragged = isBeingDragged;
                            const isBundleFollower =
                                Boolean(dragState?.isDragging) &&
                                Boolean(dragState?.isBundle) &&
                                Boolean(dragState?.bundleIds?.includes(tab.id)) &&
                                !isAnchorBeingDragged;
                            const isBundleLeader = isAnchorBeingDragged && Boolean(dragState?.isBundle);
                            const dragBundleCount = dragState?.bundleIds?.length || 0;

                            const isUnbundling = Boolean(unbundlingTabIds?.has(tab.id));
                            let unbundleIndex = 0;
                            if (isUnbundling && unbundlingTabIds) {
                                const unbundleList = tabs.filter((t) => unbundlingTabIds.has(t.id));
                                unbundleIndex = unbundleList.findIndex((t) => t.id === tab.id);
                                if (unbundleIndex === -1) unbundleIndex = 0;
                            }

                            return (
                                <TabItem
                                    key={item.key}
                                    tab={tab}
                                    index={tabOverallIndex !== -1 ? tabOverallIndex : 0}
                                    isActive={tab.id === activeTabId}
                                    isMultiSelected={selectedTabIds.has(tab.id) && selectedTabIds.size > 1}
                                    isGroupCollapsed={isItemCollapsed}
                                    isBundleLeader={isBundleLeader}
                                    isBundleFollower={isBundleFollower}
                                    dragBundleCount={dragBundleCount}
                                    isUnbundling={isUnbundling}
                                    unbundleIndex={unbundleIndex}
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
