import { useEffect, useRef, useState, useImperativeHandle, forwardRef, useMemo } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import { listen } from "@tauri-apps/api/event";
import {
  Terminal as TerminalIcon,
  Search,
  X,
  Folder,
  GitBranch,
  Check,
  Command,
  Plus,
  Type,
} from "lucide-react";
import "./App.css";

interface SystemContext {
  cwd: string;
  git_branch: string;
  node_version: string;
  shell: string;
  os: string;
  home: string;
}

interface ShortcutItem {
  id: string;
  keys: string[];
  label: string;
  desc: string;
  category: "Pestañas" | "Terminal" | "Navegación";
  actionType?:
    | "new-tab"
    | "close-tab"
    | "clear"
    | "restart"
    | "copy"
    | "paste"
    | "interrupt"
    | "zoom-in"
    | "zoom-out"
    | "zoom-reset";
}

interface TabItem {
  id: string;
  title: string;
}

export interface TerminalHandle {
  executeCommand: (cmd: string) => void;
  sendRaw: (data: string) => void;
  clear: () => void;
  getSelectionOrCwd: () => string;
  hasSelection: () => boolean;
  focus: () => void;
  restart: () => void;
}

const CATEGORIES = ["Todos", "Pestañas", "Terminal", "Navegación"] as const;

// Formateador de ruta multiplataforma (~ en Windows, Linux y macOS)
function formatDisplayPath(path: string, home: string): string {
  if (!path) return "~";
  let p = path;
  if (home && p.startsWith(home)) {
    return "~" + p.slice(home.length);
  }
  // Fallbacks para Windows (C:\Users\...) y Unix (/Users/..., /home/...)
  p = p.replace(/^[a-zA-Z]:[/\\]Users[/\\][^/\\]+/i, "~");
  p = p.replace(/^(\/Users|\/home)\/[^/]+/, "~");
  return p;
}

// Componente para cada Pestaña de Terminal individual
const TerminalPane = forwardRef<
  TerminalHandle,
  {
    id: string;
    active: boolean;
    cwd: string;
    fontSize: number;
    onCwdChange: (path: string) => void;
  }
