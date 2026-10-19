import { useState, useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, Square, Copy, X } from "lucide-react";

export function WindowControls() {
    const [isMaximized, setIsMaximized] = useState(false);
    const appWindow = getCurrentWindow();

    useEffect(() => {
        const checkMaximized = async () => {
            try {
                const max = await appWindow.isMaximized();
                setIsMaximized(max);
            } catch {
                // Ignorar en entornos sin soporte
            }
        };

        checkMaximized();

        // Escuchar cambios de tamaño para alternar entre icono Maximizar y Restaurar
        const unlistenPromise = appWindow.onResized(() => {
            checkMaximized();
        });

        return () => {
            unlistenPromise.then((fn) => fn()).catch(() => {});
        };
    }, [appWindow]);

    const handleMinimize = () => {
        appWindow.minimize().catch(console.error);
    };

    const handleToggleMaximize = () => {
        appWindow.toggleMaximize().catch(console.error);
    };

    const handleClose = () => {
        appWindow.close().catch(console.error);
    };

    return (
        <div className="window-controls" data-tauri-drag-region={false}>
            <button
                type="button"
                className="window-control-btn btn-min"
                onClick={handleMinimize}
                title="Minimizar"
            >
                <Minus size={13} />
            </button>
            <button
                type="button"
                className="window-control-btn btn-max"
                onClick={handleToggleMaximize}
                title={isMaximized ? "Restaurar" : "Maximizar"}
            >
                {isMaximized ? <Copy size={11} /> : <Square size={11} />}
            </button>
            <button
                type="button"
                className="window-control-btn btn-close-win"
                onClick={handleClose}
                title="Cerrar"
            >
                <X size={13} />
            </button>
        </div>
    );
}
