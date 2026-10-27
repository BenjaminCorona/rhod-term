import { ITheme } from "@xterm/xterm";
import { TabItem, TerminalHandle } from "../../types";
import { TerminalPane } from "./TerminalPane";

interface TerminalContainerProps {
    tabs: TabItem[];
    activeTabId: string;
    cwd: string;
    tabCwds?: Record<string, string>;
    fontSize: number;
    fontFamily: string;
    theme: ITheme;
    promptEditorMode: boolean;
    onTogglePromptEditorMode: () => void;
    onTabBusyChange?: (tabId: string, isBusy: boolean) => void;
    onCwdChange: (tabId: string, path: string) => void;
    tabRefs: React.MutableRefObject<Record<string, TerminalHandle | null>>;
    onFocusActiveTab: () => void;
}

export function TerminalContainer({
    tabs,
    activeTabId,
    cwd,
    tabCwds,
    fontSize,
    fontFamily,
    theme,
    promptEditorMode,
    onTogglePromptEditorMode,
    onTabBusyChange,
    onCwdChange,
    tabRefs,
    onFocusActiveTab,
}: TerminalContainerProps) {
    return (
        <main
            className="terminal-container"
            onClick={(e) => {
                // Si el clic ocurrió dentro del editor de comandos inferior, no robar el foco a xterm
                if ((e.target as HTMLElement).closest(".terminal-prompt-editor")) {
                    return;
                }
                onFocusActiveTab();
            }}
        >
            {tabs.map((tab) => (
                <TerminalPane
                    key={tab.id}
                    id={tab.id}
                    active={tab.id === activeTabId}
                    cwd={cwd}
                    initialCwd={tab.cwd || (tabCwds && tabCwds[tab.id]) || undefined}
                    fontSize={fontSize}
                    fontFamily={fontFamily}
                    theme={theme}
                    isPromptEditor={promptEditorMode}
                    onTogglePromptEditorMode={onTogglePromptEditorMode}
                    onBusyChange={(isBusy) => onTabBusyChange?.(tab.id, isBusy)}
                    onCwdChange={(newPath) => onCwdChange(tab.id, newPath)}
                    ref={(el) => {
                        tabRefs.current[tab.id] = el;
                    }}
                />
            ))}
        </main>
    );
}
