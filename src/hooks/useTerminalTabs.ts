import { useState, useRef, useCallback } from "react";
import { TabItem, TerminalHandle } from "../types";
import { extractFolderName } from "../utils";

export function useTerminalTabs(
    showToast: (msg: string) => void,
    onTabCwdChange?: (tabId: string, cleanPath: string) => void
) {
    const [tabs, setTabs] = useState<TabItem[]>([
        { id: "term-1", title: "terminal 1" },
    ]);
    const [activeTabId, setActiveTabId] = useState<string>("term-1");
    const tabRefs = useRef<Record<string, TerminalHandle | null>>({});
    const [tabCwds, setTabCwds] = useState<Record<string, string>>({});

    const handleAddTab = useCallback(() => {
        const nextIndex = tabs.length + 1;
        const newId = `term-${Date.now()}`;
        const newTitle = `terminal ${nextIndex}`;
        setTabs((prev) => [...prev, { id: newId, title: newTitle }]);
        setActiveTabId(newId);
        showToast(`Nueva pestaña: ${newTitle}`);
    }, [tabs.length, showToast]);

    const handleCloseTab = useCallback((idToClose: string, e?: React.MouseEvent) => {
        if (e) e.stopPropagation();

        if (tabs.length === 1) {
            tabRefs.current[idToClose]?.restart();
            showToast("Pestaña reiniciada");
            return;
        }

        const indexToClose = tabs.findIndex((t) => t.id === idToClose);
        const remaining = tabs.filter((t) => t.id !== idToClose);
        delete tabRefs.current[idToClose];

        setTabs(remaining);

        if (activeTabId === idToClose) {
            const nextActive = remaining[Math.max(0, indexToClose - 1)].id;
            setActiveTabId(nextActive);
        }
        showToast("Pestaña cerrada");
    }, [tabs, activeTabId, showToast]);

    const handleCwdUpdate = useCallback((tabId: string, newPath: string) => {
        if (!newPath || !newPath.trim()) return;
        const cleanPath = newPath.trim();

        setTabCwds((prev) => {
            if (prev[tabId] === cleanPath) return prev;
            return { ...prev, [tabId]: cleanPath };
        });

        const folderName = extractFolderName(cleanPath);
        setTabs((prev) =>
            prev.map((t) => (t.id === tabId ? { ...t, title: folderName } : t))
        );

        onTabCwdChange?.(tabId, cleanPath);
    }, [onTabCwdChange]);

    return {
        tabs,
        activeTabId,
        tabRefs,
        tabCwds,
        setActiveTabId,
        handleAddTab,
        handleCloseTab,
        handleCwdUpdate,
    };
}
