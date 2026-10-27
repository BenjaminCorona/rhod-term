import { SlidersHorizontal } from "lucide-react";

interface StatusBarProps {
    appVersion: string;
    sessionsCount: number;
    modSymbol: string;
    onCopyVersion?: () => void;
    onOpenSettings: (tab?: "general" | "temas" | "tipografia" | "atajos") => void;
}

export function StatusBar({
    appVersion,
    sessionsCount,
    modSymbol,
    onCopyVersion,
    onOpenSettings,
}: StatusBarProps) {
    return (
        <footer className="app-statusbar">
            {/* Izquierda: Versión de Rhod */}
            <div className="status-left">
                <span
                    className="status-version"
                    onClick={onCopyVersion}
                    title="Versión de Rhod (clic para copiar)"
                >
                    v{appVersion}
                </span>
            </div>

            {/* Derecha: Conteo de sesiones y botón de configuración */}
            <div className="status-info">
                <span>
                    {sessionsCount}{" "}
                    {sessionsCount === 1 ? "sesión" : "sesiones"}
                </span>
                <span className="status-dot" />
                <div className="header-actions">
                    <button
                        type="button"
                        className="btn-action btn-settings"
                        onClick={() => onOpenSettings("general")}
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
