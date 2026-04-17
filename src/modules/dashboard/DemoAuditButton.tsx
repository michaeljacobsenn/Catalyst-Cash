import { T } from "../constants.js";
import { Zap } from "../icons";

interface DemoAuditButtonProps {
  label: string;
  onClick: () => void;
}

export default function DemoAuditButton({ label, onClick }: DemoAuditButtonProps) {
  return (
    <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
      <button
        onClick={onClick}
        style={{
          padding: "8px 12px",
          borderRadius: 999,
          border: `1px solid ${T.border.default}`,
          background: "transparent",
          color: T.text.secondary,
          fontSize: 11,
          fontWeight: 700,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <Zap size={12} strokeWidth={2.2} />
        {label}
      </button>
    </div>
  );
}
