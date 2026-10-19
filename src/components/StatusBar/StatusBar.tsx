import { Folder, GitBranch, Command, Type } from "lucide-react";
import { SystemContext, FontOption } from "../../types";

interface StatusBarProps {
    context: SystemContext;
    displayPath: string;
    currentFont: FontOption;
    fontSize: number;
    sessionsCount: number;
    modSymbol: string;
    onCopyPath: () => void;
    onGitStatus: () => void;
    onOpenPalette: () => void;
    onCycleFont: () => void;
    onResetZoom: () => void;
}

export function StatusBar({
    context,
    displayPath,
    currentFont,
    fontSize,
    sessionsCount,
    modSymbol,
    onCopyPath,
    onGitStatus,
    onOpenPalette,
    onCycleFont,
    onResetZoom,
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


                {/* Selector de fuente interactivo */}
                <div
                    className="status-item font-family-item"
                    onClick={onCycleFont}
                    title={`Tipografía actual: ${currentFont.name}\n${currentFont.desc}\n(Clic o ${modSymbol}+Shift+F para cambiar)`}
                >
                    <Type size={11} />
                    <span>{currentFont.name}</span>
                </div>

                {/* Indicador interactivo del tamaño de fuente */}
                <div
                    className="status-item font-size-item"
                    onClick={onResetZoom}
                    title={`Tamaño de fuente (${modSymbol}+ agrandar, ${modSymbol}- achicar, clic restablecer)`}
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
                        className="btn-action btn-palette"
                        onClick={onOpenPalette}
                        title={`Ver atajos de teclado (${modSymbol}K)`}
                    >
                        <Command size={13} />
                        <span>Atajos</span>
                        <kbd>{modSymbol}K</kbd>
                    </button>
                </div>
            </div>
        </footer>
    );
}
