import { createPortal } from "react-dom";
import { Plus, X } from "../../icons";
import { T } from "../../constants.js";

export interface SectionAddOption {
  id: string;
  label: string;
  detail?: string;
  color: string;
}

interface SectionAddSheetProps {
  accent: string;
  description: string;
  onClose: () => void;
  onSelect: (id: string) => void;
  options: SectionAddOption[];
  title: string;
}

export function SectionAddSheet({
  accent,
  description,
  onClose,
  onSelect,
  options,
  title,
}: SectionAddSheetProps) {
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1200,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        padding: "16px 16px calc(env(safe-area-inset-bottom, 0px) + 16px)",
        background: "rgba(3,6,14,0.72)",
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 460,
          maxHeight: "min(560px, calc(100dvh - 32px))",
          overflow: "hidden",
          borderRadius: 24,
          border: `1px solid ${T.border.default}`,
          background: `linear-gradient(180deg, ${T.bg.card} 0%, ${T.bg.surface} 100%)`,
          boxShadow: "0 24px 70px rgba(0,0,0,0.5)",
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div style={{ padding: "16px 18px 14px", borderBottom: `1px solid ${T.border.subtle}` }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
              <div
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 12,
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: accent,
                  background: `${accent}14`,
                  border: `1px solid ${accent}24`,
                }}
              >
                <Plus size={16} strokeWidth={2.4} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 800,
                    color: T.text.dim,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                  }}
                >
                  Add to audit
                </div>
                <div
                  style={{
                    marginTop: 2,
                    fontSize: 19,
                    fontWeight: 900,
                    color: T.text.primary,
                    letterSpacing: "-0.02em",
                  }}
                >
                  {title}
                </div>
              </div>
            </div>
            <button
              type="button"
              aria-label="Close add options"
              onClick={onClose}
              style={{
                width: 34,
                height: 34,
                borderRadius: 12,
                border: `1px solid ${T.border.default}`,
                background: T.bg.elevated,
                color: T.text.secondary,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              <X size={15} strokeWidth={2.2} />
            </button>
          </div>
          <div style={{ marginTop: 10, fontSize: 12, lineHeight: 1.5, color: T.text.secondary }}>{description}</div>
        </div>

        <div style={{ padding: 12, display: "grid", gap: 10, overflowY: "auto" }}>
          {options.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => onSelect(option.id)}
              style={{
                width: "100%",
                textAlign: "left",
                borderRadius: 18,
                border: `1px solid ${option.color}28`,
                background: `${option.color}10`,
                padding: "14px 16px",
                cursor: "pointer",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 14,
                    flexShrink: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: option.color,
                    background: `${option.color}16`,
                    border: `1px solid ${option.color}24`,
                  }}
                >
                  <Plus size={16} strokeWidth={2.4} />
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: T.text.primary }}>{option.label}</div>
                  {option.detail ? (
                    <div style={{ marginTop: 4, fontSize: 11, lineHeight: 1.5, color: T.text.secondary }}>
                      {option.detail}
                    </div>
                  ) : null}
                </div>
              </div>
            </button>
          ))}
        </div>

        <div style={{ padding: "0 12px 12px" }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              width: "100%",
              borderRadius: T.radius.lg,
              border: `1px solid ${T.border.default}`,
              background: "transparent",
              color: T.text.secondary,
              padding: "12px 14px",
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
