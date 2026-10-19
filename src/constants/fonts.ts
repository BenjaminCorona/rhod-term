import { FontOption } from "../types";

export const AVAILABLE_FONTS: FontOption[] = [
    {
        id: "jetbrains",
        name: "JetBrains Mono",
        family: "'JetBrains Mono', monospace",
        desc: "Equilibrio perfecto, altura de x amplia y diseñada para dev",
    },
    {
        id: "geist",
        name: "Geist Mono",
        family: "'Geist Mono', monospace",
        desc: "Geométrica minimalista de alta densidad estilo Vercel / Linear",
    },
    {
        id: "martian",
        name: "Martian Mono",
        family: "'Martian Mono', monospace",
        desc: "Brutalista y futurista de Evil Martians, ultra moderna y audaz",
    },
    {
        id: "fira",
        name: "Fira Code",
        family: "'Fira Code', monospace",
        desc: "Clásico moderno de Nikita Prokopov con excelente legibilidad",
    },
    {
        id: "ibm",
        name: "IBM Plex Mono",
        family: "'IBM Plex Mono', monospace",
        desc: "Precisión industrial neo-grotesca, elegante, técnica y sobria",
    },
    {
        id: "victor",
        name: "Victor Mono",
        family: "'Victor Mono', monospace",
        desc: "Estilo distinguido con ligaduras limpias y carácter único",
    },
    {
        id: "space",
        name: "Space Mono",
        family: "'Space Mono', monospace",
        desc: "Estética retro-futurista y cyberpunk de Colophon Foundry",
    },
    {
        id: "system",
        name: "Sistema",
        family: "ui-monospace, 'SF Mono', Menlo, Monaco, Consolas, monospace",
        desc: "Tipografía nativa monoespaciada de tu sistema operativo",
    },
];

export const DEFAULT_FONT_SIZE = 13.5;
export const MIN_FONT_SIZE = 9;
export const MAX_FONT_SIZE = 28;
