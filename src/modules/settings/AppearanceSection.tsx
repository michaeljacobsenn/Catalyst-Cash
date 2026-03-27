import { T } from "../constants.js";
import { Card, Label } from "../ui.js";
import type { ThemeMode } from "../contexts/SettingsContext.js";

export function AppearanceSection({
  activeMenu,
  themeMode,
  setThemeMode,
}: {
  activeMenu: "finance" | "profile" | "ai" | "backup" | "dev" | "security" | "plaid" | null;
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
}) {
  const optionStyle = (active: boolean) => ({
    flex: 1,
    minHeight: 44,
    borderRadius: T.radius.md,
    border: `1px solid ${active ? T.accent.primary : T.border.default}`,
    background: active ? `${T.accent.primary}18` : T.bg.elevated,
    color: active ? T.text.primary : T.text.secondary,
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
    transition: "all 0.2s",
  });

  return (
    <div style={{ display: activeMenu === "profile" ? "block" : "none", marginTop: 16 }}>
      <Card style={{ padding: 0, overflow: "hidden", borderLeft: `3px solid ${T.accent.purple}40`, borderTopLeftRadius: 0, borderTopRightRadius: 0, borderTop: "none" }}>
        <div style={{ padding: "16px" }}>
          <Label>Appearance</Label>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ background: T.bg.elevated, padding: "12px 16px", borderRadius: T.radius.lg, border: `1px solid ${T.border.subtle}` }}>
              <div style={{ fontSize: 14, color: T.text.primary, fontWeight: 600, marginBottom: 10 }}>Theme Mode</div>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" onClick={() => setThemeMode("system")} style={optionStyle(themeMode === "system")}>
                  Auto
                </button>
                <button type="button" onClick={() => setThemeMode("light")} style={optionStyle(themeMode === "light")}>
                  Light
                </button>
                <button type="button" onClick={() => setThemeMode("dark")} style={optionStyle(themeMode === "dark")}>
                  Dark
                </button>
              </div>
            </div>
          </div>
          <p style={{ marginTop: 12, fontSize: 12, color: T.text.muted, lineHeight: 1.5 }}>
            Auto follows your device. Light and Dark apply immediately and persist across relaunches.
          </p>
        </div>
      </Card>
    </div>
  );
}
