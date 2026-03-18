import { createPortal } from "react-dom";
import { T } from "../constants.js";
import { exportAudit, exportAuditCsv, exportAuditJson } from "../utils.js";

import type { AuditRecord } from "../../types/index.js";

interface ToastApi {
  success?: (message: string) => void;
  error?: (message: string) => void;
}

interface AuditExportSheetProps {
  audit: AuditRecord;
  onClose: () => void;
  toast?: ToastApi | undefined;
}

const ACTIONS = [
  {
    id: "pdf",
    title: "Export PDF",
    subtitle: "Designed tear sheet for sharing or printing",
    run: exportAudit,
  },
  {
    id: "csv",
    title: "Export CSV",
    subtitle: "Spreadsheet-friendly breakdown of this audit",
    run: exportAuditCsv,
  },
  {
    id: "json",
    title: "Export JSON",
    subtitle: "Full structured record with metadata",
    run: exportAuditJson,
  },
];

export default function AuditExportSheet({ audit, onClose, toast }: AuditExportSheetProps) {
  if (typeof document === "undefined") return null;

  const handleExport = async (run: (audit: AuditRecord) => Promise<void>, label: string) => {
    try {
      await run(audit);
      toast?.success?.(`${label} ready`);
      onClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Export failed";
      toast?.error?.(message);
    }
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Export audit"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(3,6,14,0.72)",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        zIndex: 1200,
        padding: "16px 16px calc(env(safe-area-inset-bottom, 0px) + 16px)",
        touchAction: "none",
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 460,
          borderRadius: 24,
          border: `1px solid ${T.border.default}`,
          background: `linear-gradient(180deg, ${T.bg.card} 0%, ${T.bg.base} 100%)`,
          boxShadow: "0 20px 60px rgba(0,0,0,0.45)",
          overflow: "hidden",
        }}
        onClick={event => event.stopPropagation()}
      >
        <div style={{ padding: "14px 18px 10px", borderBottom: `1px solid ${T.border.subtle}` }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: T.text.dim, letterSpacing: "0.12em", textTransform: "uppercase" }}>
            Audit Export
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: T.text.primary, marginTop: 6 }}>
            Choose a format
          </div>
        </div>

        <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
          {ACTIONS.map(action => (
            <button
              key={action.id}
              onClick={() => void handleExport(action.run, action.title)}
              style={{
                width: "100%",
                textAlign: "left",
                borderRadius: T.radius.lg,
                border: `1px solid ${T.border.default}`,
                background: T.bg.elevated,
                padding: "14px 16px",
                cursor: "pointer",
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 700, color: T.text.primary }}>{action.title}</div>
              <div style={{ fontSize: 11, color: T.text.secondary, marginTop: 4, lineHeight: 1.45 }}>{action.subtitle}</div>
            </button>
          ))}
        </div>

        <div style={{ padding: "0 12px 12px" }}>
          <button
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
