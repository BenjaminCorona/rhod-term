import React, { useState, useEffect, useRef, useLayoutEffect, useCallback } from "react";
import { Check, X, Layers, Trash2, Tag } from "lucide-react";
import { TabGroup } from "../../types";

interface GroupContextMenuProps {
    group: TabGroup;
    position: { x: number; y: number };
    onClose: () => void;
    onUpdateGroup: (title: string, color: string) => void;
    onUngroup: () => void;
    onCloseGroup: () => void;
}

const GROUP_COLORS = [
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

export function GroupContextMenu({
    group,
    position,
    onClose,
    onUpdateGroup,
    onUngroup,
    onCloseGroup,
}: GroupContextMenuProps) {
    const menuRef = useRef<HTMLDivElement>(null);
    const [coords, setCoords] = useState({ x: position.x, y: position.y });
    const [isClosing, setIsClosing] = useState(false);
    const [title, setTitle] = useState(group.title);
    const [selectedColor, setSelectedColor] = useState(group.color);

    const handleDismiss = useCallback(() => {
        if (isClosing) return;
        setIsClosing(true);
        setTimeout(() => {
            onClose();
        }, 120);
    }, [isClosing, onClose]);

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
        setSelectedColor(hex);
        onUpdateGroup(title, hex);
    };

    const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setTitle(val);
        onUpdateGroup(val, selectedColor);
    };

    const handleUngroupClick = () => {
        onUngroup();
        handleDismiss();
    };

    const handleCloseGroupClick = () => {
        onCloseGroup();
        handleDismiss();
    };

    return (
        <div
            ref={menuRef}
            className={`tab-color-menu group-context-menu ${isClosing ? "is-closing" : ""}`}
            style={{
                left: `${coords.x}px`,
                top: `${coords.y}px`,
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.preventDefault()}
        >
            {/* Cabecera */}
            <div className="tab-color-menu-header">
                <div className="tab-color-menu-title">
                    <Tag size={13} className="tab-color-menu-icon" />
                    <span>Editar grupo de pestañas</span>
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

            {/* Input para nombre del grupo */}
            <div className="group-name-input-row">
                <input
                    type="text"
                    value={title}
                    onChange={handleTitleChange}
                    placeholder="Nombre del grupo..."
                    className="group-title-input"
                    maxLength={24}
                    autoFocus
                />
            </div>

            {/* Malla de colores para el grupo */}
            <div className="tab-color-presets-grid" style={{ marginTop: "10px", marginBottom: "10px" }}>
                {GROUP_COLORS.map((item) => {
                    const isSelected = selectedColor.toUpperCase() === item.hex.toUpperCase();
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

            {/* Opciones de Desagrupar y Cerrar grupo */}
            <div className="group-menu-actions">
                <button
                    type="button"
                    className="tab-color-reset-item group-action-btn"
                    onClick={handleUngroupClick}
                >
                    <Layers size={12} className="tab-color-reset-icon" />
                    <span>Desagrupar pestañas</span>
                </button>

                <button
                    type="button"
                    className="tab-color-reset-item group-action-btn danger"
                    onClick={handleCloseGroupClick}
                >
                    <Trash2 size={12} className="tab-color-reset-icon danger" />
                    <span>Cerrar grupo</span>
                </button>
            </div>
        </div>
    );
}
