import { useState, useRef, useCallback, useEffect } from "react";
import { TabItem, TabGroup, TerminalHandle } from "../types";
import { extractFolderName } from "../utils";

const SESSION_STORAGE_KEY = "rhod_terminal_session";

interface SavedSession {
    tabs: TabItem[];
    activeTabId: string;
    tabCwds: Record<string, string>;
    groups: TabGroup[];
}

function getInitialSession(): SavedSession {
    try {
        const raw = localStorage.getItem(SESSION_STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (
                Array.isArray(parsed.tabs) &&
                parsed.tabs.length > 0 &&
                parsed.tabs.every(
                    (t: any) => t && typeof t.id === "string" && typeof t.title === "string"
                )
            ) {
                const groups: TabGroup[] = Array.isArray(parsed.groups)
                    ? parsed.groups
                          .filter(
                              (g: any) =>
                                  g &&
                                  typeof g.id === "string" &&
                                  typeof g.title === "string" &&
                                  typeof g.color === "string"
                          )
                          .map((g: any) => ({
                              id: g.id,
                              title: g.title,
                              color: g.color,
                              collapsed: Boolean(g.collapsed),
                          }))
                    : [];

                const tabs: TabItem[] = parsed.tabs.map((t: any) => ({
                    id: t.id,
                    title: t.title,
                    cwd: t.cwd,
                    color: typeof t.color === "string" ? t.color : undefined,
                    groupId: typeof t.groupId === "string" ? t.groupId : undefined,
                }));

                const tabCwds: Record<string, string> =
                    parsed.tabCwds && typeof parsed.tabCwds === "object" ? parsed.tabCwds : {};

                let activeTabId = parsed.activeTabId;
                if (!activeTabId || !tabs.some((t) => t.id === activeTabId)) {
                    activeTabId = tabs[0].id;
                }

                return { tabs, activeTabId, tabCwds, groups };
            }
        }
    } catch (err) {
        console.warn("[Session] Error al recuperar sesión de localStorage:", err);
    }

    return {
        tabs: [{ id: "term-1", title: "terminal 1" }],
        activeTabId: "term-1",
        tabCwds: {},
        groups: [],
    };
}

