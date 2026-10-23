import React, { useState, useEffect, useRef, useLayoutEffect } from "react";
import { Palette, Check, RotateCcw, Pipette, X } from "lucide-react";
import { TabItem } from "../../types";
import { isValidHexColor, normalizeHexColor } from "../../utils";

interface TabColorMenuProps {
    tab: TabItem;
    position: { x: number; y: number };
    onClose: () => void;
    onSelectColor: (color: string | undefined) => void;
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
    onClose,
    onSelectColor,
}: TabColorMenuProps) {
    const menuRef = useRef<HTMLDivElement>(null);
    const colorInputRef = useRef<HTMLInputElement>(null);
    const [coords, setCoords] = useState({ x: position.x, y: position.y });
    const [customHex, setCustomHex] = useState(
        tab.color ? tab.color.replace("#", "").toUpperCase() : "3B82F6"
    );

    const hasEyeDropper = typeof window !== "undefined" && "EyeDropper" in window;

    // Ajustar posición para no desbordar el viewport
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

    // Cerrar al hacer clic fuera o presionar Escape
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                onClose();
            }
        };

        const handlePointerDown = (e: MouseEvent | PointerEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                onClose();
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        window.addEventListener("pointerdown", handlePointerDown, true);

        return () => {
            window.removeEventListener("keydown", handleKeyDown);
            window.removeEventListener("pointerdown", handlePointerDown, true);
        };
    }, [onClose]);

    const handleApplyPreset = (hex: string) => {
        onSelectColor(hex);
        onClose();
    };

    const handleReset = () => {
        onSelectColor(undefined);
        onClose();
    };

    const handleCustomHexChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const raw = e.target.value.replace(/[^0-9A-Fa-f]/g, "").slice(0, 6);
        setCustomHex(raw.toUpperCase());
        if (raw.length === 6 || raw.length === 3) {
            const fullHex = normalizeHexColor(raw);
            if (isValidHexColor(fullHex)) {
                onSelectColor(fullHex);
            }
        }
    };

    const handleNativeColorPick = (e: React.ChangeEvent<HTMLInputElement>) => {
        const picked = e.target.value.toUpperCase();
        setCustomHex(picked.replace("#", ""));
        onSelectColor(picked);
    };

    const handleEyeDropper = async () => {
        if (!hasEyeDropper) return;
        try {
            // @ts-ignore
            const eyeDropper = new window.EyeDropper();
            const result = await eyeDropper.open();
            if (result?.sRGBHex) {
                const hex = result.sRGBHex.toUpperCase();
                setCustomHex(hex.replace("#", ""));
                onSelectColor(hex);
            }
        } catch {
            // Usuario canceló la pipeta
        }
    };

    const activeColor = tab.color?.toUpperCase();
    const currentSwatchColor = isValidHexColor("#" + customHex)
        ? "#" + customHex
        : tab.color || "#3B82F6";

    return (
        <div
            ref={menuRef}
            className="tab-color-menu"
            style={{
                left: `${coords.x}px`,
                top: `${coords.y}px`,
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.preventDefault()}
        >
            {/* Cabecera del desplegable */}
            <div className="tab-color-menu-header">
                <div className="tab-color-menu-title">
                    <Palette size={13} className="tab-color-menu-icon" />
                    <span>Color de pestaña</span>
                </div>
                <button
                    type="button"
                    className="tab-color-menu-close-btn"
                    onClick={onClose}
                    title="Cerrar (Esc)"
                >
                    <X size={12} />
                </button>
            </div>

            {/* Malla de colores predeterminados */}
            <div className="tab-color-presets-grid">
                {PRESET_COLORS.map((item) => {
                    const isSelected = activeColor === item.hex;
                    return (
                        <button
                            key={item.hex}
                            type="button"
                            className={`tab-color-swatch ${isSelected ? "selected" : ""}`}
                            style={{
                                backgroundColor: item.hex,
                                boxShadow: isSelected
                                    ? `0 0 10px ${item.hex}99, 0 0 0 2px #18181b, 0 0 0 3.5px ${item.hex}`
                                    : undefined,
                            }}
                            title={item.name}
                            onClick={() => handleApplyPreset(item.hex)}
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
                    {/* Botón de muestra con selector nativo oculto */}
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

                    {/* Input manual de Hexadecimal */}
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

                    {/* Pipeta cuenta-gotas si el sistema lo soporta */}
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
        </div>
    );
}
