import { useState, useEffect, useMemo, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import { SystemContext } from "../types";
import { formatDisplayPath } from "../utils";

export function useSystemContext(activeTabId: string, currentTabPath?: string) {
    const [appVersion, setAppVersion] = useState<string>("0.3.0");
    const [context, setContext] = useState<SystemContext>({
        cwd: "~",
        git_branch: "-",
        node_version: "-",
        shell: "shell",
        os: "unknown",
        home: "~",
    });

    useEffect(() => {
        getVersion()
            .then(setAppVersion)
            .catch(() => {});
    }, []);

    // Consulta inicial del contexto
    useEffect(() => {
        invoke<SystemContext>("get_context", { path: null })
            .then(setContext)
            .catch((e) => console.error("Error al obtener contexto:", e));
    }, []);

    // Actualizar contexto cuando cambia la pestaña activa o su ruta
    useEffect(() => {
        invoke<SystemContext>("get_context", { path: currentTabPath || null })
            .then(setContext)
            .catch(console.error);
    }, [activeTabId, currentTabPath]);

    const refreshContext = useCallback((path: string) => {
        invoke<SystemContext>("get_context", { path })
            .then(setContext)
            .catch(console.error);
    }, []);

    const isMac = useMemo(() => {
        if (context.os === "macos") return true;
        if (context.os === "windows" || context.os === "linux") return false;
        return typeof navigator !== "undefined" && navigator.userAgent.includes("Mac");
    }, [context.os]);

    const modSymbol = isMac ? "⌘" : "Ctrl";
    const displayPath = formatDisplayPath(context.cwd, context.home);

    return {
        context,
        appVersion,
        isMac,
        modSymbol,
        displayPath,
        refreshContext,
    };
}
