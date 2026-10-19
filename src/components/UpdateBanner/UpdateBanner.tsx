import { Download, X, Loader2 } from "lucide-react";
import { UpdateStatus } from "../../hooks";

interface UpdateBannerProps {
    status: UpdateStatus;
    newVersion: string | null;
    downloadProgress: number;
    onApplyUpdate: () => void;
    onDismiss: () => void;
}

export function UpdateBanner({
    status,
    newVersion,
    downloadProgress,
    onApplyUpdate,
    onDismiss,
}: UpdateBannerProps) {
    if (status !== "available" && status !== "downloading" && status !== "ready") {
        return null;
    }

    return (
        <aside className="update-banner" aria-live="polite">
            <div className="update-banner-left">
                {status === "downloading" && (
                    <Loader2 size={14} className="update-spinner" />
                )}

                <div className="update-banner-texts">
                    {status === "available" && (
                        <span>
                            Nueva versión de Rhod disponible: <strong>v{newVersion}</strong>
                        </span>
                    )}
                    {status === "downloading" && (
                        <div className="downloading-row">
                            <span>
                                Descargando v{newVersion}...{" "}
                                {downloadProgress > 0 && `${downloadProgress}%`}
                            </span>
                            {downloadProgress > 0 && (
                                <div className="mini-progress-bar">
                                    <div
                                        className="mini-progress-fill"
                                        style={{ width: `${downloadProgress}%` }}
                                    />
                                </div>
                            )}
                        </div>
                    )}
                    {status === "ready" && (
                        <span>Actualización completada. Reiniciando Rhod...</span>
                    )}
                </div>
            </div>

            <div className="update-banner-actions">
                {status === "available" && (
                    <button
                        type="button"
                        className="btn-update-action"
                        onClick={onApplyUpdate}
                    >
                        <Download size={12} />
                        <span>Actualizar ahora</span>
                    </button>
                )}

                {status !== "downloading" && status !== "ready" && (
                    <button
                        type="button"
                        className="btn-dismiss-update"
                        onClick={onDismiss}
                        title="Ocultar"
                    >
                        <X size={13} />
                    </button>
                )}
            </div>
        </aside>
    );
}
