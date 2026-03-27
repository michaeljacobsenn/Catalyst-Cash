import { useState } from "react";
import { createPortal } from "react-dom";
import { T } from "../constants.js";
import { Download, FileSpreadsheet, FileText, Loader2, Share2 } from "../icons";

import type { AuditRecord } from "../../types/index.js";

interface ToastApi {
  success?: (message: string) => void;
  error?: (message: string) => void;
  info?: (message: string) => void;
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
    Icon: Share2,
    accent: T.accent.primary,
    exporter: "exportAudit",
  },
  {
    id: "csv",
    title: "Export CSV",
    subtitle: "Spreadsheet-friendly breakdown of this audit",
    Icon: FileSpreadsheet,
    accent: T.status.green,
    exporter: "exportAuditCsv",
  },
  {
    id: "json",
    title: "Export JSON",
    subtitle: "Full structured record with metadata",
    Icon: FileText,
    accent: T.status.blue,
    exporter: "exportAuditJson",
  },
];

export default function AuditExportSheet({ audit, onClose, toast }: AuditExportSheetProps) {
  const [activeExportId, setActiveExportId] = useState<string | null>(null);

  if (typeof document === "undefined") return null;

  const handleExport = async (id: string, exporter: string, label: string) => {
    setActiveExportId(id);
    try {
      const exporters = await import("../auditExports.js");
      const run = exporters[exporter as keyof typeof exporters] as ((audit: AuditRecord) => Promise<{ completed?: boolean } | void>) | undefined;
      if (typeof run !== "function") throw new Error("Export action unavailable");
      const result = await run(audit);
      if (result?.completed === false) {
        toast?.info?.("Export canceled");
        return;
      }
      toast?.success?.(`${label} ready`);
      onClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Export failed";
      if (message.toLowerCase().includes("canceled")) {
        toast?.info?.("Export canceled");
        return;
      }
      toast?.error?.(message);
    } finally {
      setActiveExportId(null);
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
      onClick={activeExportId ? undefined : onClose}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 460,
          maxHeight: "min(560px, calc(100dvh - 32px))",
          borderRadius: 24,
          border: `1px solid ${T.border.default}`,
          background: `linear-gradient(180deg, ${T.bg.card} 0%, ${T.bg.surface} 100%)`,
          boxShadow: "0 24px 70px rgba(0,0,0,0.5)",
          overflow: "hidden",
        }}
        onClick={event => event.stopPropagation()}
      >
        <div style={{ padding: "16px 18px 14px", borderBottom: `1px solid ${T.border.subtle}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: 12,
                background: `${T.accent.primary}14`,
                border: `1px solid ${T.accent.primary}22`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: T.accent.primary,
                flexShrink: 0,
              }}
            >
              <Download size={16} strokeWidth={2.2} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: T.text.dim, letterSpacing: "0.12em", textTransform: "uppercase" }}>
                Audit Export
              </div>
              <div style={{ fontSize: 19, fontWeight: 900, color: T.text.primary, marginTop: 2, letterSpacing: "-0.02em" }}>
                Choose a format
              </div>
            </div>
          </div>
          <div style={{ fontSize: 12, color: T.text.secondary, lineHeight: 1.5, marginTop: 10 }}>
            Exports stay on-device until you choose where to save or share them.
          </div>
        </div>

        <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10, overflowY: "auto" }}>
          {ACTIONS.map(action => (
            <button
              key={action.id}
              onClick={() => void handleExport(action.id, action.exporter, action.title)}
              disabled={Boolean(activeExportId)}
              style={{
                width: "100%",
                textAlign: "left",
                borderRadius: 18,
                border: `1px solid ${activeExportId === action.id ? `${action.accent}38` : T.border.default}`,
                background: activeExportId === action.id ? `${action.accent}10` : T.bg.elevated,
                padding: "14px 16px",
                cursor: "pointer",
                opacity: activeExportId && activeExportId !== action.id ? 0.64 : 1,
                transition: "background .18s ease, border-color .18s ease, opacity .18s ease",
                justifyContent: "flex-start",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 14,
                    background: `${action.accent}16`,
                    border: `1px solid ${action.accent}22`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: action.accent,
                    flexShrink: 0,
                  }}
                >
                  {activeExportId === action.id ? <Loader2 size={16} strokeWidth={2.2} className="spin" style={{ animation: "spin 0.8s linear infinite" }} /> : <action.Icon size={16} strokeWidth={2.2} />}
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: T.text.primary }}>{action.title}</div>
                  <div style={{ fontSize: 11, color: T.text.secondary, marginTop: 4, lineHeight: 1.5 }}>{action.subtitle}</div>
                </div>
              </div>
            </button>
          ))}
        </div>

        <div style={{ padding: "0 12px 12px" }}>
          <button
            onClick={onClose}
            disabled={Boolean(activeExportId)}
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
              opacity: activeExportId ? 0.6 : 1,
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
