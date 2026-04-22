import { useState, type ChangeEvent } from "react";
import { T } from "../../constants.js";
import { Card, Label } from "../../ui.js";

function formatAuditDateDisplay(value: string): string {
  if (!value) return "Select date";
  const parsed = new Date(`${value}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function AuditPickerField({
  type,
  ariaLabel,
  value,
  onChange,
  displayValue,
}: {
  type: "date" | "time";
  ariaLabel: string;
  value: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  displayValue: string;
}) {
  const [focused, setFocused] = useState(false);

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        minHeight: 44,
        borderRadius: T.radius.md,
        background: T.bg.elevated,
        border: `1.5px solid ${focused ? T.accent.primary : T.border.default}`,
        boxSizing: "border-box",
        boxShadow: focused ? `0 0 0 2px ${T.accent.primary}18` : "none",
        transition: "border-color 0.18s ease, box-shadow 0.18s ease",
        overflow: "hidden",
      }}
    >
      <div
        aria-hidden="true"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "100%",
          minHeight: 44,
          padding: "10px 12px",
          color: T.text.primary,
          fontSize: 13,
          fontFamily: T.font.sans,
          fontWeight: 700,
          letterSpacing: "-0.01em",
          boxSizing: "border-box",
        }}
      >
        {displayValue}
      </div>
      <input
        type={type}
        aria-label={ariaLabel}
        value={value}
        onChange={onChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          opacity: 0,
          WebkitAppearance: "none",
          appearance: "none",
        }}
      />
    </div>
  );
}

interface AuditDateCardProps {
  value: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
}

export function AuditDateCard({ value, onChange }: AuditDateCardProps) {
  return (
    <Card
      className="hover-card"
      variant="glass"
      style={{ marginBottom: 8, position: "relative", overflow: "hidden" }}
    >
      <div
        style={{
          position: "absolute",
          right: -20,
          top: -20,
          width: 60,
          height: 60,
          background: T.accent.primary,
          filter: "blur(40px)",
          opacity: 0.06,
          borderRadius: "50%",
          pointerEvents: "none",
        }}
      />
      <Label style={{ fontWeight: 800 }}>Date</Label>
      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 8 }}>
        <AuditPickerField
          type="date"
          ariaLabel="Audit date"
          value={value}
          onChange={onChange}
          displayValue={formatAuditDateDisplay(value)}
        />
      </div>
    </Card>
  );
}
