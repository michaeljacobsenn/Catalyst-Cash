import { Suspense } from "react";

import { T } from "../constants.js";
import { CloudUpload, Shield } from "../icons";
import UiGlyph from "../UiGlyph.js";
import { getTracking } from "../ui.js";

interface DashboardTopChromeProps {
  greeting: string;
  streak: number;
  runConfetti: boolean;
  windowSize: { width: number; height: number };
  LazyConfetti: React.ComponentType<{ width: number; height: number; recycle: boolean; numberOfPieces: number; gravity: number }>;
  showBackupNudge: boolean;
  backingUp: boolean;
  onBackupNow: () => void;
  onDismissBackupNudge: () => void;
  onEnableAutoBackup: () => void;
}

function BackupNudgeCard({
  backingUp,
  onBackupNow,
  onDismissBackupNudge,
  onEnableAutoBackup,
}: Pick<DashboardTopChromeProps, "backingUp" | "onBackupNow" | "onDismissBackupNudge" | "onEnableAutoBackup">) {
  return (
    <div
      style={{
        border: `1px solid ${T.status.amber}30`,
        background: `linear-gradient(180deg, ${T.bg.card}, ${T.bg.elevated})`,
        padding: "14px 16px",
        marginBottom: 12,
        animation: "fadeInUp .4s ease-out",
        borderRadius: T.radius.lg,
        boxShadow: T.shadow.card,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <Shield size={14} color={T.status.amber} />
        <span style={{ fontSize: 11, fontWeight: 800, color: T.status.amber, fontFamily: T.font.mono, letterSpacing: "0.04em" }}>
          BACKUP REMINDER
        </span>
        <button
          onClick={onDismissBackupNudge}
          style={{ marginLeft: "auto", background: "none", border: "none", color: T.text.dim, cursor: "pointer", fontSize: 16, padding: 4, lineHeight: 1 }}
        >
          ×
        </button>
      </div>
      <p style={{ fontSize: 12, color: T.text.secondary, lineHeight: 1.5, margin: "0 0 10px" }}>
        Your data hasn't been backed up recently. Protect your financial data.
      </p>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={onBackupNow}
          disabled={backingUp}
          className="hover-btn"
          style={{
            flex: "1 1 160px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 5,
            padding: "10px 12px",
            borderRadius: T.radius.md,
            border: "none",
            background: `${T.status.amber}16`,
            color: T.status.amber,
            fontSize: 11,
            fontWeight: 800,
            cursor: "pointer",
            opacity: backingUp ? 0.6 : 1,
            borderWidth: 1,
            borderStyle: "solid",
            borderColor: `${T.status.amber}28`,
          }}
        >
          <CloudUpload size={13} />
          {backingUp ? "Backing up..." : "Back Up Now"}
        </button>
        <button
          onClick={onEnableAutoBackup}
          className="hover-btn"
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 5,
            padding: "10px 12px",
            borderRadius: T.radius.md,
            border: `1px solid ${T.border.default}`,
            background: T.bg.surface,
            color: T.status.amber,
            fontSize: 11,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Enable Auto-Backup
        </button>
      </div>
    </div>
  );
}

export function DashboardTopChrome(props: DashboardTopChromeProps) {
  const {
    greeting,
    streak,
    runConfetti,
    windowSize,
    LazyConfetti,
    showBackupNudge,
    backingUp,
    onBackupNow,
    onDismissBackupNudge,
    onEnableAutoBackup,
  } = props;

  return (
    <>
      {runConfetti && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, pointerEvents: "none" }}>
          <Suspense fallback={null}>
            <LazyConfetti width={windowSize.width} height={windowSize.height} recycle={false} numberOfPieces={400} gravity={0.15} />
          </Suspense>
        </div>
      )}
      <div style={{ paddingTop: 18, paddingBottom: 14, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 850, letterSpacing: getTracking(22, "bold"), margin: 0 }}>Dashboard</h1>
          <p style={{ fontSize: 12, color: T.text.secondary, margin: "4px 0 0", fontWeight: 600, letterSpacing: "0.01em" }}>{greeting}</p>
        </div>
        {streak > 1 && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 999, background: `${T.accent.emerald}10`, border: `1px solid ${T.status.green}24`, flexShrink: 0 }}>
            <UiGlyph glyph="🔥" size={12} color={T.status.green} />
            <span style={{ fontSize: 10, fontWeight: 800, color: T.status.green, fontFamily: T.font.mono, letterSpacing: "0.06em" }}>W{streak}</span>
          </div>
        )}
      </div>
      {showBackupNudge && (
        <BackupNudgeCard
          backingUp={backingUp}
          onBackupNow={onBackupNow}
          onDismissBackupNudge={onDismissBackupNudge}
          onEnableAutoBackup={onEnableAutoBackup}
        />
      )}
    </>
  );
}
