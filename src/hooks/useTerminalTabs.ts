import { useState, useRef, useCallback, useEffect } from "react";
import { TabItem, TerminalHandle } from "../types";
import { extractFolderName } from "../utils";

const SESSION_STORAGE_KEY = "rhod_terminal_session";

interface SavedSession {
    tabs: TabItem[];
    activeTabId: string;
    tabCwds: Record<string, string>;
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
                const tabs: TabItem[] = parsed.tabs.map((t: any) => ({
                    id: t.id,
                    title: t.title,
                    cwd: t.cwd,
                    color: typeof t.color === "string" ? t.color : undefined,
                }));
                const tabCwds: Record<string, string> =
                    parsed.tabCwds && typeof parsed.tabCwds === "object" ? parsed.tabCwds : {};

                let activeTabId = parsed.activeTabId;
                if (!activeTabId || !tabs.some((t) => t.id === activeTabId)) {
                    activeTabId = tabs[0].id;
                }

                return { tabs, activeTabId, tabCwds };
            }
        }
    } catch (err) {
        console.warn("[Session] Error al recuperar sesión de localStorage:", err);
    }

    return {
        tabs: [{ id: "term-1", title: "terminal 1" }],
        activeTabId: "term-1",
        tabCwds: {},
    };
}

export function useTerminalTabs(
    showToast: (msg: string) => void,
    onTabCwdChange?: (tabId: string, cleanPath: string) => void
) {
    const [initialState] = useState(getInitialSession);
    const [tabs, setTabs] = useState<TabItem[]>(initialState.tabs);
    const [activeTabId, setActiveTabId] = useState<string>(initialState.activeTabId);
    const tabRefs = useRef<Record<string, TerminalHandle | null>>({});
    const [tabCwds, setTabCwds] = useState<Record<string, string>>(initialState.tabCwds);

    // Persistencia reactiva en localStorage cada vez que cambien las pestañas, foco o rutas
    useEffect(() => {
        try {
            if (tabs.length > 0) {
                const sessionData: SavedSession = {
                    tabs: tabs.map((t) => ({
                        id: t.id,
                        title: t.title,
                        cwd: tabCwds[t.id] || t.cwd,
                        color: t.color,
                    })),
                    activeTabId,
                    tabCwds,
                };
                localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sessionData));
            }
        } catch (err) {
            console.warn("[Session] Error al guardar sesión en localStorage:", err);
        }
    }, [tabs, activeTabId, tabCwds]);

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

            const indexToClose = tabs.findIndex((t) => t.id === idToClose);
            const remaining = tabs.filter((t) => t.id !== idToClose);
            delete tabRefs.current[idToClose];

            setTabCwds((prev) => {
                const next = { ...prev };
                delete next[idToClose];
                return next;
            });

            setTabs(remaining);

            if (activeTabId === idToClose) {
                const nextActive = remaining[Math.max(0, indexToClose - 1)].id;
                setActiveTabId(nextActive);
            }
            showToast("Pestaña cerrada");
        },
        [tabs, activeTabId, showToast]
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

    return {
        tabs,
        activeTabId,
        tabRefs,
        tabCwds,
        setActiveTabId,
        handleAddTab,
        handleCloseTab,
        handleCwdUpdate,
        handleReorderTabs,
        handleSetTabColor,
    };
}
