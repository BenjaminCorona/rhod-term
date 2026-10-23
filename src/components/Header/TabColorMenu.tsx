import React, { useState, useEffect, useRef, useLayoutEffect, useCallback } from "react";
import { Palette, Check, RotateCcw, Pipette, X, Plus, FolderMinus, Trash2 } from "lucide-react";
import { TabItem, TabGroup } from "../../types";
import { isValidHexColor, normalizeHexColor } from "../../utils";

interface TabColorMenuProps {
    tab: TabItem;
    position: { x: number; y: number };
    groups?: TabGroup[];
    selectedCount?: number;
    onClose: () => void;
    onSelectColor: (color: string | undefined) => void;
    onCreateGroup?: (title: string, color: string) => void;
    onAssignGroup?: (groupId: string | undefined) => void;
    onCloseSelected?: () => void;
}

const PRESET_COLORS = [
    { name: "Rojo Coral", hex: "#EF4444" },
    { name: "Naranja Cálido", hex: "#F97316" },
    { name: "Ámbar Dorado", hex: "#F59E0B" },
    { name: "Amarillo Lima", hex: "#EAB308" },
    { name: "Verde Esmeralda", hex: "#10B981" },
    { name: "Verde Menta", hex: "#14B8A6" },
    { name: "Cian Cielo", hex: "#06B6D4" },
    { name: "Azul Zafiro", hex: "#3B82F6" },
    { name: "Índigo Eléctrico", hex: "#6366F1" },
    { name: "Violeta Profundo", hex: "#8B5CF6" },
    { name: "Púrpura Neón", hex: "#A855F7" },
    { name: "Rosa Fucsia", hex: "#EC4899" },
    { name: "Rosa Carmesí", hex: "#F43F5E" },
    { name: "Gris Pizarra", hex: "#71717A" },
];

