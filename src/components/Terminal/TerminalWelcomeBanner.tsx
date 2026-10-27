import { Terminal, X } from "lucide-react";

interface TerminalWelcomeBannerProps {
    onDismiss: () => void;
}

export function TerminalWelcomeBanner({ onDismiss }: TerminalWelcomeBannerProps) {
    const isMac = typeof navigator !== "undefined" && navigator.userAgent.includes("Mac");
    const modKey = isMac ? "⌘" : "Ctrl";

    return (
        <div className="terminal-welcome-banner">
            <div className="terminal-welcome-header">
                <div className="terminal-welcome-title">
                    <img
                        src="/app-icon.png"
                        alt="Rhod"
                        className="terminal-welcome-logo"
                        onError={(e) => {
                            // Si la imagen falla, mostrar icono Terminal
                            e.currentTarget.style.display = "none";
                        }}
                    />
                    <Terminal size={16} className="terminal-welcome-icon" />
                    <span>Nueva sesión de terminal</span>
                </div>
                <button
                    type="button"
                    className="terminal-welcome-close"
                    onClick={onDismiss}
                    title="Cerrar guía"
                >
                    <X size={13} />
                </button>
            </div>

            <div className="terminal-welcome-shortcuts">
                <div className="terminal-welcome-item">
                    <span className="welcome-key-combo">
                        <kbd className="welcome-kbd">↵</kbd>
                    </span>
                    <span className="welcome-desc">Ejecutar comando</span>
                </div>
                <div className="terminal-welcome-item">
                    <span className="welcome-key-combo">
                        <kbd className="welcome-kbd">⇧</kbd>
                        <kbd className="welcome-kbd">↵</kbd>
                    </span>
                    <span className="welcome-desc">Salto de línea en el editor</span>
                </div>
                <div className="terminal-welcome-item">
                    <span className="welcome-key-combo">
                        <kbd className="welcome-kbd">⇥</kbd>
                        <span className="welcome-sep">o</span>
                        <kbd className="welcome-kbd">→</kbd>
                    </span>
                    <span className="welcome-desc">Aceptar sugerencias y hábitos predictivos</span>
                </div>
                <div className="terminal-welcome-item">
                    <span className="welcome-key-combo">
                        <kbd className="welcome-kbd">↑</kbd>
                        <kbd className="welcome-kbd">↓</kbd>
                    </span>
                    <span className="welcome-desc">Navegar historial de comandos</span>
                </div>
                <div className="terminal-welcome-item">
                    <span className="welcome-key-combo">
                        <kbd className="welcome-kbd">{modKey}</kbd>
                        <kbd className="welcome-kbd">E</kbd>
                    </span>
                    <span className="welcome-desc">Alternar entre editor interactivo y clásico</span>
                </div>
            </div>

            <div className="terminal-welcome-footer">
                <button
                    type="button"
                    className="terminal-welcome-dismiss-btn"
                    onClick={onDismiss}
                >
                    No volver a mostrar
                </button>
            </div>
        </div>
    );
}
