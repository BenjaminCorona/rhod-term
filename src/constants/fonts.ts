import { FontOption } from "../types";

export const AVAILABLE_FONTS: FontOption[] = [
    {
        id: "jetbrains",
        name: "JetBrains Mono",
        family: "'JetBrains Mono', monospace",
        desc: "Moderna, limpia y ultra-legible, con altura de x generosa",
    },
    {
        id: "geist",
        name: "Geist Mono",
        family: "'Geist Mono', monospace",
        desc: "Moderna geométrica minimalista estilo Vercel / Linear",
    },
    {
        id: "system",
        name: "Sistema",
        family: "ui-monospace, 'SF Mono', Menlo, Monaco, Consolas, monospace",
        desc: "Fuente clásica del sistema (SF Mono, Menlo, Consolas)",
    },
];

export const DEFAULT_FONT_SIZE = 13.5;
export const MIN_FONT_SIZE = 9;
export const MAX_FONT_SIZE = 28;