export function TabColorMenu({
    tab,
    position,
    groups = [],
    selectedCount = 1,
    onClose,
    onSelectColor,
    onCreateGroup,
    onAssignGroup,
    onCloseSelected,
}: TabColorMenuProps) {
    const menuRef = useRef<HTMLDivElement>(null);
    const colorInputRef = useRef<HTMLInputElement>(null);
    const [coords, setCoords] = useState({ x: position.x, y: position.y });
    const [isClosing, setIsClosing] = useState(false);
    const [customHex, setCustomHex] = useState(
        tab.color ? tab.color.replace("#", "").toUpperCase() : ""
    );
    const [isCreatingGroup, setIsCreatingGroup] = useState(false);
    const [newGroupName, setNewGroupName] = useState("");

    const hasEyeDropper = typeof window !== "undefined" && "EyeDropper" in window;

    const handleDismiss = useCallback(() => {
        if (isClosing) return;
        setIsClosing(true);
        setTimeout(() => {
            onClose();
        }, 120);
    }, [isClosing, onClose]);

    // Ajustar posición para que no se salga de la pantalla
    useLayoutEffect(() => {
        if (menuRef.current) {
            const rect = menuRef.current.getBoundingClientRect();
            const padding = 12;
            let newX = position.x;
            let newY = position.y + 6;

            if (newX + rect.width > window.innerWidth - padding) {
                newX = window.innerWidth - rect.width - padding;
            }
            if (newX < padding) newX = padding;

            if (newY + rect.height > window.innerHeight - padding) {
                newY = position.y - rect.height - 6;
                if (newY < padding) newY = window.innerHeight - rect.height - padding;
            }

            setCoords({ x: Math.max(padding, newX), y: Math.max(padding, newY) });
        }
    }, [position.x, position.y]);

    // Cerrar al presionar Escape o hacer clic fuera
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                handleDismiss();
            }
        };

        const handlePointerDown = (e: MouseEvent | PointerEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                handleDismiss();
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        window.addEventListener("pointerdown", handlePointerDown, true);

        return () => {
            window.removeEventListener("keydown", handleKeyDown);
            window.removeEventListener("pointerdown", handlePointerDown, true);
        };
    }, [handleDismiss]);

    const handleColorClick = (hex: string) => {
        onSelectColor(hex);
        setCustomHex(hex.replace("#", "").toUpperCase());
    };

    const handleReset = () => {
        onSelectColor(undefined);
        setCustomHex("");
        handleDismiss();
    };

    const handleNativeColorPick = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value.toUpperCase();
        onSelectColor(val);
        setCustomHex(val.replace("#", ""));
    };

    const handleCustomHexChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const raw = e.target.value.replace(/[^0-9a-fA-F]/g, "").toUpperCase();
        setCustomHex(raw);
        if (raw.length === 6) {
            const fullHex = `#${raw}`;
            if (isValidHexColor(fullHex)) {
                onSelectColor(normalizeHexColor(fullHex));
            }
        }
    };

    const handleEyeDropper = async () => {
        try {
            // @ts-expect-error - EyeDropper API nativa moderna
            const eyeDropper = new window.EyeDropper();
            const result = await eyeDropper.open();
            if (result && result.sRGBHex) {
                const hex = result.sRGBHex.toUpperCase();
                onSelectColor(hex);
                setCustomHex(hex.replace("#", ""));
            }
        } catch {
            // Usuario canceló la selección con escape
        }
    };

    const currentGroup = tab.groupId
        ? groups.find((g) => g.id === tab.groupId)
        : null;

    const availableGroups = groups.filter((g) => g.id !== tab.groupId);

    const handleConfirmCreateGroup = (e: React.FormEvent) => {
        e.preventDefault();
        const chosenColor = tab.color || "#3B82F6";
        const titleToUse = newGroupName.trim() || "Grupo";
        onCreateGroup?.(titleToUse, chosenColor);
        handleDismiss();
    };

    const activeColor = tab.color?.toUpperCase();
    const currentSwatchColor = isValidHexColor("#" + customHex)
        ? "#" + customHex
        : activeColor || "#3B82F6";

    const isMulti = selectedCount > 1;

    return (
        <div
            ref={menuRef}
            className={`tab-color-menu ${isClosing ? "is-closing" : ""}`}
            style={{
                left: `${coords.x}px`,
                top: `${coords.y}px`,
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.preventDefault()}
        >
            {/* Cabecera del menú */}
            <div className="tab-color-menu-header">
                <div className="tab-color-menu-title">
                    <Palette size={13} className="tab-color-menu-icon" />
                    <span>
                        {isMulti
                            ? `Color y grupo (${selectedCount} pestañas)`
                            : "Color de pestaña"}
                    </span>
                </div>
                <button
                    type="button"
                    className="tab-color-menu-close-btn"
                    onClick={handleDismiss}
                    title="Cerrar (Esc)"
                >
                    <X size={12} />
                </button>
            </div>

            {/* Malla de colores predeterminados */}
            <div className="tab-color-presets-grid">
                {PRESET_COLORS.map((item) => {
                    const isSelected = activeColor === item.hex.toUpperCase();
                    return (
                        <button
                            key={item.hex}
                            type="button"
                            className={`tab-color-swatch ${isSelected ? "selected" : ""}`}
                            style={{
                                backgroundColor: item.hex,
                                boxShadow: isSelected
                                    ? `0 0 0 2px #18181b, 0 0 0 3.5px ${item.hex}`
                                    : undefined,
                            }}
                            title={item.name}
                            onClick={() => handleColorClick(item.hex)}
                        >
                            {isSelected && <Check size={11} className="tab-color-check" />}
                        </button>
                    );
                })}
            </div>

            <div className="tab-color-menu-divider" />

            {/* Selector personalizado */}
            <div className="tab-color-custom-section">
                <span className="tab-color-section-label">Personalizado</span>
                <div className="tab-color-custom-row">
                    <div
                        className="tab-color-picker-trigger"
                        style={{ backgroundColor: currentSwatchColor }}
                        title="Abrir paleta de color del sistema"
                        onClick={() => colorInputRef.current?.click()}
                    >
                        <input
                            ref={colorInputRef}
                            type="color"
                            value={currentSwatchColor}
                            onChange={handleNativeColorPick}
                            className="tab-color-native-input"
                        />
                    </div>

                    <div className="tab-color-hex-field">
                        <span className="tab-color-hex-prefix">#</span>
                        <input
                            type="text"
                            maxLength={6}
                            value={customHex}
                            onChange={handleCustomHexChange}
                            placeholder="RRGGBB"
                            className="tab-color-hex-input"
                            spellCheck={false}
                        />
                    </div>

                    {hasEyeDropper && (
                        <button
                            type="button"
                            className="tab-color-pipette-btn"
                            onClick={handleEyeDropper}
                            title="Capturar color de la pantalla"
                        >
                            <Pipette size={13} />
                        </button>
                    )}
                </div>
            </div>

            <div className="tab-color-menu-divider" />

            {/* Opción para restablecer color a predeterminado */}
            <button
                type="button"
                className="tab-color-reset-item"
                onClick={handleReset}
            >
                <RotateCcw size={12} className="tab-color-reset-icon" />
                <span>Restablecer color predeterminado</span>
            </button>

            {/* ============================================================
                SECCIÓN DE GRUPOS DE PESTAÑAS
                ============================================================ */}
            {onCreateGroup && onAssignGroup && (
                <>
                    <div className="tab-color-menu-divider" />
                    <div className="tab-group-menu-section">
                        <span className="tab-color-section-label">
                            {isMulti ? "Grupo para las pestañas seleccionadas" : "Grupo de pestañas"}
                        </span>

                        {currentGroup && !isMulti ? (
                            <div className="tab-group-current-row">
                                <div className="tab-group-badge-preview">
                                    <span
                                        className="tab-color-dot"
                                        style={{ backgroundColor: currentGroup.color }}
                                    />
                                    <span className="tab-group-badge-name">{currentGroup.title}</span>
                                </div>
                                <button
                                    type="button"
                                    className="tab-group-remove-btn"
                                    onClick={() => {
                                        onAssignGroup(undefined);
                                        handleDismiss();
                                    }}
                                    title="Quitar pestaña de este grupo"
                                >
                                    <FolderMinus size={12} />
                                    <span>Quitar del grupo</span>
                                </button>
                            </div>
                        ) : isCreatingGroup ? (
                            <form onSubmit={handleConfirmCreateGroup} className="tab-group-create-form">
                                <input
                                    type="text"
                                    value={newGroupName}
                                    onChange={(e) => setNewGroupName(e.target.value)}
                                    placeholder="Nombre del grupo..."
                                    className="tab-group-input"
                                    maxLength={20}
                                    autoFocus
                                />
                                <div className="tab-group-form-actions">
                                    <button
                                        type="button"
                                        className="tab-group-cancel-btn"
                                        onClick={() => setIsCreatingGroup(false)}
                                    >
                                        Cancelar
                                    </button>
                                    <button type="submit" className="tab-group-submit-btn">
                                        Crear
                                    </button>
                                </div>
                            </form>
                        ) : (
                            <button
                                type="button"
                                className="tab-group-action-row-btn"
                                onClick={() => setIsCreatingGroup(true)}
                            >
                                <Plus size={12} />
                                <span>
                                    {isMulti
                                        ? `Añadir las ${selectedCount} a un nuevo grupo`
                                        : "Añadir a nuevo grupo"}
                                </span>
                            </button>
                        )}

                        {/* Desagrupar todas las seleccionadas si alguna pertenece a un grupo */}
                        {isMulti && (
                            <button
                                type="button"
                                className="tab-group-action-row-btn"
                                onClick={() => {
                                    onAssignGroup(undefined);
                                    handleDismiss();
                                }}
                            >
                                <FolderMinus size={12} />
                                <span>Quitar seleccionadas de sus grupos</span>
                            </button>
                        )}

                        {/* Lista de grupos existentes para añadir o mover */}
                        {!isCreatingGroup && availableGroups.length > 0 && (
                            <div className="tab-group-existing-list">
                                <span className="tab-group-sublabel">
                                    {currentGroup && !isMulti
                                        ? "Mover a otro grupo:"
                                        : isMulti
                                        ? "Asignar seleccionadas a grupo:"
                                        : "Añadir a grupo existente:"}
                                </span>
                                {availableGroups.map((g) => (
                                    <button
                                        key={g.id}
                                        type="button"
                                        className="tab-group-option-btn"
                                        onClick={() => {
                                            onAssignGroup(g.id);
                                            handleDismiss();
                                        }}
                                    >
                                        <span
                                            className="tab-color-dot"
                                            style={{ backgroundColor: g.color }}
                                        />
                                        <span className="tab-group-option-title">{g.title}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </>
            )}

            {/* Opción de cerrar bloque de pestañas si hay selección múltiple */}
            {isMulti && onCloseSelected && (
                <>
                    <div className="tab-color-menu-divider" />
                    <button
                        type="button"
                        className="tab-color-reset-item group-action-btn danger"
                        onClick={() => {
                            onCloseSelected();
                            handleDismiss();
                        }}
                    >
                        <Trash2 size={12} className="tab-color-reset-icon danger" />
                        <span>Cerrar {selectedCount} pestañas seleccionadas</span>
                    </button>
                </>
            )}
        </div>
    );
}
