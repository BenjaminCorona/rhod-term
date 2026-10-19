import {
    useEffect,
    useRef,
    useState,
    useImperativeHandle,
    forwardRef,
} from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { TerminalHandle } from "../../types";
import { XTERM_THEME } from "../../constants";

interface TerminalPaneProps {
    id: string;
    active: boolean;
    cwd: string;
    fontSize: number;
    fontFamily: string;
    onCwdChange: (path: string) => void;
}

export const TerminalPane = forwardRef<TerminalHandle, TerminalPaneProps>(
    ({ id, active, cwd, fontSize, fontFamily, onCwdChange }, ref) => {
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

            const term = new Terminal({
                cursorBlink: true,
                cursorStyle: "block",
                fontSize: fontSize,
                fontFamily: fontFamily,
                letterSpacing: 0,
                lineHeight: 1.35,
                scrollback: 2500,
                smoothScrollDuration: 0,
                allowTransparency: false,
                theme: XTERM_THEME,
            });

            // Permitir atajos globales (Cmd/Ctrl + T, W, K, +, -, 0, 1..9, etc.)
            term.attachCustomKeyEventHandler((event: KeyboardEvent) => {
                const isCmdOrCtrl = event.metaKey || event.ctrlKey;
                const key = event.key.toLowerCase();

                // Permitir Ctrl+Shift+C (copiar) y Ctrl+Shift+V (pegar) en Windows/Linux
                if (isCmdOrCtrl && event.shiftKey && (key === "c" || key === "v")) {
                    return false;
                }

                // Permitir Cmd+C / Cmd+V en macOS
                if (event.metaKey && (key === "c" || key === "v")) {
                    return false;
                }

                if (
                    isCmdOrCtrl &&
                    (event.key === "+" ||
                        event.key === "=" ||
                        event.key === "-" ||
                        event.key === "_" ||
                        event.key === "0" ||
                        key === "t" ||
                        key === "w" ||
                        key === "k" ||
                        key === "r" ||
                        key === "f" ||
                        /^[1-9]$/.test(event.key))
                ) {
                    return false;
                }
                return true;
            });

            // Manejador OSC 7 cross-platform para actualizar la ruta del shell en tiempo real
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

            listen<string>(`pty-output-${id}`, (event) => {
                if (!isDisposed) {
                    term.write(event.payload);
                }
            })
                .then((fn) => {
                    if (isDisposed) fn();
                    else unlistenOutput = fn;
                })
                .catch(console.error);

            invoke("start_pty", { id })
                .then(() => {
                    if (isDisposed) return;
                    fitAddon.fit();
                    if (term.rows > 0 && term.cols > 0) {
                        invoke("resize_pty", {
                            id,
                            rows: term.rows,
                            cols: term.cols,
                        }).catch(console.error);
                    }
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

            const resizeObserver = new ResizeObserver(() => {
                if (!isDisposed && mountRef.current && mountRef.current.clientHeight > 0) {
                    try {
                        fitAddon.fit();
                        if (term.rows > 0 && term.cols > 0) {
                            invoke("resize_pty", {
                                id,
                                rows: term.rows,
                                cols: term.cols,
                            }).catch(console.error);
                        }
                    } catch {
                        // Ignorar errores transitorios de cálculo de layout
                    }
                }
            });

            resizeObserver.observe(mountRef.current);

            const timer = setTimeout(() => {
                if (!isDisposed) {
                    try {
                        fitAddon.fit();
                        invoke("resize_pty", {
                            id,
                            rows: term.rows,
                            cols: term.cols,
                        }).catch(console.error);
                    } catch {
                        // Ignorar
                    }
                }
            }, 100);

            return () => {
                isDisposed = true;
                clearTimeout(timer);
                resizeObserver.disconnect();
                onDataDisposable.dispose();
                osc7Disposable.dispose();
                if (unlistenOutput) unlistenOutput();
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
                    if (termRef.current.rows > 0 && termRef.current.cols > 0) {
                        invoke("resize_pty", {
                            id,
                            rows: termRef.current.rows,
                            cols: termRef.current.cols,
                        }).catch(console.error);
                    }
                } catch {
                    // Ignorar
                }
            }
        }, [fontSize, fontFamily, id]);

        // Cuando la pestaña pasa a ser activa, redimensionar y enfocar
        useEffect(() => {
            if (active && termRef.current && fitRef.current) {
                setTimeout(() => {
                    try {
                        fitRef.current?.fit();
                        if (
                            termRef.current &&
                            termRef.current.rows > 0 &&
                            termRef.current.cols > 0
                        ) {
                            invoke("resize_pty", {
                                id,
                                rows: termRef.current.rows,
                                cols: termRef.current.cols,
                            }).catch(console.error);
                        }
                        termRef.current?.focus();
                    } catch {
                        // Ignorar
                    }
                }, 30);
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
