import { useState, useCallback, useEffect, createContext, useContext } from "react";
import { CheckCircle, AlertTriangle, X, Info, Clipboard } from "lucide-react";
import { T } from "./constants.js";

// ═══════════════════════════════════════════════════════════════
// TOAST CONTEXT — app-wide snackbar system
// ═══════════════════════════════════════════════════════════════
const ToastContext = createContext(null);

export function useToast() {
    const ctx = useContext(ToastContext);
    if (!ctx) throw new Error("useToast must be used within ToastProvider");
    return ctx;
}

export function ToastProvider({ children }) {
    const [toasts, setToasts] = useState([]);

    const addToast = useCallback((message, { type = "info", duration = 3000, action = null } = {}) => {
        const id = Date.now() + Math.random();
        setToasts(prev => [...prev, { id, message, type, action }]);
        if (duration > 0) setTimeout(() => removeToast(id), duration);
        return id;
    }, []);

    const removeToast = useCallback((id) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    const api = {
        info: (msg, opts) => addToast(msg, { type: "info", ...opts }),
        success: (msg, opts) => addToast(msg, { type: "success", ...opts }),
        warning: (msg, opts) => addToast(msg, { type: "warning", ...opts }),
        error: (msg, opts) => addToast(msg, { type: "error", ...opts }),
        clipboard: (msg, opts) => addToast(msg, { type: "clipboard", ...opts }),
    };

    return <ToastContext.Provider value={api}>
        {children}
        <ToastContainer toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>;
}

const ICONS = {
    info: { Icon: Info, color: T.accent.primary, bg: T.accent.primaryDim },
    success: { Icon: CheckCircle, color: T.status.green, bg: T.status.greenDim },
    warning: { Icon: AlertTriangle, color: T.status.amber, bg: T.status.amberDim },
    error: { Icon: AlertTriangle, color: T.status.red, bg: T.status.redDim },
    clipboard: { Icon: Clipboard, color: T.accent.emerald, bg: T.accent.emeraldDim },
};

function ToastContainer({ toasts, onRemove }) {
    if (!toasts.length) return null;
    return <div style={{
        position: "fixed", top: `calc(env(safe-area-inset-top, 12px) + 8px)`,
        left: 16, right: 16, zIndex: 200,
        display: "flex", flexDirection: "column", gap: 8,
        pointerEvents: "none"
    }}>
        {toasts.map(t => <Toast key={t.id} toast={t} onRemove={() => onRemove(t.id)} />)}
    </div>;
}

function Toast({ toast, onRemove }) {
    const [visible, setVisible] = useState(false);
    useEffect(() => { requestAnimationFrame(() => setVisible(true)); }, []);

    const { Icon, color, bg } = ICONS[toast.type] || ICONS.info;

    return <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "12px 14px", borderRadius: 14,
        background: T.bg.elevated, border: `1px solid ${color}25`,
        boxShadow: `0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px ${T.border.subtle}`,
        backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
        transform: visible ? "translateY(0)" : "translateY(-20px)",
        opacity: visible ? 1 : 0,
        transition: "all 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
        pointerEvents: "auto"
    }}>
        <div style={{
            width: 28, height: 28, borderRadius: 8, flexShrink: 0,
            background: bg, display: "flex", alignItems: "center", justifyContent: "center"
        }}>
            <Icon size={14} color={color} strokeWidth={2.5} />
        </div>
        <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: T.text.primary, lineHeight: 1.4 }}>{toast.message}</span>
        {toast.action && <button onClick={toast.action.fn} style={{
            padding: "6px 12px", borderRadius: 8, border: `1px solid ${color}30`,
            background: bg, color, fontSize: 11, fontWeight: 700,
            cursor: "pointer", whiteSpace: "nowrap"
        }}>{toast.action.label}</button>}
        <button onClick={onRemove} style={{
            width: 24, height: 24, borderRadius: 6, border: "none",
            background: "transparent", color: T.text.muted, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0
        }}><X size={12} /></button>
    </div>;
}
