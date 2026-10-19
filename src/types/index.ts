export interface SystemContext {
    cwd: string;
    git_branch: string;
    node_version: string;
    shell: string;
    os: string;
    home: string;
}

export type ShortcutActionType =
    | "new-tab"
    | "close-tab"
    | "clear"
    | "restart"
    | "copy"
    | "paste"
    | "interrupt"
    | "zoom-in"
    | "zoom-out"
    | "zoom-reset"
    | "change-font";

export type ShortcutCategory = "Todos" | "Pestañas" | "Terminal" | "Navegación";

export interface ShortcutItem {
    id: string;
    keys: string[];
    label: string;
    desc: string;
    category: "Pestañas" | "Terminal" | "Navegación";
    actionType?: ShortcutActionType;
}

export interface TabItem {
    id: string;
    title: string;
}

export interface TerminalHandle {
    executeCommand: (cmd: string) => void;
    sendRaw: (data: string) => void;
    clear: () => void;
    getSelectionOrCwd: () => string;
    hasSelection: () => boolean;
    focus: () => void;
    restart: () => void;
}

export interface FontOption {
    id: string;
    name: string;
    family: string;
    desc: string;
}
