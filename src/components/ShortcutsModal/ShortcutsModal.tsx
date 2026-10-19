import { useState } from "react";
import { Search, X } from "lucide-react";
import { ShortcutItem } from "../../types";
import { CATEGORIES } from "../../constants";

interface ShortcutsModalProps {
    isOpen: boolean;
    appVersion: string;
    shortcutsCatalog: ShortcutItem[];
    onClose: () => void;
    onExecuteShortcut: (shortcut: ShortcutItem) => void;
}

export function ShortcutsModal({
    isOpen,
    appVersion,
    shortcutsCatalog,
    onClose,
    onExecuteShortcut,
}: ShortcutsModalProps) {
    const [searchQuery, setSearchQuery] = useState("");
    const [activeCategory, setActiveCategory] = useState("Todos");

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

    return (
        <div className="modal-overlay" onClick={onClose}>
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
                        autoComplete="off"
                        autoCorrect="off"
                        autoCapitalize="off"
                        spellCheck={false}
                    />
                    <button type="button" className="btn-close" onClick={onClose}>
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
                                className="shortcut-row"
                                onClick={() => onExecuteShortcut(item)}
                            >
                                <div className="row-content">
                                    <span className="row-label">{item.label}</span>
                                    <span className="row-desc">{item.desc}</span>
                                </div>
                                <div className="row-right">
                                    <div className="keys-group">
                                        {item.keys.map((k, i) => (
                                            <span key={i} className="key-wrap">
                                                <kbd>{k}</kbd>
                                                {i < item.keys.length - 1 && (
                                                    <span className="key-sep">+</span>
                                                )}
                                            </span>
                                        ))}
                                    </div>
                                    {item.actionType && (
                                        <span className="row-badge">Acción</span>
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

                <div className="modal-footer-bar">
                    <span>
                        Haz clic en cualquier atajo para ejecutarlo directamente • Rhod v{appVersion}
                    </span>
                    <kbd>ESC</kbd>
                </div>
            </div>
        </div>
    );
}
