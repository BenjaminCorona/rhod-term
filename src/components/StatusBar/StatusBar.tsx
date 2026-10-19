import { Folder, GitBranch, Type, Palette, SlidersHorizontal } from "lucide-react";
import { SystemContext, FontOption, ThemeOption } from "../../types";

interface StatusBarProps {
    context: SystemContext;
    displayPath: string;
    currentFont: FontOption;
    fontSize: number;
    currentTheme: ThemeOption;
    sessionsCount: number;
    modSymbol: string;
    onCopyPath: () => void;
    onGitStatus: () => void;
    onOpenSettings: (tab?: "temas" | "tipografia" | "atajos") => void;
}

export function StatusBar({
    context,
    displayPath,
    currentFont,
    fontSize,
    currentTheme,
    sessionsCount,
    modSymbol,
    onCopyPath,
    onGitStatus,
    onOpenSettings,
}: StatusBarProps) {
    return (
        <footer className="app-statusbar">
            <div className="status-group">
                <div
                    className="status-item"
                    onClick={onCopyPath}
                    title="Clic para copiar ruta"
                >
                    <Folder size={12} />
                    <span>{displayPath}</span>
                </div>

                <div
                    className="status-item"
                    onClick={onGitStatus}
                    title="Clic para ver git status"
                >
                    <GitBranch size={12} />
                    <span>{context.git_branch}</span>
                </div>

                {context.node_version !== "-" && (
                    <div className="status-item" title="Versión de Node.js">
                        <span>node {context.node_version}</span>
                    </div>
                )}

                <div className="status-item" title="Shell activo">
                    <span>{context.shell}</span>
                </div>
            </div>

            <div className="status-info">
                {/* Indicador de Tema: clic abre configuración en Temas */}
                <div
                    className="status-item theme-item"
                    onClick={() => onOpenSettings("temas")}
                    title={`Tema actual: ${currentTheme.name}\n${currentTheme.desc}\n(Clic para abrir configuración de temas)`}
                >
                    <Palette size={11} />
                    <span>{currentTheme.name}</span>
                </div>

                {/* Indicador de Fuente: clic abre configuración en Tipografía */}
                <div
                    className="status-item font-family-item"
                    onClick={() => onOpenSettings("tipografia")}
                    title={`Tipografía actual: ${currentFont.name}\n${currentFont.desc}\n(Clic para configurar tipografía y zoom)`}
                >
                    <Type size={11} />
                    <span>{currentFont.name}</span>
                </div>

                {/* Indicador de Tamaño de Fuente */}
                <div
                    className="status-item font-size-item"
                    onClick={() => onOpenSettings("tipografia")}
                    title={`Tamaño de fuente: ${fontSize}px\n(Clic para ajustar zoom)`}
                >
                    <Type size={11} />
                    <span>{fontSize}px</span>
                </div>

                <span>
                    {sessionsCount}{" "}
                    {sessionsCount === 1 ? "sesión" : "sesiones"}
                </span>
                <span className="status-dot" />
                <div className="header-actions">
                    <button
                        type="button"
                        className="btn-action btn-settings"
                        onClick={() => onOpenSettings("atajos")}
                        title={`Configuración y atajos (${modSymbol}, o ${modSymbol}K)`}
                    >
                        <SlidersHorizontal size={12} />
                        <span>Configuración</span>
                        <kbd>{modSymbol},</kbd>
                    </button>
                </div>
            </div>
        </footer>
    );
}
