import {
    useEffect,
    useRef,
    useState,
    useImperativeHandle,
    forwardRef,
} from "react";
import { Terminal, ITheme } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import "@xterm/xterm/css/xterm.css";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { TerminalHandle } from "../../types";

interface TerminalPaneProps {
    id: string;
    active: boolean;
    cwd: string;
    fontSize: number;
    fontFamily: string;
    theme: ITheme;
    onCwdChange: (path: string) => void;
}

export const TerminalPane = forwardRef<TerminalHandle, TerminalPaneProps>(
    ({ id, active, cwd, fontSize, fontFamily, theme, onCwdChange }, ref) => {
        const mountRef = useRef<HTMLDivElement>(null);
        const termRef = useRef<Terminal | null>(null);
        const fitRef = useRef<FitAddon | null>(null);
        const [mountCount, setMountCount] = useState(0);

        useImperativeHandle(ref, () => ({
            executeCommand: (cmd: string) => {
                invoke("write_pty", { id, data: cmd + "\n" }).catch(console.error);
                termRef.current?.focus();
            },
            sendRaw: (data: string) => {
                invoke("write_pty", { id, data }).catch(console.error);
                termRef.current?.focus();
            },
            clear: () => {
                termRef.current?.clear();
                termRef.current?.focus();
            },
            getSelectionOrCwd: () => {
                return termRef.current?.getSelection() || cwd;
            },
            hasSelection: () => {
                return Boolean(termRef.current?.hasSelection());
            },
            focus: () => {
                termRef.current?.focus();
            },
            restart: () => {
                invoke("close_pty", { id }).catch(console.error);
                setMountCount((prev) => prev + 1);
            },
        }));

        useEffect(() => {
            if (!mountRef.current) return;

            let isDisposed = false;
            let unlistenOutput: (() => void) | null = null;
            let writeBuffer = "";
            let rafId: number | null = null;

            // Flujo de salida batcheado: agrupa micro-chunks de streaming para evitar desalineación de ANSI
            const flushBuffer = () => {
                if (rafId !== null) {
                    cancelAnimationFrame(rafId);
                    rafId = null;
                }
                if (writeBuffer && termRef.current && !isDisposed) {
                    termRef.current.write(writeBuffer);
                    writeBuffer = "";
                }
            };

            const term = new Terminal({
                cursorBlink: true,
                cursorStyle: "bar",
                fontSize: fontSize,
                fontFamily: fontFamily,
                letterSpacing: 0,
                lineHeight: 1.15,
                scrollback: 5000,
                smoothScrollDuration: 0,
                allowTransparency: true,
                allowProposedApi: true,
                theme: theme,
            });

            let unicode11Addon: Unicode11Addon | null = null;
            try {
                unicode11Addon = new Unicode11Addon();
                term.loadAddon(unicode11Addon);
                term.unicode.activeVersion = "11";
            } catch (err) {
                console.warn("[xterm] No se pudo activar Unicode11Addon:", err);
            }

            // Permitir atajos globales (Cmd/Ctrl + T, W, K, +, -, 0, etc.)
            term.attachCustomKeyEventHandler((e: KeyboardEvent) => {
                const isCmdOrCtrl = e.metaKey || e.ctrlKey;
                const key = e.key.toLowerCase();

                if (isCmdOrCtrl) {
                    if (["t", "w", "k", "r", ",", "+", "-", "=", "_", "0"].includes(key)) {
                        return false;
                    }
                    if (e.shiftKey && ["t", "f", "c", "v"].includes(key)) {
                        return false;
                    }
                    if (/^[1-9]$/.test(e.key)) {
                        return false;
                    }
                }
                return true;
            });

            // Parser OSC 7 para tracking de CWD
            const osc7Disposable = term.parser.registerOscHandler(7, (data) => {
                try {
                    let path = data;
                    if (path.startsWith("file://")) {
                        try {
                            path = decodeURIComponent(new URL(data).pathname);
                        } catch {
                            path = decodeURIComponent(
                                data.replace(/^file:\/\/[^/]*/, "")
                            );
                        }
                    }
                    path = path.replace(/^\/([a-zA-Z]:)/, "$1");
                    if (path && path.trim()) {
                        onCwdChange(path.trim());
                    }
                    return true;
                } catch {
                    return false;
                }
            });

            const fitAddon = new FitAddon();
            term.loadAddon(fitAddon);

            term.open(mountRef.current);
            termRef.current = term;
            fitRef.current = fitAddon;

            // Función centralizada para recalcular columnas/filas y sincronizarlas de inmediato con el PTY
            const syncDimensions = () => {
                if (isDisposed || !mountRef.current || !fitRef.current || !termRef.current) return;
                try {
                    fitRef.current.fit();
                    const cols = termRef.current.cols;
                    const rows = termRef.current.rows;
                    if (cols > 0 && rows > 0) {
                        invoke("resize_pty", { id, rows, cols }).catch(console.error);
                    }
                } catch {
                    // Ignorar si el contenedor aún no tiene dimensiones válidas
                }
            };

            // Intentar ajuste inicial
            try {
                fitAddon.fit();
            } catch {
                // Ignorar
            }

            // Sincronización nativa de dimensiones xterm -> PTY
            const onResizeDisposable = term.onResize(({ cols, rows }) => {
                if (!isDisposed && cols > 0 && rows > 0) {
                    invoke("resize_pty", { id, rows, cols }).catch(console.error);
                }
            });

            // Escuchar salida del PTY con promesa segura para evitar listeners zombies
            const unlistenPromise = listen<string>(`pty-output-${id}`, (event) => {
                if (!isDisposed) {
                    writeBuffer += event.payload;
                    if (writeBuffer.length > 32768) {
                        flushBuffer();
                    } else if (rafId === null) {
                        rafId = requestAnimationFrame(flushBuffer);
                    }
                }
            });

            unlistenPromise
                .then((fn) => {
                    if (isDisposed) {
                        fn();
                    } else {
                        unlistenOutput = fn;
                    }
                })
                .catch(console.error);

            // Iniciar PTY con dimensiones calculadas desde el inicio
            const initialCols = term.cols > 0 ? term.cols : 80;
            const initialRows = term.rows > 0 ? term.rows : 24;

            invoke("start_pty", { id, cols: initialCols, rows: initialRows })
                .then(() => {
                    if (isDisposed) return;
                    syncDimensions();
                    if (active) {
                        term.focus();
                    }

                    invoke<string>("get_tab_cwd", { id })
                        .then((p) => {
                            if (p && !isDisposed) onCwdChange(p.trim());
                        })
                        .catch(() => {});
                })
                .catch((err) => {
                    if (isDisposed) return;
                    console.error("Error al iniciar PTY:", err);
                    term.write(`\r\n\x1b[31mError al iniciar la terminal: ${err}\x1b[0m\r\n`);
                });

            const onDataDisposable = term.onData((data) => {
                invoke("write_pty", { id, data }).catch(console.error);

                invoke<string>("get_tab_cwd", { id })
                    .then((p) => {
                        if (p && !isDisposed) onCwdChange(p.trim());
                    })
                    .catch(() => {});
            });

            // Observador de cambio de tamaño del contenedor
            const resizeObserver = new ResizeObserver(() => {
                if (!isDisposed && mountRef.current && mountRef.current.clientHeight > 0) {
                    syncDimensions();
                }
            });

            resizeObserver.observe(mountRef.current);

            // Escuchar resize de ventana
            window.addEventListener("resize", syncDimensions);

            // Asegurar que las fuentes web cargadas recalculen las métricas sin distorsionar columnas
            document.fonts.ready.then(() => {
                if (!isDisposed) {
                    syncDimensions();
                }
            });

            // Timers escalonados para atrapar el renderizado y estabilización del layout en WebKit
            const t1 = setTimeout(syncDimensions, 40);
            const t2 = setTimeout(syncDimensions, 120);
            const t3 = setTimeout(syncDimensions, 300);

            return () => {
                isDisposed = true;
                if (rafId !== null) {
                    cancelAnimationFrame(rafId);
                    rafId = null;
                }
                clearTimeout(t1);
                clearTimeout(t2);
                clearTimeout(t3);
                window.removeEventListener("resize", syncDimensions);
                resizeObserver.disconnect();
                onResizeDisposable.dispose();
                onDataDisposable.dispose();
                osc7Disposable.dispose();
                if (unicode11Addon) unicode11Addon.dispose();

                if (unlistenOutput) {
                    unlistenOutput();
                    unlistenOutput = null;
                } else {
                    unlistenPromise.then((fn) => fn()).catch(() => {});
                }

                invoke("close_pty", { id }).catch(console.error);
                term.dispose();
                termRef.current = null;
                fitRef.current = null;
            };
        }, [id, mountCount]);

        // Actualizar tamaño y tipo de fuente dinámicamente
        useEffect(() => {
            if (termRef.current && fitRef.current) {
                termRef.current.options.fontSize = fontSize;
                termRef.current.options.fontFamily = fontFamily;
                try {
                    fitRef.current.fit();
                    const cols = termRef.current.cols;
                    const rows = termRef.current.rows;
                    if (cols > 0 && rows > 0) {
                        invoke("resize_pty", { id, rows, cols }).catch(console.error);
                    }
                } catch {
                    // Ignorar
                }
            }
        }, [fontSize, fontFamily, id]);

        // Actualizar paleta de colores dinámicamente cuando el tema cambia
        useEffect(() => {
            if (termRef.current) {
                termRef.current.options.theme = theme;
            }
        }, [theme]);

        // Cuando la pestaña pasa a ser activa, redimensionar y enfocar
        useEffect(() => {
            if (active && termRef.current && fitRef.current) {
                const timer = setTimeout(() => {
                    try {
                        fitRef.current?.fit();
                        const cols = termRef.current?.cols ?? 0;
                        const rows = termRef.current?.rows ?? 0;
                        if (cols > 0 && rows > 0) {
                            invoke("resize_pty", { id, rows, cols }).catch(console.error);
                        }
                        termRef.current?.focus();
                    } catch {
                        // Ignorar
                    }
                }, 20);
                return () => clearTimeout(timer);
            }
        }, [active, id]);

        return (
            <div
                ref={mountRef}
                className="terminal-pane"
                style={{ display: active ? "block" : "none" }}
            />
        );
    }
);

TerminalPane.displayName = "TerminalPane";
