export function hexToRgba(hex: string, alpha: number): string {
    let clean = hex.replace("#", "").trim();
    if (clean.length === 3) {
        clean = clean
            .split("")
            .map((c) => c + c)
            .join("");
    }
    if (clean.length !== 6) return `rgba(59, 130, 246, ${alpha})`;
    const r = parseInt(clean.substring(0, 2), 16);
    const g = parseInt(clean.substring(2, 4), 16);
    const b = parseInt(clean.substring(4, 6), 16);
    if (isNaN(r) || isNaN(g) || isNaN(b)) return `rgba(59, 130, 246, ${alpha})`;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function isValidHexColor(color: string): boolean {
    return /^#?([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(color.trim());
}

export function normalizeHexColor(color: string): string {
    let clean = color.trim();
    if (!clean.startsWith("#")) clean = "#" + clean;
    return clean.toUpperCase();
}
