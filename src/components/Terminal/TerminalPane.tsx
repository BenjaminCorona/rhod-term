import {
    useEffect,
    useRef,
    useState,
    useImperativeHandle,
    useCallback,
    forwardRef,
} from "react";
import { Terminal, ITheme } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import "@xterm/xterm/css/xterm.css";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { TerminalHandle } from "../../types";
import { PromptEditor, PromptEditorHandle } from "./PromptEditor";
import { TerminalWelcomeBanner } from "./TerminalWelcomeBanner";
import { Sparkles } from "lucide-react";
import { formatDisplayPath } from "../../utils";

interface GhostSuggestion {
    full_text: string;
    remaining_text: string;
    hint_type: string;
}

interface ExecutedCommandBlock {
    cmd: string;
    cwd: string;
    displayPath: string;
    startTime: number;
    headerBufferY: number;
    finalized: boolean;
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
        const promptEditorRef = useRef<PromptEditorHandle>(null);
        const termRef = useRef<Terminal | null>(null);
        const fitRef = useRef<FitAddon | null>(null);
        const [mountCount, setMountCount] = useState(0);

        // Modo de edición interactivo de comandos (ratón, multilínea y autocompletado predictivo)
        const [isPromptEditor, setIsPromptEditor] = useState<boolean>(() => {
            try {
                const saved = localStorage.getItem("rhod_prompt_editor_mode");
                return saved !== null ? saved === "true" : true;
            } catch {
                return true;
            }
        });
        const [isAlternateBuffer, setIsAlternateBuffer] = useState<boolean>(false);
const [showWelcome, setShowWelcome] = useState<boolean>(() => {
            try {
                return localStorage.getItem("rhod_hide_welcome_banner") !== "true";
            } catch {
                return true;
            }
        });

        const isPromptEditorRef = useRef(isPromptEditor);
        isPromptEditorRef.current = isPromptEditor;

        const isAlternateBufferRef = useRef(isAlternateBuffer);
        isAlternateBufferRef.current = isAlternateBuffer;

        const isAtShellPromptRef = useRef(true);
        const hasExecutedCommandRef = useRef(false);

        // Estado y referencias para Ghost Text (sugerencias inline)
        const [ghostSuggestion, setGhostSuggestion] = useState<GhostSuggestion | null>(null);
        const [ghostCoords, setGhostCoords] = useState<GhostCoords | null>(null);
        const ghostSuggestionRef = useRef<GhostSuggestion | null>(null);
        const inputLineRef = useRef<string>("");
        const queryTimerRef = useRef<number | null>(null);

        // Estado reactivo y referencia para CWD (directorio de trabajo actual)
        const [currentCwd, setCurrentCwd] = useState<string>(initialCwd || cwd);
        const latestCwdRef = useRef<string>(initialCwd || cwd);
        latestCwdRef.current = currentCwd;

        useEffect(() => {
            const next = initialCwd || cwd;
            if (next && next.trim()) {
                setCurrentCwd(next.trim());
                latestCwdRef.current = next.trim();
            }
        }, [initialCwd, cwd]);

        const onCwdChangeRef = useRef(onCwdChange);
        onCwdChangeRef.current = onCwdChange;

        const fontSizeRef = useRef(fontSize);
        fontSizeRef.current = fontSize;

        const fontFamilyRef = useRef(fontFamily);
        fontFamilyRef.current = fontFamily;

                const activeCommandBlockRef = useRef<ExecutedCommandBlock | null>(null);

