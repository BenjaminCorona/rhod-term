export function formatDisplayPath(path: string, home: string): string {
    if (!path) return "~";
    let p = path;
    if (home && p.startsWith(home)) {
        return "~" + p.slice(home.length);
    }
    // Fallbacks para Windows (C:\Users\...) y Unix (/Users/..., /home/...)
    p = p.replace(/^[a-zA-Z]:[/\\]Users[/\\][^/\\]+/i, "~");
    p = p.replace(/^(\/Users|\/home)\/[^/]+/, "~");
    return p;
}

export function extractFolderName(path: string): string {
    return path.split(/[/\\]/).filter(Boolean).pop() || "terminal";
}
