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
        showToast(`Nueva pestaña: ${newTitle}`);
    }, [tabs.length, activeTabId, tabCwds, showToast]);

    const handleCloseTab = useCallback(
        (idToClose: string, e?: React.MouseEvent) => {
            if (e) e.stopPropagation();

            if (tabs.length === 1) {
                tabRefs.current[idToClose]?.restart();
                showToast("Pestaña reiniciada");
                return;
            }

            if (closingTabIds.has(idToClose)) return;

            // Iniciar animación fluida de cierre
            setClosingTabIds((prev) => new Set(prev).add(idToClose));

            const indexToClose = tabs.findIndex((t) => t.id === idToClose);
            const remaining = tabs.filter((t) => t.id !== idToClose);

            // Cambiar de foco inmediatamente para que el usuario no sienta lag
            if (activeTabId === idToClose && remaining.length > 0) {
                const nextActive = remaining[Math.max(0, indexToClose - 1)].id;
                setActiveTabId(nextActive);
            }

            // Remover del estado después de finalizar la animación de salida (180ms)
            setTimeout(() => {
                delete tabRefs.current[idToClose];

                setTabCwds((prev) => {
                    const next = { ...prev };
                    delete next[idToClose];
                    return next;
                });

                setTabs((prev) => prev.filter((t) => t.id !== idToClose));
                setClosingTabIds((prev) => {
                    const next = new Set(prev);
                    next.delete(idToClose);
                    return next;
                });

                // Limpiar grupos vacíos
                setGroups((prevGroups) =>
                    prevGroups.filter((g) =>
                        remaining.some((t) => t.groupId === g.id)
                    )
                );

                showToast("Pestaña cerrada");
            }, 180);
        },
        [tabs, activeTabId, closingTabIds, showToast]
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

    const handleSetTabColor = useCallback((tabId: string, color?: string) => {
        setTabs((prev) =>
            prev.map((t) => (t.id === tabId ? { ...t, color } : t))
        );
    }, []);

    // ============================================================
    // GESTIÓN DE GRUPOS DE PESTAÑAS (TAB GROUPS)
    // ============================================================
    const handleCreateGroup = useCallback(
        (tabId: string, title: string, color: string) => {
            const cleanTitle = title.trim() || "Grupo";
            const newGroupId = `group-${Date.now()}`;
            const newGroup: TabGroup = {
                id: newGroupId,
                title: cleanTitle,
                color,
                collapsed: false,
            };

            setGroups((prev) => [...prev, newGroup]);
            setTabs((prev) =>
                prev.map((t) =>
                    t.id === tabId
                        ? { ...t, groupId: newGroupId, color: t.color || color }
                        : t
                )
            );
            showToast(`Grupo "${cleanTitle}" creado`);
        },
        [showToast]
    );

    const handleAssignTabToGroup = useCallback(
        (tabId: string, targetGroupId: string | undefined) => {
            if (!targetGroupId) {
                // Quitar del grupo
                setTabs((prev) =>
                    prev.map((t) =>
                        t.id === tabId ? { ...t, groupId: undefined } : t
                    )
                );
                // Si algún grupo quedó vacío, removerlo
                setGroups((prevGroups) =>
                    prevGroups.filter((g) =>
                        tabs.some((t) => t.id !== tabId && t.groupId === g.id)
                    )
                );
                showToast("Pestaña quitada del grupo");
                return;
            }

            const group = groups.find((g) => g.id === targetGroupId);
            if (!group) return;

            setTabs((prev) => {
                const tabIndex = prev.findIndex((t) => t.id === tabId);
                if (tabIndex === -1) return prev;

                // Encontrar el último índice de una pestaña de ese grupo para colocarla contigua
                let lastGroupIndex = -1;
                for (let i = prev.length - 1; i >= 0; i--) {
                    if (prev[i].groupId === targetGroupId && prev[i].id !== tabId) {
                        lastGroupIndex = i;
                        break;
                    }
                }

                const updated = [...prev];
                const [movedTab] = updated.splice(tabIndex, 1);
                const updatedTab = {
                    ...movedTab,
                    groupId: targetGroupId,
                    color: movedTab.color || group.color,
                };

                if (lastGroupIndex !== -1) {
                    const insertIndex = tabIndex < lastGroupIndex ? lastGroupIndex : lastGroupIndex + 1;
                    updated.splice(insertIndex, 0, updatedTab);
                } else {
                    updated.splice(tabIndex, 0, updatedTab);
                }
                return updated;
            });

            // Expandir el grupo si estaba colapsado para ver la nueva pestaña
            if (group.collapsed) {
                setGroups((prev) =>
                    prev.map((g) =>
                        g.id === targetGroupId ? { ...g, collapsed: false } : g
                    )
                );
            }

            showToast(`Pestaña añadida a "${group.title}"`);
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

            // Si cerrar el grupo cerraría todas las pestañas de la app:
            if (tabsInGroup.length === tabs.length) {
                const firstId = tabsInGroup[0].id;
                tabRefs.current[firstId]?.restart();
                setTabs([{ id: firstId, title: "terminal 1" }]);
                setGroups([]);
                setActiveTabId(firstId);
                showToast("Grupo cerrado (sesión reiniciada)");
                return;
            }

            // Cerrar todas las pestañas de ese grupo
            const idsToClose = new Set(tabsInGroup.map((t) => t.id));
            setTabs((prev) => prev.filter((t) => !idsToClose.has(t.id)));
            setGroups((prev) => prev.filter((g) => g.id !== groupId));

            // Si la activa estaba en el grupo, cambiar a la primera que quede
            if (idsToClose.has(activeTabId)) {
                const remaining = tabs.filter((t) => !idsToClose.has(t.id));
                if (remaining.length > 0) {
                    setActiveTabId(remaining[0].id);
                }
            }
            showToast("Grupo y sus pestañas cerradas");
        },
        [tabs, activeTabId, showToast]
    );

    // Auto-expandir grupo si la pestaña activa pertenece a un grupo colapsado
    const handleSelectTab = useCallback(
        (tabId: string) => {
            const tab = tabs.find((t) => t.id === tabId);
            if (tab?.groupId) {
                setGroups((prev) =>
                    prev.map((g) =>
                        g.id === tab.groupId && g.collapsed
                            ? { ...g, collapsed: false }
                            : g
                    )
                );
            }
            setActiveTabId(tabId);
        },
        [tabs]
    );

    return {
        tabs,
        groups,
        activeTabId,
        closingTabIds,
        tabRefs,
        tabCwds,
        setActiveTabId: handleSelectTab,
        handleAddTab,
        handleCloseTab,
        handleCwdUpdate,
        handleReorderTabs,
        handleSetTabColor,
        handleCreateGroup,
        handleAssignTabToGroup,
        handleToggleGroupCollapsed,
        handleUpdateGroup,
        handleUngroupTabs,
        handleCloseGroup,
    };
}