        const finalizeCommandBlock = useCallback((receivedDurationStr?: string) => {
            const block = activeCommandBlockRef.current;
            if (!block || block.finalized) return;
            block.finalized = true;

            const term = termRef.current;
            if (!term) return;

            const elapsedSec = (performance.now() - block.startTime) / 1000;
            const durStr =
                receivedDurationStr ||
                (elapsedSec < 1
                    ? `(${elapsedSec.toFixed(3)}s)`
                    : elapsedSec < 60
                    ? `(${elapsedSec.toFixed(2)}s)`
                    : `(${Math.floor(elapsedSec / 60)}m ${(elapsedSec % 60).toFixed(1)}s)`);

            const buffer = term.buffer.active;
            const currentBaseY = buffer.baseY;

            // Si la línea del encabezado aún está visible en el viewport
            if (
                block.headerBufferY >= currentBaseY &&
                block.headerBufferY < currentBaseY + term.rows
            ) {
                const screenRow = block.headerBufferY - currentBaseY + 1; // 1-indexed para ANSI
                const screenCol = block.displayPath.length + 2; // Espacio tras la ruta completa
                term.write(
                    `\x1b7\x1b[${screenRow};${screenCol}H\x1b[38;5;242m${durStr}\x1b[0m\x1b8`
                );
            } else if (block.headerBufferY >= 0) {
                term.write(`\x1b[38;5;242m ${durStr}\x1b[0m\r\n`);
            }
        }, []);

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
                if (isPromptEditorRef.current && !isAlternateBufferRef.current) {
                    promptEditorRef.current?.focus();
                } else {
                    termRef.current?.focus();
                }
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
                        if (!isDisposed) {
                            if (
                                isPromptEditorRef.current &&
                                !isAlternateBufferRef.current &&
                                termRef.current
                            ) {
                                if (!hasExecutedCommandRef.current) {
                                    // Pestaña inicial recién abierta: limpiar completamente para que se vea 100% limpia
                                    termRef.current.clear();
                                } else if (isAtShellPromptRef.current) {
                                    // Borrar la línea de entrada/prompt residual en xterm para que el histórico parezca un chat
                                    termRef.current.write("\x1b[2K\r");
                                    isAtShellPromptRef.current = false;
                                }
                            }
                            finalizeCommandBlock();
                            if (inputLineRef.current === "") {
                                triggerSuggestionQuery("");
                            }
                        }
                    }, 50);
                }
            };

            const term = new Terminal({
                cursorBlink: false,
                cursorStyle: "bar",
                cursorInactiveStyle: "none",
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
                    // Si estamos en modo Editor, ninguna pulsación debe ir a xterm directamente
                    if (isPromptEditorRef.current && !isAlternateBufferRef.current) {
                        const isCmdOrCtrl = e.metaKey || e.ctrlKey;
                        const key = e.key.toLowerCase();
                        if (isCmdOrCtrl && key === "e") {
                            setIsPromptEditor((prev) => {
                                const next = !prev;
                                try { localStorage.setItem("rhod_prompt_editor_mode", String(next)); } catch {}
                                if (!next) {
                                    invoke("write_pty", { id, data: "\r" }).catch(() => {});
                                    termRef.current?.focus();
                                }
                                return next;
                            });
                            return false;
                        }
                        // Redirigir el foco al PromptEditor y bloquear el evento en xterm
                        promptEditorRef.current?.focus();
                        return false;
                    }
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
                        if (key === "e") {
                            setIsPromptEditor((prev) => {
                                const next = !prev;
                                try { localStorage.setItem("rhod_prompt_editor_mode", String(next)); } catch {}
                                return next;
                            });
                            return false;
                        }
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

            // Parser OSC 133 para tracking de comandos y duración
            const osc133Disposable = term.parser.registerOscHandler(133, (data) => {
                if (data.startsWith("D;")) {
                    const dur = data.slice(2);
                    finalizeCommandBlock(dur);
                } else if (data.startsWith("A")) {
                    isAtShellPromptRef.current = true;
                    finalizeCommandBlock();
                } else if (data.startsWith("C")) {
                    isAtShellPromptRef.current = false;
                }
                return true;
            });

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
                        const clean = path.trim();
                        latestCwdRef.current = clean;
                        setCurrentCwd(clean);
                        onCwdChangeRef.current(clean);
                    }
                    return true;
                } catch {
                    return false;
                }
            });

            const fitAddon = new FitAddon();
            term.loadAddon(fitAddon);

            const onBufferChangeDisposable = term.buffer.onBufferChange((buffer) => {
                if (!isDisposed) {
                    const isAlt = buffer.type === "alternate";
                    setIsAlternateBuffer(isAlt);
                    if (isAlt) {
                        term.focus();
                    }
                }
            });

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
                    if (isPromptEditorRef.current && !isAlternateBufferRef.current) {
                        promptEditorRef.current?.focus();
                        setTimeout(() => {
                            if (!isDisposed && !hasExecutedCommandRef.current && isPromptEditorRef.current) {
                                termRef.current?.clear();
                            }
                        }, 70);
                        setTimeout(() => {
                            if (!isDisposed && !hasExecutedCommandRef.current && isPromptEditorRef.current) {
                                termRef.current?.clear();
                            }
                        }, 240);
                    } else if (active) {
                        term.focus();
                    }

                    invoke<string>("get_tab_cwd", { id })
                        .then((p) => {
                            if (p && !isDisposed && p.trim()) {
                                const clean = p.trim();
                                latestCwdRef.current = clean;
                                setCurrentCwd(clean);
                                onCwdChangeRef.current(clean);
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
                        if (p && !isDisposed && p.trim()) {
                            const clean = p.trim();
                            latestCwdRef.current = clean;
                            setCurrentCwd(clean);
                            onCwdChangeRef.current(clean);
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
                osc133Disposable.dispose();
                onBufferChangeDisposable.dispose();
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

        // Atajo global Cmd+E / Ctrl+E para alternar Editor Interactivo <-> TTY Clásico
        useEffect(() => {
            if (!active) return;
            const handleGlobalKeyDown = (e: KeyboardEvent) => {
                const isMac = typeof navigator !== "undefined" && navigator.userAgent.includes("Mac");
                const isCmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;
                if (isCmdOrCtrl && e.key.toLowerCase() === "e") {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsPromptEditor((prev) => {
                        const next = !prev;
                        try { localStorage.setItem("rhod_prompt_editor_mode", String(next)); } catch {}
                        if (!next) {
                            invoke("write_pty", { id, data: "_rhod_enable_classic\r" }).catch(() => {});
                            termRef.current?.focus();
                        } else {
                            if (termRef.current) {
                                termRef.current.write("\x1b[2K\r");
                            }
                        }
                        return next;
                    });
                }
            };
            window.addEventListener("keydown", handleGlobalKeyDown);
            return () => window.removeEventListener("keydown", handleGlobalKeyDown);
        }, [active]);

        // Sincronizar dimensiones cuando se conmuta entre Editor y TTY Clásico
        useEffect(() => {
            if (termRef.current && fitRef.current) {
                const t = setTimeout(() => {
                    try {
                        fitRef.current?.fit();
                        const cols = termRef.current?.cols ?? 0;
                        const rows = termRef.current?.rows ?? 0;
                        if (cols > 0 && rows > 0) {
                            invoke("resize_pty", { id, rows, cols }).catch(console.error);
                        }
                    } catch {}
                }, 40);
                return () => clearTimeout(t);
            }
        }, [isPromptEditor, isAlternateBuffer, id]);

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
                        if (isPromptEditorRef.current && !isAlternateBufferRef.current) {
                            promptEditorRef.current?.focus();
                        } else {
                            termRef.current?.focus();
                        }
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
                className="terminal-pane"
                style={{
                    display: active ? "flex" : "none",
                    flexDirection: "column",
                    height: "100%",
                    width: "100%",
                    position: "absolute",
                    top: 0,
                    left: 0,
                    overflow: "hidden",
                }}
            >
                {/* 1. Área de salida de terminal (xterm) */}
                <div
                    ref={mountRef}
                    className={`terminal-output-area ${
                        isPromptEditor && !isAlternateBuffer ? "is-editor-mode" : ""
                    }`}
                    onClick={handleTerminalClick}
                >
                    {/* Banner de bienvenida y atajos al abrir una nueva sesión */}
                    {showWelcome && !isAlternateBuffer && (
                        <TerminalWelcomeBanner
                            onDismiss={() => {
                                setShowWelcome(false);
                                try {
                                    localStorage.setItem("rhod_hide_welcome_banner", "true");
                                } catch {}
                            }}
                        />
                    )}

                    {/* Sugerencia ghost clásica sólo si no está en modo Editor */}
                    {!isPromptEditor && ghostSuggestion && ghostCoords && active && (
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

                    {/* Botón flotante para regresar al Editor interactivo cuando se está en modo Clásico */}
                    {!isPromptEditor && !isAlternateBuffer && (
                        <button
                            type="button"
                            className="prompt-activate-floating-btn"
                            onClick={(e) => {
                                e.stopPropagation();
                                setIsPromptEditor(true);
                                try { localStorage.setItem("rhod_prompt_editor_mode", "true"); } catch {}
                            }}
                            title="Activar Editor de Comandos (⌘E o Ctrl+E)"
                        >
                            <Sparkles size={12} className="prompt-toggle-icon" />
                            <span>Editor</span>
                            <kbd>⌘E</kbd>
                        </button>
                    )}
                </div>

                {/* 2. Editor interactivo de comandos (ratón, multilínea y autocompletado) */}
                {isPromptEditor && !isAlternateBuffer && (
                    <PromptEditor
                        ref={promptEditorRef}
                        active={active}
                        cwd={currentCwd}
                        fontSize={fontSize}
                        fontFamily={fontFamily}
                        theme={theme}
                        onExecute={(cmd) => {
                            setShowWelcome(false);
                            hasExecutedCommandRef.current = true;
                            isAtShellPromptRef.current = false;
                            const trimmed = cmd.trim();

                            if (!trimmed) {
                                invoke("write_pty", { id, data: "\n" }).catch(console.error);
                                return;
                            }

                            if (trimmed === "clear") {
                                activeCommandBlockRef.current = null;
                                termRef.current?.clear();
                                invoke("write_pty", { id, data: "clear\n" }).catch(console.error);
                                return;
                            }

                            invoke("record_command_habit", {
                                cwd: currentCwd,
                                command: trimmed,
                            }).catch(() => {});

                            const displayPath = formatDisplayPath(currentCwd, "");
                            const term = termRef.current;
                            let headerBufferY = -1;

                            if (term) {
                                term.write("\x1b[2K\r");
                                const buffer = term.buffer.active;
                                headerBufferY = buffer.baseY + buffer.cursorY;
                                term.write(`\x1b[38;5;244m${displayPath}\x1b[0m\r\n`);
                            }

                            activeCommandBlockRef.current = {
                                cmd: trimmed,
                                cwd: currentCwd,
                                displayPath,
                                startTime: performance.now(),
                                headerBufferY,
                                finalized: false,
                            };

                            invoke("write_pty", { id, data: cmd + "\n" }).catch(console.error);
                            termRef.current?.scrollToBottom();

                            // Refrescar CWD tras ejecutar el comando para actualizar la insignia en tiempo real
                            const pollCwd = () => {
                                invoke<string>("get_tab_cwd", { id })
                                    .then((p) => {
                                        if (p && p.trim()) {
                                            const clean = p.trim();
                                            latestCwdRef.current = clean;
                                            setCurrentCwd(clean);
                                            onCwdChangeRef.current(clean);
                                        }
                                    })
                                    .catch(() => {});
                            };
                            setTimeout(pollCwd, 60);
                            setTimeout(pollCwd, 200);
                            setTimeout(pollCwd, 600);
                        }}
                        onSendRaw={(data) => {
                            invoke("write_pty", { id, data }).catch(console.error);
                        }}
                        onClear={() => {
                            activeCommandBlockRef.current = null;
                            termRef.current?.clear();
                        }}
                        onToggleClassicMode={() => {
                            setIsPromptEditor(false);
                            try { localStorage.setItem("rhod_prompt_editor_mode", "false"); } catch {}
                            invoke("write_pty", { id, data: "\r" }).catch(() => {});
                            termRef.current?.focus();
                        }}
                    />
                )}
            </div>
        );
    }
);

TerminalPane.displayName = "TerminalPane";
