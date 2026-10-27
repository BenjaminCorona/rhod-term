import { useState, useRef, useEffect } from "react";
import {
    Search,
    X,
    Check,
    RotateCcw,
    Palette,
    Type,
    Keyboard,
    Minus,
    Plus,
    SlidersHorizontal,
} from "lucide-react";
import { ShortcutItem, FontOption, ThemeOption } from "../../types";
import { UpdateStatus } from "../../hooks";
import { Loader2, Sparkles } from "lucide-react";
import { CATEGORIES } from "../../constants";

export type SettingsTab = "general" | "temas" | "tipografia" | "atajos";

interface SettingsModalProps {
    isOpen: boolean;
    initialTab?: SettingsTab;
    appVersion: string;
    modSymbol: string;
    // Modo de Entrada & Terminal
    promptEditorMode: boolean;
    onSetPromptEditorMode: (enabled: boolean) => void;
    // Temas
    currentTheme: ThemeOption;
    availableThemes: ThemeOption[];
    onSelectTheme: (id: string) => void;
    // Tipografía y Zoom
    currentFont: FontOption;
    availableFonts: FontOption[];
    fontSize: number;
    minFontSize: number;
    maxFontSize: number;
    defaultFontSize: number;
    onSelectFont: (id: string) => void;
    onSetFontSize: (size: number) => void;
    onResetZoom: () => void;
    // Atajos
    shortcutsCatalog: ShortcutItem[];
    onExecuteShortcut: (shortcut: ShortcutItem) => void;
    // Actualizaciones
    updateStatus?: UpdateStatus;
    newVersion?: string | null;
    onCheckForUpdates?: () => void;
    onApplyUpdate?: () => void;
    // Control
    onClose: () => void;
}