export function useTerminalTabs(
    showToast: (msg: string) => void,
    onTabCwdChange?: (tabId: string, cleanPath: string) => void
) {
    const [initialState] = useState(getInitialSession);
    const [tabs, setTabs] = useState<TabItem[]>(initialState.tabs);
    const [groups, setGroups] = useState<TabGroup[]>(initialState.groups || []);
    const [activeTabId, setActiveTabId] = useState<string>(initialState.activeTabId);
    const [closingTabIds, setClosingTabIds] = useState<Set<string>>(new Set());
    const [selectedTabIds, setSelectedTabIds] = useState<Set<string>>(
        () => new Set([initialState.activeTabId])
    );
    const lastSelectedTabIdRef = useRef<string>(initialState.activeTabId);
    const tabRefs = useRef<Record<string, TerminalHandle | null>>({});
    const [tabCwds, setTabCwds] = useState<Record<string, string>>(initialState.tabCwds);

    // Persistencia reactiva en localStorage cada vez que cambien las pestañas, grupos, foco o rutas
    useEffect(() => {
        try {
            if (tabs.length > 0) {
                const sessionData: SavedSession = {
                    tabs: tabs.map((t) => ({
                        id: t.id,
                        title: t.title,
                        cwd: tabCwds[t.id] || t.cwd,
                        color: t.color,
                        groupId: t.groupId,
                    })),
                    activeTabId,
                    tabCwds,
                    groups,
                };
                localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sessionData));
            }
        } catch (err) {
            console.warn("[Session] Error al guardar sesión en localStorage:", err);
        }
    }, [tabs, activeTabId, tabCwds, groups]);

    // Mantener la sincronización de selectedTabIds si se eliminan pestañas
    useEffect(() => {
        setSelectedTabIds((prev) => {
            const valid = new Set<string>();
            prev.forEach((id) => {
                if (tabs.some((t) => t.id === id)) {
                    valid.add(id);
                }
            });
            if (valid.size === 0 && tabs.length > 0) {
                valid.add(activeTabId);
            }
            return valid;
        });
    }, [tabs, activeTabId]);

    const handleAddTab = useCallback(() => {
        const nextIndex = tabs.length + 1;
        const newId = `term-${Date.now()}`;
        const currentActiveCwd = tabCwds[activeTabId];
        const newTitle = currentActiveCwd
            ? extractFolderName(currentActiveCwd)
            : `terminal ${nextIndex}`;

        setTabs((prev) => [
            ...prev,
            { id: newId, title: newTitle, cwd: currentActiveCwd },
        ]);
        if (currentActiveCwd) {
            setTabCwds((prev) => ({ ...prev, [newId]: currentActiveCwd }));
        }
        setActiveTabId(newId);
        setSelectedTabIds(new Set([newId]));
        lastSelectedTabIdRef.current = newId;
        showToast(`Nueva pestaña: ${newTitle}`);
    }, [tabs.length, activeTabId, tabCwds, showToast]);

    // Cierre múltiple de pestañas con soporte de animación fluida
    const handleCloseTabs = useCallback(
        (idsToClose: string[]) => {
            if (idsToClose.length === 0) return;

            // Si se intentan cerrar todas las pestañas de la app:
            if (idsToClose.length >= tabs.length) {
                const firstId = tabs[0].id;
                tabRefs.current[firstId]?.restart();
                setTabs([{ id: firstId, title: "terminal 1" }]);
                setGroups([]);
                setActiveTabId(firstId);
                setSelectedTabIds(new Set([firstId]));
                lastSelectedTabIdRef.current = firstId;
                showToast("Sesión reiniciada");
                return;
            }

            const closeSet = new Set(idsToClose);
            setClosingTabIds((prev) => new Set([...prev, ...idsToClose]));

            const remaining = tabs.filter((t) => !closeSet.has(t.id));

            // Si la activa está entre las que se cierran, cambiar a una pestaña contigua
            if (closeSet.has(activeTabId) && remaining.length > 0) {
                const firstClosedIdx = tabs.findIndex((t) => closeSet.has(t.id));
                const nextActive = remaining[Math.min(Math.max(0, firstClosedIdx - 1), remaining.length - 1)].id;
                setActiveTabId(nextActive);
                setSelectedTabIds(new Set([nextActive]));
                lastSelectedTabIdRef.current = nextActive;
            } else {
                setSelectedTabIds((prev) => {
                    const next = new Set(prev);
                    idsToClose.forEach((id) => next.delete(id));
                    if (next.size === 0 && remaining.length > 0) {
                        next.add(remaining[0].id);
                        lastSelectedTabIdRef.current = remaining[0].id;
                    }
                    return next;
                });
            }

            setTimeout(() => {
                idsToClose.forEach((id) => {
                    delete tabRefs.current[id];
                });

                setTabCwds((prev) => {
                    const next = { ...prev };
                    idsToClose.forEach((id) => delete next[id]);
                    return next;
                });

                setTabs((prev) => prev.filter((t) => !closeSet.has(t.id)));
                setClosingTabIds((prev) => {
                    const next = new Set(prev);
                    idsToClose.forEach((id) => next.delete(id));
                    return next;
                });

                // Limpiar grupos que queden sin pestañas
                setGroups((prevGroups) =>
                    prevGroups.filter((g) =>
                        remaining.some((t) => t.groupId === g.id)
                    )
                );

                showToast(
                    idsToClose.length === 1
                        ? "Pestaña cerrada"
                        : `${idsToClose.length} pestañas cerradas`
                );
            }, 180);
        },
        [tabs, activeTabId, showToast]
    );

    const handleCloseTab = useCallback(
        (idToClose: string, e?: React.MouseEvent) => {
            if (e) e.stopPropagation();
            handleCloseTabs([idToClose]);
        },
        [handleCloseTabs]
    );

    const handleCwdUpdate = useCallback(
        (tabId: string, newPath: string) => {
            if (!newPath || !newPath.trim()) return;
            const cleanPath = newPath.trim();

            setTabCwds((prev) => {
                if (prev[tabId] === cleanPath) return prev;
                return { ...prev, [tabId]: cleanPath };
            });

            const folderName = extractFolderName(cleanPath);
            setTabs((prev) =>
                prev.map((t) =>
                    t.id === tabId ? { ...t, title: folderName, cwd: cleanPath } : t
                )
            );

            onTabCwdChange?.(tabId, cleanPath);
        },
        [onTabCwdChange]
    );

    const handleReorderTabs = useCallback((fromIndex: number, toIndex: number) => {
        if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return;
        setTabs((prev) => {
            if (fromIndex >= prev.length || toIndex >= prev.length) return prev;
            const updated = [...prev];
            const [movedItem] = updated.splice(fromIndex, 1);
            updated.splice(toIndex, 0, movedItem);
            return updated;
        });
    }, []);

    // Reordenamiento unificado e interactivo de pestañas y pastillas de grupos
    const handleUnifiedDrop = useCallback(
        (
            from: { type: "tab" | "group"; id: string },
            to: { type: "tab" | "group"; id: string },
            isMovingRight: boolean
        ) => {
            if (from.type === to.type && from.id === to.id) return;

            setTabs((prev) => {
                if (from.type === "tab") {
                    const fromTab = prev.find((t) => t.id === from.id);
                    if (!fromTab) return prev;

                    const withoutFrom = prev.filter((t) => t.id !== from.id);
                    let targetGroupId = fromTab.groupId;
                    let insertIndex = 0;

                    if (to.type === "tab") {
                        const toIndex = withoutFrom.findIndex((t) => t.id === to.id);
                        if (toIndex === -1) return prev;
                        const toTab = withoutFrom[toIndex];
                        const toGroup = toTab.groupId ? groups.find((g) => g.id === toTab.groupId) : null;

                        // Solo unirse al grupo si el grupo de la pestaña destino está abierto/expandido
                        if (toTab.groupId && toGroup && !toGroup.collapsed) {
                            targetGroupId = toTab.groupId;
                        } else {
                            targetGroupId = undefined;
                        }
                        insertIndex = isMovingRight ? toIndex + 1 : toIndex;
                    } else {
                        // to es una pastilla de grupo
                        const targetGroup = groups.find((g) => g.id === to.id);
                        const isGroupClosed = Boolean(targetGroup?.collapsed);

                        if (isGroupClosed) {
                            // REGLA CRÍTICA: SI EL GRUPO ESTÁ CERRADO, NO SE PUEDE AGREGAR NINGUNA PESTAÑA DENTRO
                            targetGroupId = undefined;
                            if (isMovingRight) {
                                // Se arrastró hacia la derecha pasando el grupo cerrado: colocar DESPUÉS de todo el grupo
                                const lastGroupTabIdx = withoutFrom.map((t) => t.groupId).lastIndexOf(to.id);
                                insertIndex = lastGroupTabIdx !== -1 ? lastGroupTabIdx + 1 : withoutFrom.length;
                            } else {
                                // Se arrastró hacia la izquierda antes del grupo cerrado: colocar ANTES de todo el grupo
                                const firstGroupTabIdx = withoutFrom.findIndex((t) => t.groupId === to.id);
                                insertIndex = firstGroupTabIdx !== -1 ? firstGroupTabIdx : 0;
                            }
                        } else {
                            // El grupo está ABIERTO/EXPANDIDO:
                            const groupFirstTabIdx = withoutFrom.findIndex((t) => t.groupId === to.id);
                            if (isMovingRight) {
                                targetGroupId = to.id;
                                insertIndex = groupFirstTabIdx !== -1 ? groupFirstTabIdx : withoutFrom.length;
                            } else {
                                targetGroupId = undefined;
                                insertIndex = groupFirstTabIdx !== -1 ? Math.max(0, groupFirstTabIdx) : 0;
                            }
                        }
                    }

                    const updatedTab: TabItem = {
                        ...fromTab,
                        groupId: targetGroupId,
                        color: targetGroupId
                            ? (groups.find((g) => g.id === targetGroupId)?.color || fromTab.color)
                            : fromTab.color,
                    };

                    const result = [...withoutFrom];
                    result.splice(Math.max(0, Math.min(insertIndex, result.length)), 0, updatedTab);
                    return result;
                } else {
                    // from.type === "group" (se arrastró el pill del grupo completo)
                    const groupId = from.id;
                    const groupTabs = prev.filter((t) => t.groupId === groupId);
                    if (groupTabs.length === 0) return prev;

                    const withoutGroup = prev.filter((t) => t.groupId !== groupId);
                    let insertIndex = 0;

                    if (to.type === "tab") {
                        const toIdx = withoutGroup.findIndex((t) => t.id === to.id);
                        if (toIdx !== -1) {
                            insertIndex = isMovingRight ? toIdx + 1 : toIdx;
                        } else {
                            insertIndex = isMovingRight ? withoutGroup.length : 0;
                        }
                    } else {
                        const otherGroupTabsIdx = withoutGroup.findIndex((t) => t.groupId === to.id);
                        if (otherGroupTabsIdx !== -1) {
                            if (isMovingRight) {
                                const lastIdx = withoutGroup.map((t) => t.groupId).lastIndexOf(to.id);
                                insertIndex = lastIdx + 1;
                            } else {
                                insertIndex = otherGroupTabsIdx;
                            }
                        } else {
                            insertIndex = isMovingRight ? withoutGroup.length : 0;
                        }
                    }

                    const result = [...withoutGroup];
                    result.splice(Math.max(0, Math.min(insertIndex, result.length)), 0, ...groupTabs);
                    return result;
                }
            });
        },
        [groups]
    );

    const handleSetTabColor = useCallback((tabIds: string | string[], color?: string) => {
        const idList = Array.isArray(tabIds) ? tabIds : [tabIds];
        const targetIdSet = new Set(idList);
        setTabs((prev) =>
            prev.map((t) => (targetIdSet.has(t.id) ? { ...t, color } : t))
        );
    }, []);

    // ============================================================
    // GESTIÓN DE GRUPOS DE PESTAÑAS (TAB GROUPS)
    // ============================================================
    const handleCreateGroup = useCallback(
        (tabIds: string | string[], title: string, color: string) => {
            const idList = Array.isArray(tabIds) ? tabIds : [tabIds];
            if (idList.length === 0) return;

            const cleanTitle = title.trim() || "Grupo";
            const newGroupId = `group-${Date.now()}`;
            const newGroup: TabGroup = {
                id: newGroupId,
                title: cleanTitle,
                color,
                collapsed: false,
            };

            const targetIdSet = new Set(idList);

            setGroups((prev) => [...prev, newGroup]);
            setTabs((prev) => {
                // Separar pestañas seleccionadas y resto
                const targetTabs = prev.filter((t) => targetIdSet.has(t.id));
                const remainingTabs = prev.filter((t) => !targetIdSet.has(t.id));

                const firstIndex = prev.findIndex((t) => targetIdSet.has(t.id));
                const insertIndex =
                    firstIndex !== -1
                        ? Math.min(firstIndex, remainingTabs.length)
                        : remainingTabs.length;

                const updatedGroupTabs = targetTabs.map((t) => ({
                    ...t,
                    groupId: newGroupId,
                    color: t.color || color,
                }));

                const result = [...remainingTabs];
                result.splice(insertIndex, 0, ...updatedGroupTabs);
                return result;
            });

            showToast(
                idList.length === 1
                    ? `Grupo "${cleanTitle}" creado`
                    : `Grupo "${cleanTitle}" creado con ${idList.length} pestañas`
            );
        },
        [showToast]
    );

    const handleAssignTabToGroup = useCallback(
        (tabIds: string | string[], targetGroupId: string | undefined) => {
            const idList = Array.isArray(tabIds) ? tabIds : [tabIds];
            if (idList.length === 0) return;

            const targetIdSet = new Set(idList);

            if (!targetGroupId) {
                // Quitar del grupo
                setTabs((prev) =>
                    prev.map((t) =>
                        targetIdSet.has(t.id) ? { ...t, groupId: undefined } : t
                    )
                );
                // Si algún grupo quedó vacío, removerlo
                setGroups((prevGroups) =>
                    prevGroups.filter((g) =>
                        tabs.some((t) => !targetIdSet.has(t.id) && t.groupId === g.id)
                    )
                );
                showToast(
                    idList.length === 1
                        ? "Pestaña quitada del grupo"
                        : `${idList.length} pestañas quitadas del grupo`
                );
                return;
            }

            const group = groups.find((g) => g.id === targetGroupId);
            if (!group) return;

            setTabs((prev) => {
                const movingTabs = prev.filter((t) => targetIdSet.has(t.id));
                const otherTabs = prev.filter((t) => !targetIdSet.has(t.id));

                let lastGroupIndex = -1;
                for (let i = otherTabs.length - 1; i >= 0; i--) {
                    if (otherTabs[i].groupId === targetGroupId) {
                        lastGroupIndex = i;
                        break;
                    }
                }

                const updatedMovingTabs = movingTabs.map((t) => ({
                    ...t,
                    groupId: targetGroupId,
                    color: t.color || group.color,
                }));

                const result = [...otherTabs];
                if (lastGroupIndex !== -1) {
                    result.splice(lastGroupIndex + 1, 0, ...updatedMovingTabs);
                } else {
                    result.push(...updatedMovingTabs);
                }
                return result;
            });

            // Expandir el grupo si estaba colapsado para ver la nueva pestaña
            if (group.collapsed) {
                setGroups((prev) =>
                    prev.map((g) =>
                        g.id === targetGroupId ? { ...g, collapsed: false } : g
                    )
                );
            }

            showToast(
                idList.length === 1
                    ? `Pestaña añadida a "${group.title}"`
                    : `${idList.length} pestañas añadidas a "${group.title}"`
            );
        },
        [groups, tabs, showToast]
    );

    const handleToggleGroupCollapsed = useCallback((groupId: string) => {
        setGroups((prev) =>
            prev.map((g) =>
                g.id === groupId ? { ...g, collapsed: !g.collapsed } : g
            )
        );
    }, []);

    const handleUpdateGroup = useCallback(
        (groupId: string, title: string, color: string) => {
            const cleanTitle = title.trim() || "Grupo";
            setGroups((prev) =>
                prev.map((g) =>
                    g.id === groupId ? { ...g, title: cleanTitle, color } : g
                )
            );
            // Actualizar también el color de las pestañas del grupo
            setTabs((prev) =>
                prev.map((t) =>
                    t.groupId === groupId ? { ...t, color } : t
                )
            );
            showToast(`Grupo actualizado: "${cleanTitle}"`);
        },
        [showToast]
    );

    const handleUngroupTabs = useCallback(
        (groupId: string) => {
            setTabs((prev) =>
                prev.map((t) =>
                    t.groupId === groupId ? { ...t, groupId: undefined } : t
                )
            );
            setGroups((prev) => prev.filter((g) => g.id !== groupId));
            showToast("Pestañas desagrupadas");
        },
        [showToast]
    );

    const handleCloseGroup = useCallback(
        (groupId: string) => {
            const tabsInGroup = tabs.filter((t) => t.groupId === groupId);
            if (tabsInGroup.length === 0) {
                setGroups((prev) => prev.filter((g) => g.id !== groupId));
                return;
            }

            const idsToClose = tabsInGroup.map((t) => t.id);
            handleCloseTabs(idsToClose);
        },
        [tabs, handleCloseTabs]
    );

    // Reordenar un grupo entero a la izquierda o a la derecha
    const handleReorderGroup = useCallback(
        (groupId: string, direction: "left" | "right") => {
            setTabs((prev) => {
                const groupTabs = prev.filter((t) => t.groupId === groupId);
                if (groupTabs.length === 0) return prev;

                const nonGroupTabs = prev.filter((t) => t.groupId !== groupId);

                const groupFirstIndex = prev.findIndex((t) => t.groupId === groupId);
                const groupLastIndex = prev.map((t) => t.groupId).lastIndexOf(groupId);

                if (direction === "left") {
                    if (groupFirstIndex <= 0) return prev;
                    const prevItem = prev[groupFirstIndex - 1];
                    let insertIdx = 0;
                    if (prevItem.groupId) {
                        insertIdx = nonGroupTabs.findIndex(
                            (t) => t.groupId === prevItem.groupId
                        );
                    } else {
                        insertIdx = nonGroupTabs.findIndex((t) => t.id === prevItem.id);
                    }
                    const result = [...nonGroupTabs];
                    result.splice(Math.max(0, insertIdx), 0, ...groupTabs);
                    return result;
                } else {
                    if (groupLastIndex >= prev.length - 1) return prev;
                    const nextItem = prev[groupLastIndex + 1];
                    let insertIdx = nonGroupTabs.length;
                    if (nextItem.groupId) {
                        const lastOfNext = nonGroupTabs
                            .map((t) => t.groupId)
                            .lastIndexOf(nextItem.groupId);
                        insertIdx = lastOfNext + 1;
                    } else {
                        insertIdx =
                            nonGroupTabs.findIndex((t) => t.id === nextItem.id) + 1;
                    }
                    const result = [...nonGroupTabs];
                    result.splice(Math.min(result.length, insertIdx), 0, ...groupTabs);
                    return result;
                }
            });
            showToast("Grupo reordenado");
        },
        [showToast]
    );

    // Mover grupo a una posición de índice arbitraria (para drag & drop del pill de grupo)
    const handleMoveGroupToIndex = useCallback(
        (groupId: string, targetIndex: number) => {
            setTabs((prev) => {
                const groupTabs = prev.filter((t) => t.groupId === groupId);
                if (groupTabs.length === 0) return prev;
                const nonGroupTabs = prev.filter((t) => t.groupId !== groupId);
                const clamped = Math.max(0, Math.min(targetIndex, nonGroupTabs.length));
                const result = [...nonGroupTabs];
                result.splice(clamped, 0, ...groupTabs);
                return result;
            });
        },
        []
    );

    // Selección de pestañas con soporte para Shift (rango) y Cmd/Ctrl (individual múltiple)
    const handleSelectTabWithModifiers = useCallback(
        (tabId: string, modifiers?: { shiftKey?: boolean; metaKey?: boolean; ctrlKey?: boolean }) => {
            const tab = tabs.find((t) => t.id === tabId);
            if (!tab) return;

            // Auto-expandir grupo si estaba colapsado
            if (tab.groupId) {
                setGroups((prev) =>
                    prev.map((g) =>
                        g.id === tab.groupId && g.collapsed
                            ? { ...g, collapsed: false }
                            : g
                    )
                );
            }

            if (modifiers?.shiftKey) {
                const anchorId = lastSelectedTabIdRef.current || activeTabId;
                const anchorIndex = tabs.findIndex((t) => t.id === anchorId);
                const targetIndex = tabs.findIndex((t) => t.id === tabId);

                if (anchorIndex !== -1 && targetIndex !== -1) {
                    const start = Math.min(anchorIndex, targetIndex);
                    const end = Math.max(anchorIndex, targetIndex);
                    const rangeIds = tabs.slice(start, end + 1).map((t) => t.id);
                    setSelectedTabIds(new Set(rangeIds));
                } else {
                    setSelectedTabIds(new Set([tabId]));
                }
                setActiveTabId(tabId);
            } else if (modifiers?.metaKey || modifiers?.ctrlKey) {
                setSelectedTabIds((prev) => {
                    const next = new Set(prev);
                    if (next.has(tabId)) {
                        if (next.size > 1) {
                            next.delete(tabId);
                        }
                    } else {
                        next.add(tabId);
                    }
                    return next;
                });
                setActiveTabId(tabId);
                lastSelectedTabIdRef.current = tabId;
            } else {
                setSelectedTabIds(new Set([tabId]));
                setActiveTabId(tabId);
                lastSelectedTabIdRef.current = tabId;
            }
        },
        [tabs, activeTabId]
    );

    return {
        tabs,
        groups,
        activeTabId,
        selectedTabIds,
        closingTabIds,
        tabRefs,
        tabCwds,
        setActiveTabId,
        handleSelectTabWithModifiers,
        handleAddTab,
        handleCloseTab,
        handleCloseTabs,
        handleCwdUpdate,
        handleReorderTabs,
        handleSetTabColor,
        handleCreateGroup,
        handleAssignTabToGroup,
        handleToggleGroupCollapsed,
        handleUpdateGroup,
        handleUngroupTabs,
        handleCloseGroup,
        handleReorderGroup,
        handleMoveGroupToIndex,
        handleUnifiedDrop,
    };
}
