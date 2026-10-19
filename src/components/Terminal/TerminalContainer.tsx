import { TabItem, TerminalHandle } from "../../types";
import { TerminalPane } from "./TerminalPane";

interface TerminalContainerProps {
    tabs: TabItem[];
    activeTabId: string;
    cwd: string;
    fontSize: number;
    fontFamily: string;
    onCwdChange: (tabId: string, path: string) => void;
    tabRefs: React.MutableRefObject<Record<string, TerminalHandle | null>>;
    onFocusActiveTab: () => void;
}

export function TerminalContainer({
    tabs,
    activeTabId,
    cwd,
    fontSize,
    fontFamily,
    onCwdChange,
    tabRefs,
    onFocusActiveTab,
}: TerminalContainerProps) {
    return (
        <main className="terminal-container" onClick={onFocusActiveTab}>
            {tabs.map((tab) => (
                <TerminalPane
                    key={tab.id}
                    id={tab.id}
                    active={tab.id === activeTabId}
                    cwd={cwd}
                    fontSize={fontSize}
                    fontFamily={fontFamily}
                    onCwdChange={(newPath) => onCwdChange(tab.id, newPath)}
                    ref={(el) => {
                        tabRefs.current[tab.id] = el;
                    }}
                />
            ))}
        </main>
    );
}