export function SettingsModal({
    isOpen,
    initialTab = "general",
    appVersion,
    modSymbol,
    promptEditorMode,
    onSetPromptEditorMode,
    currentTheme,
    availableThemes,
    onSelectTheme,
    currentFont,
    availableFonts,
    fontSize,
    minFontSize,
    maxFontSize,
    defaultFontSize,
    onSelectFont,
    onSetFontSize,
    onResetZoom,
    shortcutsCatalog,
    onExecuteShortcut,
    updateStatus = "idle",
    newVersion = null,
    onCheckForUpdates,
    onApplyUpdate,
    onClose,
}: SettingsModalProps) {
    const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);
    const [searchQuery, setSearchQuery] = useState("");
    const [activeCategory, setActiveCategory] = useState("Todos");
    const searchInputRef = useRef<HTMLInputElement>(null);

    // Sincronizar pestaña inicial cuando se abre el modal
    useEffect(() => {
        if (isOpen) {
            if (initialTab) {
                setActiveTab(initialTab);
            }
        } else {
            setSearchQuery("");
            setActiveCategory("Todos");
        }
    }, [isOpen, initialTab]);

    useEffect(() => {
        if (isOpen && activeTab === "atajos") {
            setTimeout(() => searchInputRef.current?.focus(), 25);
        }
    }, [isOpen, activeTab]);

    if (!isOpen) return null;

    const filteredShortcuts = shortcutsCatalog.filter((item) => {
        const matchesCategory =
            activeCategory === "Todos" || item.category === activeCategory;
        const matchesSearch =
            item.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
            item.desc.toLowerCase().includes(searchQuery.toLowerCase()) ||
            item.keys
                .join(" ")
                .toLowerCase()
                .includes(searchQuery.toLowerCase());
        return matchesCategory && matchesSearch;
    });

    const FONT_PRESETS = [11, 12, 13.5, 15, 16.5, 18];

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-dialog settings-dialog" onClick={(e) => e.stopPropagation()}>
                {/* Header de Configuración con Selector de Pestañas */}
                <div className="settings-header">
                    <div className="settings-title-group">
                        <div className="settings-title-text">
                            <span className="settings-title">Configuración</span>
                            <span className="settings-version">v{appVersion}</span>
                        </div>
                    </div>

                    <div className="settings-nav-tabs">
                        <button
                            type="button"
                            className={`settings-tab-btn ${activeTab === "general" ? "active" : ""}`}
                            onClick={() => setActiveTab("general")}
                        >
                            <SlidersHorizontal size={13} />
                            <span>General</span>
                        </button>
                        <button
                            type="button"
                            className={`settings-tab-btn ${activeTab === "temas" ? "active" : ""}`}
                            onClick={() => setActiveTab("temas")}
                        >
                            <Palette size={13} />
                            <span>Temas</span>
                        </button>
                        <button
                            type="button"
                            className={`settings-tab-btn ${activeTab === "tipografia" ? "active" : ""}`}
                            onClick={() => setActiveTab("tipografia")}
                        >
                            <Type size={13} />
                            <span>Tipografía & Zoom</span>
                        </button>
                        <button
                            type="button"
                            className={`settings-tab-btn ${activeTab === "atajos" ? "active" : ""}`}
                            onClick={() => setActiveTab("atajos")}
                        >
                            <Keyboard size={13} />
                            <span>Atajos</span>
                        </button>
                    </div>

                    <button
                        type="button"
                        className="btn-close"
                        onClick={onClose}
                        title="Cerrar (Esc)"
                    >
                        <X size={15} />
                    </button>
                </div>

                {/* Contenido según la pestaña activa */}
                <div className="settings-content">
                    {/* TAB 0: GENERAL / TERMINAL */}
                    {activeTab === "general" && (
                        <div className="tab-pane-container">
                            <div className="settings-section">
                                <div className="section-meta">
                                    <h3>Experiencia de Entrada & Terminal</h3>
                                    <p>
                                        Personaliza cómo interactúas con los comandos y el flujo de trabajo en la terminal.
                                    </p>
                                </div>

                                <div className="setting-card-row">
                                    <div className="setting-card-info">
                                        <div className="setting-title-row">
                                           
                                            <div>
                                                <span className="setting-card-title">Modo editor</span>
                                                <span className="setting-shortcut-badge">{modSymbol}E</span>
                                            </div>
                                        </div>
                                        <p className="setting-card-desc">
                                            Habilita el editor flotante interactivo con selección de ratón nativo, edición multilínea (Shift+Enter), historial persistente y autocompletado ghost predictivo. Desactívalo para usar la terminal en modo clásico TTY tradicional.
                                        </p>
                                    </div>

                                    <div className="setting-card-action">
                                        <label
                                            className="toggle-switch-label"
                                            title={promptEditorMode ? "Desactivar Modo Editor (cambiar a TTY clásico)" : "Activar Modo Editor"}
                                        >
                                            <span className={`toggle-switch-status ${promptEditorMode ? "active" : ""}`}>
                                                {promptEditorMode ? "Activado" : "Clásico"}
                                            </span>
                                            <button
                                                type="button"
                                                role="switch"
                                                aria-checked={promptEditorMode}
                                                className={`toggle-switch-btn ${promptEditorMode ? "checked" : ""}`}
                                                onClick={() => onSetPromptEditorMode(!promptEditorMode)}
                                            >
                                                <span className="toggle-switch-thumb" />
                                            </button>
                                        </label>
                                    </div>
                                </div>

                                <div className="mode-preview-wrapper">
                                    <div className="mode-preview-header">
                                        <span className="mode-preview-label">
                                            Modo activo en este momento:
                                        </span>
                                        <span className="mode-preview-badge">
                                            {promptEditorMode ? "Editor Interactivo Multilínea" : "TTY Clásico Tradicional"}
                                        </span>
                                    </div>
                                    {promptEditorMode ? (
                                        <div className="mode-preview-editor-box">
                                            <div className="preview-editor-badge">
                                                <span className="preview-badge-path">~/Documents/rhod-term</span>
                                            </div>
                                            <div className="preview-editor-input">
                                                <span className="preview-cursor-line">cargo build</span>
                                                <span className="preview-ghost-hint"> --release</span>
                                            </div>
                                            <div className="preview-editor-footer">
                                                <span><kbd>↵</kbd> Ejecutar</span>
                                                <span><kbd>⇧↵</kbd> Salto de línea</span>
                                                <span><kbd>⇥</kbd> Completar</span>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="mode-preview-classic-box">
                                            <span className="preview-classic-prompt">
                                                <span style={{ color: "var(--text-muted)" }}>~/Documents/rhod-term </span>
                                                <span style={{ color: "var(--accent)" }}>git:(main) </span>
                                                <span style={{ color: "#73daca" }}>❯ </span>
                                                <span className="preview-classic-cursor">cargo build</span>
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* TAB 1: TEMAS */}
                    {activeTab === "temas" && (
                        <div className="tab-pane-container">
                            <div className="section-meta">
                                <h3>Paleta Visual & Esquema de Color</h3>
                                <p>
                                    Selecciona el tema de tu preferencia. Cambia instantáneamente la ventana, pestañas y la paleta ANSI de 16 colores del shell.
                                </p>
                            </div>

                            <div className="themes-grid">
                                {availableThemes.map((theme) => {
                                    const isActive = theme.id === currentTheme.id;
                                    return (
                                        <div
                                            key={theme.id}
                                            className={`theme-card ${isActive ? "selected" : ""}`}
                                            onClick={() => onSelectTheme(theme.id)}
                                        >
                                            <div className="theme-card-header">
                                                <div className="theme-card-title-row">
                                                    <span className="theme-card-name">{theme.name}</span>
                                                    {isActive && (
                                                        <span className="active-pill">
                                                            <Check size={11} /> Activo
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="theme-card-desc">{theme.desc}</p>
                                            </div>

                                            {/* Muestrario de colores */}
                                            <div className="theme-swatches">
                                                <div
                                                    className="color-dot"
                                                    style={{ background: theme.terminal.background }}
                                                    title={`Fondo: ${theme.terminal.background}`}
                                                />
                                                <div
                                                    className="color-dot"
                                                    style={{ background: theme.ui.accent }}
                                                    title={`Acento: ${theme.ui.accent}`}
                                                />
                                                <div
                                                    className="color-dot"
                                                    style={{ background: theme.terminal.red }}
                                                    title="Rojo ANSI"
                                                />
                                                <div
                                                    className="color-dot"
                                                    style={{ background: theme.terminal.green }}
                                                    title="Verde ANSI"
                                                />
                                                <div
                                                    className="color-dot"
                                                    style={{ background: theme.terminal.yellow }}
                                                    title="Amarillo ANSI"
                                                />
                                                <div
                                                    className="color-dot"
                                                    style={{ background: theme.terminal.blue }}
                                                    title="Azul ANSI"
                                                />
                                                <div
                                                    className="color-dot"
                                                    style={{ background: theme.terminal.magenta }}
                                                    title="Magenta ANSI"
                                                />
                                                <div
                                                    className="color-dot"
                                                    style={{ background: theme.terminal.cyan }}
                                                    title="Cian ANSI"
                                                />
                                            </div>

                                            {/* Mini vista previa de código con los colores del tema */}
                                            <div
                                                className="theme-mini-preview"
                                                style={{
                                                    background: theme.terminal.background,
                                                    color: theme.terminal.foreground,
                                                    borderColor: theme.ui.borderSubtle,
                                                }}
                                            >
                                                <span style={{ color: theme.terminal.cyan }}>~ </span>
                                                <span style={{ color: theme.terminal.green }}>❯ git status</span>
                                                <br />
                                                <span style={{ color: theme.terminal.brightBlack }}>branch: </span>
                                                <span style={{ color: theme.ui.accent }}>main</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* TAB 2: TIPOGRAFÍA & ZOOM */}
                    {activeTab === "tipografia" && (
                        <div className="tab-pane-container">
                            {/* Sección 1: Selección de Tipografía */}
                            <div className="settings-section">
                                <div className="section-meta">
                                    <h3>Tipografía de la Terminal</h3>
                                    <p>Fuentes monoespaciadas optimizadas para programación y máxima legibilidad.</p>
                                </div>

                                <div className="fonts-grid">
                                    {availableFonts.map((font) => {
                                        const isActive = font.id === currentFont.id;
                                        return (
                                            <div
                                                key={font.id}
                                                className={`font-card ${isActive ? "selected" : ""}`}
                                                onClick={() => onSelectFont(font.id)}
                                            >
                                                <div className="font-card-top">
                                                    <div>
                                                        <span className="font-card-name">{font.name}</span>
                                                        <p className="font-card-desc">{font.desc}</p>
                                                    </div>
                                                    {isActive && (
                                                        <span className="active-pill">
                                                            <Check size={11} /> Activa
                                                        </span>
                                                    )}
                                                </div>

                                                <div
                                                    className="font-card-sample"
                                                    style={{ fontFamily: font.family }}
                                                >
                                                    {'const render = (ctx, delta) => ctx.draw(delta);'}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Sección 2: Tamaño de Fuente & Zoom */}
                            <div className="settings-section">
                                <div className="section-meta">
                                    <h3>Tamaño de Fuente (Zoom)</h3>
                                    <p>Ajusta la escala del texto para adaptarla a la resolución de tu pantalla.</p>
                                </div>

                                <div className="zoom-controls-wrapper">
                                    <div className="zoom-stepper-row">
                                        <button
                                            type="button"
                                            className="zoom-btn"
                                            onClick={() => onSetFontSize(fontSize - 1)}
                                            disabled={fontSize <= minFontSize}
                                            title="Reducir fuente"
                                        >
                                            <Minus size={13} />
                                        </button>

                                        <input
                                            type="range"
                                            className="zoom-slider"
                                            min={minFontSize}
                                            max={maxFontSize}
                                            step={0.5}
                                            value={fontSize}
                                            onChange={(e) => onSetFontSize(parseFloat(e.target.value))}
                                        />

                                        <button
                                            type="button"
                                            className="zoom-btn"
                                            onClick={() => onSetFontSize(fontSize + 1)}
                                            disabled={fontSize >= maxFontSize}
                                            title="Aumentar fuente"
                                        >
                                            <Plus size={13} />
                                        </button>

                                        <span className="zoom-badge-value">{fontSize}px</span>

                                        <button
                                            type="button"
                                            className="zoom-reset-btn"
                                            onClick={onResetZoom}
                                            title="Restablecer tamaño por defecto"
                                        >
                                            <RotateCcw size={12} />
                                            <span>Restablecer ({defaultFontSize}px)</span>
                                        </button>
                                    </div>

                                    {/* Botones de acceso rápido a tamaños predefinidos */}
                                    <div className="zoom-presets-row">
                                        <span className="presets-label">Preajustes:</span>
                                        {FONT_PRESETS.map((sz) => (
                                            <button
                                                key={sz}
                                                type="button"
                                                className={`preset-pill ${fontSize === sz ? "active" : ""}`}
                                                onClick={() => onSetFontSize(sz)}
                                            >
                                                {sz}px
                                            </button>
                                        ))}
                                    </div>

                                    {/* Vista previa en tiempo real */}
                                    <div className="live-preview-box">
                                        <div className="live-preview-header">
                                            <span>Vista previa en vivo ({currentFont.name} • {fontSize}px)</span>
                                        </div>
                                        <div
                                            className="live-preview-terminal"
                                            style={{
                                                fontFamily: currentFont.family,
                                                fontSize: `${fontSize}px`,
                                            }}
                                        >
                                            <span style={{ color: currentTheme.terminal.cyan }}>~ </span>
                                            <span style={{ color: currentTheme.terminal.green }}>❯ rhod-term --status</span>
                                            <br />
                                            <span style={{ color: currentTheme.terminal.brightBlack }}>[system] </span>
                                            <span>Buffer renderizado a {fontSize}px sin pérdida de nitidez</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* TAB 3: ATAJOS DE TECLADO */}
                    {activeTab === "atajos" && (
                        <div className="tab-pane-container">
                            <div className="modal-input-row settings-search-row">
                                <Search size={15} className="input-icon" />
                                <input
                                    ref={searchInputRef}
                                    type="text"
                                    className="command-input"
                                    placeholder={`Buscar atajo de teclado (${modSymbol}K)...`}
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    autoComplete="off"
                                    autoCorrect="off"
                                    autoCapitalize="off"
                                    spellCheck={false}
                                />
                                {searchQuery && (
                                    <button
                                        type="button"
                                        className="btn-clear-search"
                                        onClick={() => setSearchQuery("")}
                                    >
                                        <X size={13} />
                                    </button>
                                )}
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
                                            onClick={() => onExecuteShortcut(item)}
                                            title={
                                                item.actionType
                                                    ? "Haz clic para ejecutar esta acción"
                                                    : undefined
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
                                                {item.actionType && (
                                                    <span className="row-badge">Ejecutar</span>
                                                )}
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <div className="list-empty">
                                        No se encontraron atajos para "{searchQuery}"
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer del Modal */}
                <div className="settings-footer-bar">
                    <div className="footer-left-group">
                        <span className="footer-persist-note">
                            Los cambios se guardan automáticamente en tu equipo
                        </span>
                        <div className="footer-update-check">
                            {updateStatus === "checking" && (
                                <span className="update-check-status">
                                    <Loader2 size={11} className="update-spinner" /> Comprobando...
                                </span>
                            )}
                            {updateStatus === "available" && onApplyUpdate && (
                                <button
                                    type="button"
                                    className="btn-update-footer"
                                    onClick={onApplyUpdate}
                                >
                                    <Sparkles size={11} />
                                    <span>Actualizar a v{newVersion}</span>
                                </button>
                            )}
                            {updateStatus === "up-to-date" && (
                                <span className="update-check-status">
                                    <Check size={11} /> Al día
                                </span>
                            )}
                            {(updateStatus === "idle" || updateStatus === "error") && onCheckForUpdates && (
                                <button
                                    type="button"
                                    className="btn-check-updates"
                                    onClick={onCheckForUpdates}
                                    title="Comprobar si hay una versión más reciente de Rhod"
                                >
                                    Buscar actualizaciones
                                </button>
                            )}
                        </div>
                    </div>
                    <div className="footer-keys-hint">
                        <span>Cerrar</span>
                        <kbd>ESC</kbd>
                    </div>
                </div>
            </div>
        </div>
    );
}
