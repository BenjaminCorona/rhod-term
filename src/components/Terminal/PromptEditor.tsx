import {
    useState,
    useRef,
    useEffect,
    useCallback,
    useImperativeHandle,
    forwardRef,
    KeyboardEvent,
    ChangeEvent,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import { ITheme } from "@xterm/xterm";
import { Folder, ArrowRight } from "lucide-react";
import { formatDisplayPath } from "../../utils";

interface GhostSuggestion {
    full_text: string;
    remaining_text: string;
    hint_type: string;
}

export interface PromptEditorHandle {
    focus: () => void;
}

export interface PromptEditorProps {
    active: boolean;
    cwd: string;
    fontSize: number;
    fontFamily: string;
    theme: ITheme;
    onExecute: (cmd: string) => void;
    onSendRaw: (data: string) => void;
    onClear: () => void;
    onToggleClassicMode: () => void;
}

export const PromptEditor = forwardRef<PromptEditorHandle, PromptEditorProps>(
    (
        {
            active,
            cwd,
            fontSize,
            fontFamily,
            theme,
            onExecute,
            onSendRaw,
            onClear,
            onToggleClassicMode,
        },
        ref
    ) => {
    const [value, setValue] = useState("");
    const [history, setHistory] = useState<string[]>([]);
    const [historyIndex, setHistoryIndex] = useState<number>(-1);
    const [ghostSuggestion, setGhostSuggestion] = useState<GhostSuggestion | null>(null);

    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const queryTimerRef = useRef<number | null>(null);
    const draftRef = useRef<string>("");
    const historyIndexRef = useRef<number>(-1);
    const historyRef = useRef<string[]>([]);
    const ghostSuggestionRef = useRef<GhostSuggestion | null>(null);

    historyRef.current = history;
    historyIndexRef.current = historyIndex;
    ghostSuggestionRef.current = ghostSuggestion;

    useImperativeHandle(ref, () => ({
        focus: () => {
            textareaRef.current?.focus();
        },
    }));

    // Cargar historial previo desde el almacenamiento de hábitos al montar
    useEffect(() => {
        invoke<string[]>("get_command_history", { limit: 60 })
            .then((cmds) => {
                if (cmds && cmds.length > 0) {
                    setHistory(cmds);
                }
            })
            .catch(() => {});
    }, []);

    // Enfocar automáticamente el editor cuando la pestaña esté activa
    useEffect(() => {
        if (active) {
            const timer = setTimeout(() => {
                textareaRef.current?.focus();
            }, 30);
            return () => clearTimeout(timer);
        }
    }, [active]);

    // Auto-ajustar altura del textarea según el contenido (multilínea dinámico)
    const adjustTextareaHeight = useCallback(() => {
        const textarea = textareaRef.current;
        if (!textarea) return;
        textarea.style.height = "auto";
        const newHeight = Math.min(Math.max(textarea.scrollHeight, 36), 260);
        textarea.style.height = `${newHeight}px`;
    }, []);

    useEffect(() => {
        adjustTextareaHeight();
    }, [value, adjustTextareaHeight]);

    // Consultar sugerencias predictivas (Ghost Text) con debounce
    const triggerSuggestionQuery = useCallback(
        (input: string) => {
            if (queryTimerRef.current !== null) {
                window.clearTimeout(queryTimerRef.current);
            }
            queryTimerRef.current = window.setTimeout(() => {
                invoke<GhostSuggestion | null>("get_ghost_suggestion", {
                    cwd: cwd || null,
                    input: input,
                })
                    .then((res) => {
                        setGhostSuggestion(res);
                        ghostSuggestionRef.current = res;
                    })
                    .catch(() => {
                        setGhostSuggestion(null);
                        ghostSuggestionRef.current = null;
                    });
            }, 35);
        },
        [cwd]
    );

    // Al montar o cuando cambia CWD, disparar sugerencia inicial si el input está vacío
    useEffect(() => {
        if (value === "") {
            triggerSuggestionQuery("");
        }
    }, [cwd, triggerSuggestionQuery, value]);

    const handleInputChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
        const nextVal = e.target.value;
        setValue(nextVal);
        triggerSuggestionQuery(nextVal);
        if (historyIndexRef.current !== -1) {
            setHistoryIndex(-1);
        }
    };

    const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
        e.stopPropagation();
        setGhostSuggestion(null);
        ghostSuggestionRef.current = null;
        if (historyIndexRef.current !== -1) {
            setHistoryIndex(-1);
        }
        setTimeout(() => {
            adjustTextareaHeight();
            if (textareaRef.current) {
                triggerSuggestionQuery(textareaRef.current.value);
            }
        }, 0);
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
        const textarea = textareaRef.current;
        if (!textarea) return;

        const isMac = typeof navigator !== "undefined" && navigator.userAgent.includes("Mac");
        const isCmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

        // Permitir atajos nativos de edición y portapapeles sin interferencia global (Cmd/Ctrl + V, C, X, A, Z)
        if (
            isCmdOrCtrl &&
            ["v", "c", "x", "a", "z"].includes(e.key.toLowerCase()) &&
            !e.shiftKey
        ) {
            e.stopPropagation();
            return;
        }

        // Atajo Cmd+E / Ctrl+E: Alternar entre editor y modo clásico TTY
        if (isCmdOrCtrl && e.key.toLowerCase() === "e") {
            e.preventDefault();
            e.stopPropagation();
            onToggleClassicMode();
            return;
        }

        // Ctrl + C: Interrumpir proceso o limpiar texto escrito
        if (e.ctrlKey && e.key.toLowerCase() === "c") {
            if (value.length > 0 && textarea.selectionStart === textarea.selectionEnd) {
                e.preventDefault();
                setValue("");
                setGhostSuggestion(null);
                setHistoryIndex(-1);
                onSendRaw("\x03");
                triggerSuggestionQuery("");
                return;
            }
            onSendRaw("\x03");
            return;
        }

        // Ctrl + L: Limpiar buffer de salida
        if (e.ctrlKey && e.key.toLowerCase() === "l") {
            e.preventDefault();
            onClear();
            return;
        }

        // Enter: Ejecutar o Salto de línea
        if (e.key === "Enter") {
            if (e.shiftKey) {
                // Shift + Enter: Salto de línea en el editor sin ejecutar
                return;
            }

            // Enter simple: Ejecutar comando en el PTY
            e.preventDefault();
            const cmdToExecute = value;
            const trimmed = cmdToExecute.trim();

            if (trimmed) {
                setHistory((prev) => [trimmed, ...prev.filter((c) => c !== trimmed)]);
            }

            setHistoryIndex(-1);
            setValue("");
            setGhostSuggestion(null);
            ghostSuggestionRef.current = null;

            onExecute(cmdToExecute);
            triggerSuggestionQuery("");
            return;
        }

        // Tab: Aceptar sugerencia predictiva
        if (e.key === "Tab") {
            e.preventDefault();
            if (ghostSuggestion && ghostSuggestion.remaining_text) {
                const nextVal = value + ghostSuggestion.remaining_text;
                setValue(nextVal);
                setGhostSuggestion(null);
                ghostSuggestionRef.current = null;
                triggerSuggestionQuery(nextVal);
            } else {
                // Insertar 2 espacios para indentación si no hay sugerencia
                const start = textarea.selectionStart;
                const end = textarea.selectionEnd;
                const nextVal = value.substring(0, start) + "  " + value.substring(end);
                setValue(nextVal);
                setTimeout(() => {
                    textarea.selectionStart = textarea.selectionEnd = start + 2;
                }, 0);
            }
            return;
        }

        // Flecha Derecha (→): Aceptar sugerencia si estamos al final del texto
        if (e.key === "ArrowRight") {
            if (
                ghostSuggestion &&
                ghostSuggestion.remaining_text &&
                textarea.selectionStart === value.length &&
                textarea.selectionEnd === value.length
            ) {
                e.preventDefault();
                const nextVal = value + ghostSuggestion.remaining_text;
                setValue(nextVal);
                setGhostSuggestion(null);
                ghostSuggestionRef.current = null;
                triggerSuggestionQuery(nextVal);
                return;
            }
        }

        // Escape: Descartar sugerencia predictiva
        if (e.key === "Escape") {
            if (ghostSuggestion) {
                e.preventDefault();
                setGhostSuggestion(null);
                ghostSuggestionRef.current = null;
                return;
            }
        }

        // Flecha Arriba (↑): Navegar historial si el cursor está en la primera línea
        if (e.key === "ArrowUp") {
            const textBeforeCursor = value.substring(0, textarea.selectionStart);
            const isFirstLine = !textBeforeCursor.includes("\n");

            if (isFirstLine && historyRef.current.length > 0) {
                e.preventDefault();
                const curIdx = historyIndexRef.current;
                if (curIdx === -1) {
                    draftRef.current = value;
                }
                const nextIdx = Math.min(curIdx + 1, historyRef.current.length - 1);
                setHistoryIndex(nextIdx);
                const histCmd = historyRef.current[nextIdx];
                setValue(histCmd);
                setGhostSuggestion(null);
                setTimeout(() => {
                    textarea.selectionStart = textarea.selectionEnd = histCmd.length;
                }, 0);
                return;
            }
        }

        // Flecha Abajo (↓): Navegar historial hacia adelante si el cursor está en la última línea
        if (e.key === "ArrowDown") {
            const textAfterCursor = value.substring(textarea.selectionEnd);
            const isLastLine = !textAfterCursor.includes("\n");

            if (isLastLine && historyIndexRef.current >= 0) {
                e.preventDefault();
                const curIdx = historyIndexRef.current;
                if (curIdx > 0) {
                    const nextIdx = curIdx - 1;
                    setHistoryIndex(nextIdx);
                    const histCmd = historyRef.current[nextIdx];
                    setValue(histCmd);
                    setGhostSuggestion(null);
                    setTimeout(() => {
                        textarea.selectionStart = textarea.selectionEnd = histCmd.length;
                    }, 0);
                } else if (curIdx === 0) {
                    setHistoryIndex(-1);
                    setValue(draftRef.current);
                    setGhostSuggestion(null);
                    setTimeout(() => {
                        textarea.selectionStart = textarea.selectionEnd = draftRef.current.length;
                    }, 0);
                }
                return;
            }
        }
    };

    const displayPath = formatDisplayPath(cwd, "");
    const lineCount = value.split("\n").length;

    return (
        <div
            className="terminal-prompt-editor"
            style={{ fontFamily }}
            onMouseDown={(e) => {
                e.stopPropagation();
            }}
            onClick={(e) => {
                e.stopPropagation();
                textareaRef.current?.focus();
            }}
        >
            {/* 1. Badge de ruta CWD integrado en la terminal */}
            <div className="prompt-editor-header">
                <div className="prompt-path-badge">
                    <Folder size={13} className="prompt-path-icon" />
                    <span className="prompt-path-text">{displayPath}</span>
                </div>
                {lineCount > 1 && (
                    <span className="prompt-multiline-badge">
                        {lineCount} líneas
                    </span>
                )}
            </div>

            {/* 2. Fila del editor: Textarea transparente con ratón nativo + Espejo Ghost Text (SIN placeholder overlapping) */}
            <div className="prompt-input-row">
                <div
                    className="prompt-ghost-mirror"
                    aria-hidden="true"
                    style={{
                        fontSize: `${fontSize}px`,
                        lineHeight: 1.5,
                    }}
                >
                    <span className="prompt-mirror-typed">{value}</span>
                    {ghostSuggestion && (
                        <span className="prompt-ghost-container">
                            <span className="prompt-ghost-text">
                                {ghostSuggestion.remaining_text}
                            </span>
                            <span
                                className="prompt-ghost-badge"
                                title="Presiona Tab o Flecha Derecha (→) para autocompletar"
                            >
                                <ArrowRight size={10} className="prompt-ghost-key" />
                                {ghostSuggestion.hint_type && (
                                    <span className="prompt-ghost-type">
                                        {ghostSuggestion.hint_type}
                                    </span>
                                )}
                            </span>
                        </span>
                    )}
                </div>

                <textarea
                    ref={textareaRef}
                    className="prompt-textarea"
                    value={value}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyDown}
                    onPaste={handlePaste}
                    onMouseDown={(e) => {
                        e.stopPropagation();
                    }}
                    onClick={(e) => {
                        e.stopPropagation();
                    }}
                    placeholder=""
                    rows={1}
                    spellCheck={false}
                    autoCapitalize="none"
                    autoComplete="off"
                    autoCorrect="off"
                    style={{
                        fontSize: `${fontSize}px`,
                        color: theme.foreground || "#e2e5eb",
                        lineHeight: 1.5,
                    }}
                />
            </div>

            {/* 3. Barra inferior minimalista de atajos */}
            <div className="prompt-editor-footer">
                <div className="prompt-footer-hints">
                    <span className="prompt-hint-item">
                        <kbd className="prompt-kbd">↵</kbd> Ejecutar
                    </span>
                    <span className="prompt-hint-item">
                        <kbd className="prompt-kbd">⇧↵</kbd> Salto de línea
                    </span>
                    <span className="prompt-hint-item">
                        <kbd className="prompt-kbd">⇥</kbd> Completar
                    </span>
                </div>
            </div>
        </div>
    );
}
);

PromptEditor.displayName = "PromptEditor";