>(({ id, active, cwd, fontSize, onCwdChange }, ref) => {
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
      fontFamily:
        "ui-monospace, 'SF Mono', Menlo, Monaco, 'JetBrains Mono', Consolas, 'Courier New', monospace",
      lineHeight: 1.35,
      scrollback: 5000,
      theme: {
        background: "#111113",
        foreground: "#d4d4d8",
        cursor: "#a1a1aa",
        cursorAccent: "#111113",
        selectionBackground: "rgba(255, 255, 255, 0.12)",
        black: "#18181b",
        red: "#f87171",
        green: "#4ade80",
        yellow: "#facc15",
        blue: "#60a5fa",
        magenta: "#c084fc",
        cyan: "#38bdf8",
        white: "#f4f4f5",
        brightBlack: "#52525b",
        brightRed: "#fca5a5",
        brightGreen: "#86efac",
        brightYellow: "#fde047",
        brightBlue: "#93c5fd",
        brightMagenta: "#d8b4fe",
        brightCyan: "#7dd3fc",
        brightWhite: "#ffffff",
      },
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
            path = decodeURIComponent(data.replace(/^file:\/\/[^/]*/, ""));
          }
        }
        // En Windows, file:///C:/Users/... produce pathname /C:/Users/...
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
          invoke("resize_pty", { id, rows: term.rows, cols: term.cols }).catch(console.error);
        }
        if (active) {
          term.focus();
        }

        // Consulta inicial de la ruta del shell
        invoke<string>("get_tab_cwd", { id })
          .then((p) => {
            if (p && !isDisposed) onCwdChange(p.trim());
          })
          .catch(() => {});
      })
      .catch((err) => {
        if (isDisposed) return;
        term.writeln(`\r\n\x1b[31m[Error PTY ${id}]:\x1b[0m ${err}\r\n`);
      });

    // Enviar teclas y verificar cambio de ruta al presionar Enter (fallback cross-platform)
    const onDataDisposable = term.onData((data) => {
      invoke("write_pty", { id, data }).catch(console.error);
      if (data.includes("\r") || data.includes("\n")) {
        setTimeout(() => {
          if (!isDisposed) {
            invoke<string>("get_tab_cwd", { id })
              .then((newPath) => {
                if (newPath && !isDisposed) {
                  onCwdChange(newPath.trim());
                }
              })
              .catch(() => {});
          }
        }, 180);
      }
    });

    const resizeObserver = new ResizeObserver(() => {
      if (isDisposed) return;
      try {
        fitAddon.fit();
        if (term.rows > 0 && term.cols > 0) {
          invoke("resize_pty", { id, rows: term.rows, cols: term.cols }).catch(console.error);
        }
      } catch {
        // Ignorar
      }
    });

    resizeObserver.observe(mountRef.current);

    const timer = setTimeout(() => {
      if (!isDisposed) {
        try {
          fitAddon.fit();
          invoke("resize_pty", { id, rows: term.rows, cols: term.cols }).catch(console.error);
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

  // Actualizar tamaño de fuente dinámicamente cuando cambia fontSize
  useEffect(() => {
    if (termRef.current && fitRef.current) {
      termRef.current.options.fontSize = fontSize;
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
  }, [fontSize, id]);

  // Cuando la pestaña pasa a ser activa, redimensionar y enfocar
  useEffect(() => {
    if (active && termRef.current && fitRef.current) {
      setTimeout(() => {
        try {
          fitRef.current?.fit();
          if (termRef.current && termRef.current.rows > 0 && termRef.current.cols > 0) {
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
});

TerminalPane.displayName = "TerminalPane";

export default function App() {
  const [tabs, setTabs] = useState<TabItem[]>([
    { id: "term-1", title: "terminal 1" },
  ]);
  const [activeTabId, setActiveTabId] = useState<string>("term-1");
  const tabRefs = useRef<Record<string, TerminalHandle | null>>({});
  const [tabCwds, setTabCwds] = useState<Record<string, string>>({});

  const [fontSize, setFontSize] = useState<number>(13.5);
  const [paletteOpen, setPaletteOpen] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [activeCategory, setActiveCategory] = useState<string>("Todos");
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [appVersion, setAppVersion] = useState<string>("0.2.2");

  useEffect(() => {
    getVersion()
      .then((v) => setAppVersion(v))
      .catch(() => {});
  }, []);

  const [context, setContext] = useState<SystemContext>({
    cwd: "~",
    git_branch: "-",
    node_version: "-",
    shell: "shell",
    os: "unknown",
    home: "~",
  });

  // Detección precisa de plataforma (macOS vs Windows/Linux)
  const isMac = useMemo(() => {
    if (context.os === "macos") return true;
    if (context.os === "windows" || context.os === "linux") return false;
    return typeof navigator !== "undefined" && navigator.userAgent.includes("Mac");
  }, [context.os]);

  const modSymbol = isMac ? "⌘" : "Ctrl";

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2000);
  };

  const handleZoomIn = () => {
    setFontSize((prev) => {
      const next = Math.min(prev + 1, 28);
      showToast(`Tamaño de fuente: ${next}px`);
      return next;
    });
  };

  const handleZoomOut = () => {
    setFontSize((prev) => {
      const next = Math.max(prev - 1, 9);
      showToast(`Tamaño de fuente: ${next}px`);
      return next;
    });
  };

  const handleZoomReset = () => {
    setFontSize(13.5);
    showToast("Tamaño de fuente restablecido: 13.5px");
  };

  // Actualización óptima de ruta y contexto en tiempo real
  const handleCwdUpdate = (tabId: string, newPath: string) => {
    if (!newPath || !newPath.trim()) return;
    const cleanPath = newPath.trim();

    setTabCwds((prev) => {
      if (prev[tabId] === cleanPath) return prev;
      return { ...prev, [tabId]: cleanPath };
    });

    // Nombre de pestaña: compatible con separadores de Windows (\) y Unix (/)
    const folderName = cleanPath.split(/[/\\]/).filter(Boolean).pop() || "terminal";
    setTabs((prev) =>
      prev.map((t) => (t.id === tabId ? { ...t, title: folderName } : t))
    );

    // Si es la pestaña activa, actualizar inmediatamente la barra de estado y la rama de Git
    if (tabId === activeTabId) {
      invoke<SystemContext>("get_context", { path: cleanPath })
        .then(setContext)
        .catch(console.error);
    }
  };

  // Inicializar contexto
  useEffect(() => {
    invoke<SystemContext>("get_context", { path: null })
      .then(setContext)
      .catch((e) => console.error("Error al obtener contexto:", e));
  }, []);

  // Al cambiar de pestaña, reflejar la ruta y el contexto de esa pestaña
  useEffect(() => {
    const currentPath = tabCwds[activeTabId];
    invoke<SystemContext>("get_context", { path: currentPath || null })
      .then(setContext)
      .catch(console.error);
  }, [activeTabId, tabCwds]);

  const handleAddTab = () => {
    const nextIndex = tabs.length + 1;
    const newId = `term-${Date.now()}`;
    const newTitle = `terminal ${nextIndex}`;
    setTabs((prev) => [...prev, { id: newId, title: newTitle }]);
    setActiveTabId(newId);
    showToast(`Nueva pestaña: ${newTitle}`);
  };

  const handleCloseTab = (idToClose: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();

    if (tabs.length === 1) {
      tabRefs.current[idToClose]?.restart();
      showToast("Pestaña reiniciada");
      return;
    }

    const indexToClose = tabs.findIndex((t) => t.id === idToClose);
    const remaining = tabs.filter((t) => t.id !== idToClose);
    delete tabRefs.current[idToClose];

    setTabs(remaining);

    if (activeTabId === idToClose) {
      const nextActive = remaining[Math.max(0, indexToClose - 1)].id;
      setActiveTabId(nextActive);
    }
    showToast("Pestaña cerrada");
  };

  const handleClear = () => {
    tabRefs.current[activeTabId]?.clear();
    showToast("Terminal limpia");
  };

  const handleRestart = () => {
    tabRefs.current[activeTabId]?.restart();
    showToast("Sesión reiniciada");
  };

  const handleCopy = () => {
    const text = tabRefs.current[activeTabId]?.getSelectionOrCwd() || context.cwd;
    navigator.clipboard.writeText(text);
    showToast("Copiado al portapapeles");
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        tabRefs.current[activeTabId]?.sendRaw(text);
        showToast("Pegado");
      }
    } catch {
      // Ignorar restricciones de clipboard
    }
  };

  const handleInterrupt = () => {
    tabRefs.current[activeTabId]?.sendRaw("\x03");
    showToast("Interrumpido (Ctrl+C)");
  };

  // Catálogo de atajos adaptado dinámicamente al sistema operativo (⌘ en Mac, Ctrl en Windows/Linux)
  const SHORTCUTS_CATALOG: ShortcutItem[] = useMemo(() => {
    return [
      {
        id: "zoom-in",
        keys: [modSymbol, "+"],
        label: "Aumentar fuente",
        desc: "Agranda el texto de la terminal",
        category: "Terminal",
        actionType: "zoom-in",
      },
      {
        id: "zoom-out",
        keys: [modSymbol, "-"],
        label: "Disminuir fuente",
        desc: "Reduce el tamaño del texto de la terminal",
        category: "Terminal",
        actionType: "zoom-out",
      },
      {
        id: "zoom-reset",
        keys: [modSymbol, "0"],
        label: "Restablecer fuente",
        desc: "Restaura el tamaño por defecto (13.5px)",
        category: "Terminal",
        actionType: "zoom-reset",
      },
      {
        id: "new-tab",
        keys: [modSymbol, "T"],
        label: "Nueva pestaña",
        desc: "Abre una nueva sesión de terminal independiente",
        category: "Pestañas",
        actionType: "new-tab",
      },
      {
        id: "close-tab",
        keys: [modSymbol, "W"],
        label: "Cerrar pestaña",
        desc: "Cierra la pestaña y termina el shell actual",
        category: "Pestañas",
        actionType: "close-tab",
      },
      {
        id: "switch-tab",
        keys: [modSymbol, "1..9"],
        label: "Cambiar de pestaña",
        desc: "Salta directamente a la pestaña correspondiente",
        category: "Pestañas",
      },
      {
        id: "open-shortcuts",
        keys: [modSymbol, "K"],
        label: "Menú de atajos",
        desc: "Abre o cierra esta ventana con todos los atajos",
        category: "Navegación",
      },
      {
        id: "copy",
        keys: isMac ? ["⌘", "C"] : ["Ctrl", "Shift", "C"],
        label: "Copiar selección",
        desc: isMac
          ? "Copia la selección o la ruta al portapapeles"
          : "Copia la selección al portapapeles (Ctrl+Shift+C)",
        category: "Terminal",
        actionType: "copy",
      },
      {
        id: "paste",
        keys: isMac ? ["⌘", "V"] : ["Ctrl", "Shift", "V"],
        label: "Pegar portapapeles",
        desc: isMac
          ? "Pega el contenido del portapapeles en el shell"
          : "Pega el texto en la terminal (Ctrl+Shift+V)",
        category: "Terminal",
        actionType: "paste",
      },
      {
        id: "clear",
        keys: ["Ctrl", "L"],
        label: "Limpiar pantalla",
        desc: "Limpia el buffer visible de la terminal activa",
        category: "Terminal",
        actionType: "clear",
      },
      {
        id: "interrupt",
        keys: ["Ctrl", "C"],
        label: "Interrumpir proceso",
        desc: "Envía señal SIGINT al proceso en ejecución",
        category: "Terminal",
        actionType: "interrupt",
      },
      {
        id: "restart",
        keys: [modSymbol, "R"],
        label: "Reiniciar sesión",
        desc: "Reinicia el shell de la pestaña activa",
        category: "Terminal",
        actionType: "restart",
      },
      {
        id: "autocomplete",
        keys: ["Tab"],
        label: "Autocompletar",
        desc: "Completa comandos, carpetas y nombres de archivo",
        category: "Terminal",
      },
      {
        id: "history",
        keys: ["↑", "↓"],
        label: "Historial de comandos",
        desc: "Navega por los comandos ejecutados recientemente",
        category: "Navegación",
      },
    ];
  }, [modSymbol, isMac]);

  // Atajos de teclado globales (adaptados para macOS, Windows y Linux)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isCmdOrCtrl = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();

      // Zoom
      if (isCmdOrCtrl && (e.key === "+" || e.key === "=")) {
        e.preventDefault();
        handleZoomIn();
        return;
      }

      if (isCmdOrCtrl && (e.key === "-" || e.key === "_")) {
        e.preventDefault();
        handleZoomOut();
        return;
      }

      if (isCmdOrCtrl && e.key === "0") {
        e.preventDefault();
        handleZoomReset();
        return;
      }

      // Pestañas
      if (isCmdOrCtrl && key === "t") {
        e.preventDefault();
        handleAddTab();
        return;
      }

      if (isCmdOrCtrl && key === "w") {
        e.preventDefault();
        handleCloseTab(activeTabId);
        return;
      }

      // Menú de atajos
      if (isCmdOrCtrl && key === "k") {
        e.preventDefault();
        setPaletteOpen((prev) => !prev);
        return;
      }

      // Reiniciar
      if (isCmdOrCtrl && key === "r") {
        e.preventDefault();
        handleRestart();
        return;
      }

      // Copiar / Pegar cross-platform
      // En Windows/Linux: Ctrl+Shift+C (copiar) / Ctrl+Shift+V (pegar)
      // En macOS: Cmd+C (si hay selección copia, si no Ctrl+C interrumpe) / Cmd+V
      if (
        (isMac && e.metaKey && key === "c" && tabRefs.current[activeTabId]?.hasSelection()) ||
        (!isMac && e.ctrlKey && e.shiftKey && key === "c")
      ) {
        e.preventDefault();
        handleCopy();
        return;
      }

      if ((isMac && e.metaKey && key === "v") || (!isMac && e.ctrlKey && e.shiftKey && key === "v")) {
        e.preventDefault();
        handlePaste();
        return;
      }

      // Cambio rápido de pestaña con número 1..9
      if (isCmdOrCtrl && /^[1-9]$/.test(e.key)) {
        const index = parseInt(e.key, 10) - 1;
        if (index < tabs.length) {
          e.preventDefault();
          setActiveTabId(tabs[index].id);
        }
        return;
      }

      if (e.key === "Escape") {
        setPaletteOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [tabs, activeTabId, isMac]);

  const handleShortcutClick = (shortcut: ShortcutItem) => {
    if (shortcut.actionType === "new-tab") handleAddTab();
    else if (shortcut.actionType === "close-tab") handleCloseTab(activeTabId);
    else if (shortcut.actionType === "clear") handleClear();
    else if (shortcut.actionType === "restart") handleRestart();
    else if (shortcut.actionType === "copy") handleCopy();
    else if (shortcut.actionType === "paste") handlePaste();
    else if (shortcut.actionType === "interrupt") handleInterrupt();
    else if (shortcut.actionType === "zoom-in") handleZoomIn();
    else if (shortcut.actionType === "zoom-out") handleZoomOut();
    else if (shortcut.actionType === "zoom-reset") handleZoomReset();
    setPaletteOpen(false);
  };

  const filteredShortcuts = SHORTCUTS_CATALOG.filter((item) => {
    const matchesCategory = activeCategory === "Todos" || item.category === activeCategory;
    const matchesSearch =
      item.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.desc.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.keys.join(" ").toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const displayPath = formatDisplayPath(context.cwd, context.home);

  return (
    <div className="app-layout">
      {/* 1. Header Minimalista con Pestañas */}
      <header className="app-header">
        <div className="tabs-container">
          {tabs.map((tab, idx) => {
            const isActive = tab.id === activeTabId;
            return (
              <div
                key={tab.id}
                className={`tab-item ${isActive ? "active" : ""}`}
                onClick={() => setActiveTabId(tab.id)}
                title={`Pestaña ${idx + 1} (${modSymbol}${idx + 1})`}
              >
                <TerminalIcon size={12} className="tab-icon" />
                <span className="tab-name">{tab.title}</span>
                <button
                  type="button"
                  className="tab-close-btn"
                  onClick={(e) => handleCloseTab(tab.id, e)}
                  title={`Cerrar pestaña (${modSymbol}W)`}
                >
                  <X size={11} />
                </button>
              </div>
            );
          })}

          <button
            type="button"
            className="btn-new-tab"
            onClick={handleAddTab}
            title={`Nueva pestaña (${modSymbol}T)`}
          >
            <Plus size={13} />
          </button>
        </div>

        <div className="header-right">
          <span
            className="header-version"
            onClick={() => {
              navigator.clipboard.writeText(`v${appVersion}`);
              showToast(`Versión v${appVersion} copiada`);
            }}
            title="Versión de Rhod (clic para copiar)"
          >
            v{appVersion}
          </span>
        </div>
      </header>

      {/* 2. Área principal de Terminal */}
      <main
        className="terminal-container"
        onClick={() => tabRefs.current[activeTabId]?.focus()}
      >
        {tabs.map((tab) => (
          <TerminalPane
            key={tab.id}
            id={tab.id}
            active={tab.id === activeTabId}
            cwd={context.cwd}
            fontSize={fontSize}
            onCwdChange={(newPath) => handleCwdUpdate(tab.id, newPath)}
            ref={(el) => {
              tabRefs.current[tab.id] = el;
            }}
          />
        ))}
      </main>

      {/* 3. Barra de Estado Inferior */}
      <footer className="app-statusbar">
        <div className="status-group">
          <div
            className="status-item"
            onClick={() => {
              navigator.clipboard.writeText(context.cwd);
              showToast("Ruta copiada");
            }}
            title="Clic para copiar ruta"
          >
            <Folder size={12} />
            <span>{displayPath}</span>
          </div>

          <div
            className="status-item"
            onClick={() => {
              tabRefs.current[activeTabId]?.executeCommand("git status");
              showToast("git status");
            }}
            title="Clic para ver git status"
          >
            <GitBranch size={12} />
            <span>{context.git_branch}</span>
          </div>

          {context.node_version !== "-" && (
            <div className="status-item" title="Versión de Node.js">
              <span>node {context.node_version}</span>
            </div>
          )}

          <div className="status-item" title="Shell activo">
            <span>{context.shell}</span>
          </div>

          <div className="header-actions">
            <button
              type="button"
              className="btn-action btn-palette"
              onClick={() => setPaletteOpen(true)}
              title={`Ver atajos de teclado (${modSymbol}K)`}
            >
              <Command size={13} />
              <span>Atajos</span>
              <kbd>{modSymbol}K</kbd>
            </button>
          </div>
        </div>

        <div className="status-info">
          <div
            className="status-item version-badge"
            onClick={() => {
              navigator.clipboard.writeText(`v${appVersion}`);
              showToast(`Versión v${appVersion} copiada`);
            }}
            title="Versión de Rhod (clic para copiar)"
          >
            <span>v{appVersion}</span>
          </div>

          {/* Indicador interactivo del tamaño de fuente */}
          <div
            className="status-item font-size-item"
            onClick={handleZoomReset}
            title={`Tamaño de fuente (${modSymbol}+ agrandar, ${modSymbol}- achicar, clic restablecer)`}
          >
            <Type size={11} />
            <span>{fontSize}px</span>
          </div>
          <span>
            {tabs.length} {tabs.length === 1 ? "sesión" : "sesiones"}
          </span>
          <span className="status-dot" />
        </div>
      </footer>

      {/* 4. Ventana de Atajos de Teclado */}
      {paletteOpen && (
        <div className="modal-overlay" onClick={() => setPaletteOpen(false)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-input-row">
              <Search size={15} className="input-icon" />
              <input
                type="text"
                autoFocus
                className="command-input"
                placeholder="Buscar atajo de teclado..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <button
                type="button"
                className="btn-close"
                onClick={() => setPaletteOpen(false)}
              >
                <X size={15} />
              </button>
            </div>

            <div className="modal-filters">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  className={`filter-btn ${activeCategory === cat ? "active" : ""}`}
                  onClick={() => setActiveCategory(cat)}
                >
                  {cat}
                </button>
              ))}
            </div>

            <div className="modal-list">
              {filteredShortcuts.length > 0 ? (
                filteredShortcuts.map((item) => (
                  <div
                    key={item.id}
                    className="list-row"
                    onClick={() => handleShortcutClick(item)}
                    title={
                      item.actionType ? "Haz clic para ejecutar esta acción" : undefined
                    }
                  >
                    <div className="row-left">
                      <span className="row-cmd">{item.label}</span>
                      <span className="row-desc">{item.desc}</span>
                    </div>
                    <div className="row-right">
                      <div className="shortcut-keys">
                        {item.keys.map((k, i) => (
                          <span key={i} className="key-wrapper">
                            <kbd>{k}</kbd>
                            {i < item.keys.length - 1 && (
                              <span className="key-sep">+</span>
                            )}
                          </span>
                        ))}
                      </div>
                      {item.actionType && <span className="row-badge">Acción</span>}
                    </div>
                  </div>
                ))
              ) : (
                <div className="list-empty">
                  No se encontraron atajos para "{searchQuery}"
                </div>
              )}
            </div>

            <div className="modal-footer-bar">
              <span>Haz clic en cualquier atajo para ejecutarlo directamente • Rhod v{appVersion}</span>
              <kbd>ESC</kbd>
            </div>
          </div>
        </div>
      )}

      {/* 5. Toast discreto */}
      {toastMessage && (
        <div className="toast-notification">
          <Check size={13} />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
