import type { ReactElement } from "react";
import { T } from "../constants.js";
import { Card, Label } from "../ui.js";

export function AppearanceSection({
  activeMenu,
  Toggle,
}: {
  activeMenu: "finance" | "profile" | "ai" | "backup" | "dev" | "security" | "plaid" | null;
  Toggle: ({ value, onChange }: { value: boolean; onChange: (value: boolean) => void }) => ReactElement;
}) {
  return (
    <div style={{ display: activeMenu === "profile" ? "block" : "none", marginTop: 16 }}>
      <Card style={{ padding: 0, overflow: "hidden", borderLeft: `3px solid ${T.accent.purple}40`, borderTopLeftRadius: 0, borderTopRightRadius: 0, borderTop: "none" }}>
        <div style={{ padding: "16px" }}>
          <Label>Appearance</Label>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: T.bg.elevated, padding: "12px 16px", borderRadius: T.radius.lg, border: `1px solid ${T.border.subtle}` }}>
              <span style={{ fontSize: 14, color: T.text.primary, fontWeight: 600 }}>Dark Theme</span>
              <Toggle value={true} onChange={() => {}} />
            </div>
          </div>
          <p style={{ marginTop: 12, fontSize: 12, color: T.text.muted, lineHeight: 1.5 }}>
            Catalyst Cash only supports Dark Mode at this time to preserve battery life and high-contrast styling.
          </p>
        </div>
      </Card>
    </div>
  );
}
