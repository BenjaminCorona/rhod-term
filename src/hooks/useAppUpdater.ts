import { useState, useEffect, useCallback, useRef } from "react";
import { check, Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export type UpdateStatus =
    | "idle"
    | "checking"
    | "available"
    | "up-to-date"
    | "downloading"
    | "ready"
    | "error";

export function useAppUpdater(showToast: (msg: string) => void) {
    const [status, setStatus] = useState<UpdateStatus>("idle");
    const [newVersion, setNewVersion] = useState<string | null>(null);
    const [releaseNotes, setReleaseNotes] = useState<string | null>(null);
    const [downloadProgress, setDownloadProgress] = useState<number>(0);
    const updateRef = useRef<Update | null>(null);

    const checkForUpdates = useCallback(
        async (isManual = false) => {
            try {
                setStatus("checking");
                if (isManual) {
                    showToast("Buscando actualizaciones...");
                }

                const update = await check();

                if (update) {
                    updateRef.current = update;
                    setNewVersion(update.version);
                    setReleaseNotes(update.body || null);
                    setStatus("available");
                    showToast(`Nueva versión disponible: v${update.version}`);
                } else {
                    updateRef.current = null;
                    setStatus("up-to-date");
                    if (isManual) {
                        showToast("Rhod está actualizado a la última versión");
                    }
                }
            } catch (err) {
                console.warn("[Updater] Error al verificar actualización:", err);
                setStatus("error");
                if (isManual) {
                    showToast("No se pudo verificar si hay actualizaciones");
                }
            }
        },
        [showToast]
    );

    const downloadAndApplyUpdate = useCallback(async () => {
        const update = updateRef.current;
        if (!update) return;

        try {
            setStatus("downloading");
            setDownloadProgress(0);
            showToast(`Descargando Rhod v${update.version}...`);

            let totalBytes = 0;
            let downloadedBytes = 0;

            await update.downloadAndInstall((event) => {
                if (event.event === "Started") {
                    totalBytes = event.data.contentLength || 0;
                } else if (event.event === "Progress") {
                    downloadedBytes += event.data.chunkLength;
                    if (totalBytes > 0) {
                        const pct = Math.min(
                            Math.round((downloadedBytes / totalBytes) * 100),
                            100
                        );
                        setDownloadProgress(pct);
                    }
                } else if (event.event === "Finished") {
                    setDownloadProgress(100);
                }
            });

            setStatus("ready");
            showToast("Actualización instalada. Reiniciando Rhod...");

            // Esperar medio segundo para que el usuario perciba el toast antes de reiniciar
            setTimeout(async () => {
                try {
                    await relaunch();
                } catch (e) {
                    console.error("Error al reiniciar la app:", e);
                }
            }, 600);
        } catch (err) {
            console.error("[Updater] Error al descargar o instalar:", err);
            setStatus("error");
            showToast("Error al instalar la actualización");
        }
    }, [showToast]);

    const dismissUpdate = useCallback(() => {
        setStatus("idle");
    }, []);

    // Verificación automática en segundo plano tras 2.5s de abrir la app
    useEffect(() => {
        const timer = setTimeout(() => {
            checkForUpdates(false);
        }, 2500);

        return () => clearTimeout(timer);
    }, [checkForUpdates]);

    return {
        status,
        newVersion,
        releaseNotes,
        downloadProgress,
        checkForUpdates,
        downloadAndApplyUpdate,
        dismissUpdate,
    };
}
