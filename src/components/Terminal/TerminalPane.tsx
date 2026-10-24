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

interface GhostSuggestion {
    full_text: string;
    remaining_text: string;
    hint_type: string;
}

interface GhostCoords {
    left: number;
    top: number;
    lineHeight: number;
}

interface TerminalPaneProps {
    id: string;
    active: boolean;
    cwd: string;
    initialCwd?: string;
    fontSize: number;
    fontFamily: string;
    theme: ITheme;
    onCwdChange: (path: string) => void;
}

export const TerminalPane = forwardRef<TerminalHandle, TerminalPaneProps>(
    ({ id, active, cwd, initialCwd, fontSize, fontFamily, theme, onCwdChange }, ref) => {
        const mountRef = useRef<HTMLDivElement>(null);
        const termRef = useRef<Terminal | null>(null);
        const fitRef = useRef<FitAddon | null>(null);
        const [mountCount, setMountCount] = useState(0);

        // Estado y referencias para Ghost Text (sugerencias inline)
        const [ghostSuggestion, setGhostSuggestion] = useState<GhostSuggestion | null>(null);
        const [ghostCoords, setGhostCoords] = useState<GhostCoords | null>(null);
        const ghostSuggestionRef = useRef<GhostSuggestion | null>(null);
        const inputLineRef = useRef<string>("");
        const queryTimerRef = useRef<number | null>(null);

        // Referencias estables para evitar re-ejecución del ciclo de vida del PTY
        const latestCwdRef = useRef<string>(cwd);
        latestCwdRef.current = cwd;

        const onCwdChangeRef = useRef(onCwdChange);
        onCwdChangeRef.current = onCwdChange;

        const fontSizeRef = useRef(fontSize);
        fontSizeRef.current = fontSize;

        const fontFamilyRef = useRef(fontFamily);
        fontFamilyRef.current = fontFamily;

        // Función estable para recalcular la posición pixel-perfect del cursor
        const updateGhostPosition = () => {
            const term = termRef.current;
            if (!term || !mountRef.current) return;

            const buffer = term.buffer.active;
            const line = buffer.getLine(buffer.cursorY + buffer.baseY);
            const lineText = line ? line.translateToString(true) : "";

            // Si el cursor se movió hacia atrás, ocultar ghost text
            if (buffer.cursorX < lineText.length && ghostSuggestionRef.current) {
                setGhostSuggestion(null);
                ghostSuggestionRef.current = null;
                return;
            }

            const core = (term as unknown as { _core?: { _renderService?: { dimensions?: { css?: { cell?: { width?: number; height?: number } }; actualCellWidth?: number; actualCellHeight?: number } } } })._core;
            const renderDim = core?._renderService?.dimensions;
            const cellWidth =
                renderDim?.css?.cell?.width ||
                renderDim?.actualCellWidth ||
                fontSizeRef.current * 0.6;
            const cellHeight =
                renderDim?.css?.cell?.height ||
                renderDim?.actualCellHeight ||
                fontSizeRef.current * 1.25;

            const screen = mountRef.current.querySelector(".xterm-screen") as HTMLElement | null;
            let baseLeft = 8;
            let baseTop = 4;
            if (screen && mountRef.current) {
                const sRect = screen.getBoundingClientRect();
                const mRect = mountRef.current.getBoundingClientRect();
                baseLeft = sRect.left - mRect.left;
                baseTop = sRect.top - mRect.top;
            }

            const newLeft = baseLeft + buffer.cursorX * cellWidth;
            const newTop = baseTop + buffer.cursorY * cellHeight;

            setGhostCoords((prev) => {
                if (
                    prev &&
                    Math.abs(prev.left - newLeft) < 0.5 &&
                    Math.abs(prev.top - newTop) < 0.5 &&
                    Math.abs(prev.lineHeight - cellHeight) < 0.5
                ) {
                    return prev;
                }
                return { left: newLeft, top: newTop, lineHeight: cellHeight };
            });
        };

        // Función estable para consultar sugerencias al backend Rust
        const triggerSuggestionQuery = (input: string) => {
            if (queryTimerRef.current !== null) {
                window.clearTimeout(queryTimerRef.current);
            }
            queryTimerRef.current = window.setTimeout(() => {
                invoke<GhostSuggestion | null>("get_ghost_suggestion", {
                    cwd: latestCwdRef.current || null,
                    input: input,
                })
                    .then((res) => {
                        setGhostSuggestion(res);
                        ghostSuggestionRef.current = res;
                        if (res) {
                            updateGhostPosition();
                        }
                    })
                    .catch(() => {
                        setGhostSuggestion(null);
                        ghostSuggestionRef.current = null;
                    });
            }, 35);
        };

        useImperativeHandle(ref, () => ({
            executeCommand: (cmd: string) => {
                const trimmed = cmd.trim();
                if (trimmed) {
                    invoke("record_command_habit", {
                        cwd: latestCwdRef.current || cwd,
                        command: trimmed,
                    }).catch(() => {});
                }
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
            let idlePromptTimer: number | null = null;

            // Flujo de salida batcheado: agrupa micro-chunks de streaming para evitar desalineación de ANSI
            const flushBuffer = () => {
                if (rafId !== null) {
                    cancelAnimationFrame(rafId);
                    rafId = null;
                }
                if (writeBuffer && termRef.current && !isDisposed) {
                    termRef.current.write(writeBuffer);
                    writeBuffer = "";

                    // Al estabilizarse la salida del PTY (nuevo prompt disponible)
                    if (idlePromptTimer !== null) {
                        window.clearTimeout(idlePromptTimer);
                    }
                    idlePromptTimer = window.setTimeout(() => {
                        if (!isDisposed && inputLineRef.current === "") {
                            triggerSuggestionQuery("");
                        }
                    }, 80);
                }
            };

            const term = new Terminal({
                cursorBlink: true,
                cursorStyle: "bar",
                fontSize: fontSizeRef.current,
                fontFamily: fontFamilyRef.current,
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

            // Atajos de teclado y autocompletado con Flecha Derecha (→) / Tab
            term.attachCustomKeyEventHandler((e: KeyboardEvent) => {
                if (e.type === "keydown") {
                    // Si hay sugerencia ghost activa y se presiona Flecha Derecha o Tab:
                    if ((e.key === "ArrowRight" || e.key === "Tab") && ghostSuggestionRef.current) {
                        const suggestion = ghostSuggestionRef.current;
                        e.preventDefault();
                        e.stopPropagation();

                        const textToInsert = suggestion.remaining_text;
                        invoke("write_pty", { id, data: textToInsert }).catch(console.error);

                        inputLineRef.current += textToInsert;
                        setGhostSuggestion(null);
                        ghostSuggestionRef.current = null;

                        triggerSuggestionQuery(inputLineRef.current);
                        return false;
                    }

                    // Escape descarta la sugerencia
                    if (e.key === "Escape" && ghostSuggestionRef.current) {
                        e.preventDefault();
                        e.stopPropagation();
                        setGhostSuggestion(null);
                        ghostSuggestionRef.current = null;
                        return false;
                    }

                    // Permitir atajos globales (Cmd/Ctrl + T, W, K, +, -, 0, etc.)
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
                        latestCwdRef.current = path.trim();
                        onCwdChangeRef.current(path.trim());
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
                updateGhostPosition();
            });

            // Tracking de posición del cursor en movimientos
            const onCursorMoveDisposable = term.onCursorMove(() => {
                if (!isDisposed) {
                    updateGhostPosition();
                }
            });

            // Escuchar entrada de teclado para mantener buffer local de la línea actual
            const onKeyDisposable = term.onKey(({ key, domEvent }) => {
                if (domEvent.key === "Enter" || key === "\r") {
                    const executed = inputLineRef.current.trim();
                    if (executed) {
                        invoke("record_command_habit", {
                            cwd: latestCwdRef.current || cwd,
                            command: executed,
                        }).catch(() => {});
                    }
                    inputLineRef.current = "";
                    setGhostSuggestion(null);
                    ghostSuggestionRef.current = null;
                } else if (
                    domEvent.ctrlKey &&
                    (domEvent.key === "c" || domEvent.key === "u" || domEvent.key === "l")
                ) {
                    inputLineRef.current = "";
                    setGhostSuggestion(null);
                    ghostSuggestionRef.current = null;
                } else if (domEvent.key === "Backspace") {
                    inputLineRef.current = inputLineRef.current.slice(0, -1);
                    triggerSuggestionQuery(inputLineRef.current);
                } else if (
                    domEvent.key.length === 1 &&
                    !domEvent.metaKey &&
                    !domEvent.ctrlKey &&
                    !domEvent.altKey
                ) {
                    inputLineRef.current += domEvent.key;
                    triggerSuggestionQuery(inputLineRef.current);
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

            invoke("start_pty", {
                id,
                cols: initialCols,
                rows: initialRows,
                cwd: initialCwd || undefined,
            })
                .then(() => {
                    if (isDisposed) return;
                    syncDimensions();
                    if (active) {
                        term.focus();
                    }

                    invoke<string>("get_tab_cwd", { id })
                        .then((p) => {
                            if (p && !isDisposed) {
                                latestCwdRef.current = p.trim();
                                onCwdChangeRef.current(p.trim());
                                triggerSuggestionQuery("");
                            }
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
                        if (p && !isDisposed) {
                            latestCwdRef.current = p.trim();
                            onCwdChangeRef.current(p.trim());
                        }
                    })
                    .catch(() => {});
            });

            // Observador de cambio de tamaño del contenedor
            const resizeObserver = new ResizeObserver(() => {
                if (!isDisposed && mountRef.current && mountRef.current.clientHeight > 0) {
                    syncDimensions();
                    updateGhostPosition();
                }
            });

            resizeObserver.observe(mountRef.current);

            // Escuchar resize de ventana
            window.addEventListener("resize", syncDimensions);

            // Asegurar que las fuentes web cargadas recalculen las métricas sin distorsionar columnas
            document.fonts.ready.then(() => {
                if (!isDisposed) {
                    syncDimensions();
                    updateGhostPosition();
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
                if (idlePromptTimer !== null) {
                    window.clearTimeout(idlePromptTimer);
                    idlePromptTimer = null;
                }
                if (queryTimerRef.current !== null) {
                    window.clearTimeout(queryTimerRef.current);
                    queryTimerRef.current = null;
                }
                clearTimeout(t1);
                clearTimeout(t2);
                clearTimeout(t3);
                window.removeEventListener("resize", syncDimensions);
                resizeObserver.disconnect();
                onResizeDisposable.dispose();
                onCursorMoveDisposable.dispose();
                onKeyDisposable.dispose();
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
        }, [id, mountCount]); // <- CRÍTICO: SOLO depende de id y mountCount para evitar destruir el PTY en bucle

        // Actualizar tamaño y tipo de fuente dinámicamente sin destruir el PTY
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
                updateGhostPosition();
            }
        }, [fontSize, fontFamily, id]);

        // Actualizar paleta de colores dinámicamente cuando el tema cambia
        useEffect(() => {
            if (termRef.current) {
                termRef.current.options.theme = theme;
            }
        }, [theme]);

        // Cuando la pestaña pasa a ser activa, redimensionar, enfocar y actualizar sugerencia
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
                        updateGhostPosition();
                        if (inputLineRef.current === "") {
                            triggerSuggestionQuery("");
                        }
                    } catch {
                        // Ignorar
                    }
                }, 20);
                return () => clearTimeout(timer);
            }
        }, [active, id]);

        // Al hacer clic en la terminal, si la línea está vacía, mostrar sugerencia
        const handleTerminalClick = () => {
            if (inputLineRef.current === "" && !ghostSuggestionRef.current) {
                triggerSuggestionQuery("");
            }
        };

        return (
            <div
                ref={mountRef}
                className="terminal-pane"
                style={{ display: active ? "block" : "none" }}
                onClick={handleTerminalClick}
            >
                {ghostSuggestion && ghostCoords && active && (
                    <div
                        className="ghost-suggestion-overlay"
                        style={{
                            left: `${ghostCoords.left}px`,
                            top: `${ghostCoords.top}px`,
                            height: `${ghostCoords.lineHeight}px`,
                            lineHeight: `${ghostCoords.lineHeight}px`,
                            fontSize: `${fontSize}px`,
                            fontFamily: fontFamily,
                        }}
                    >
                        <span className="ghost-suggestion-text">
                            {ghostSuggestion.remaining_text}
                        </span>
                        <span
                            className="ghost-suggestion-badge"
                            title="Presiona Flecha Derecha (→) o Tab para autocompletar"
                        >
                            <span className="ghost-badge-key">→</span>
                            {ghostSuggestion.hint_type && (
                                <span className="ghost-badge-type">
                                    {ghostSuggestion.hint_type}
                                </span>
                            )}
                        </span>
                    </div>
                )}
            </div>
        );
    }
);

TerminalPane.displayName = "TerminalPane";
