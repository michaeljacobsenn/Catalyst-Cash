import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { T } from "../../constants.js";
import { haptic } from "../../haptics.js";
import {
  applyBalanceSync,
  autoMatchAccounts,
  connectBank,
  fetchBalancesAndLiabilities,
  getConnections,
  saveConnectionLinks,
} from "../../plaid.js";
import { db, FaceId } from "../../utils.js";
import type { ThemeMode } from "../../contexts/SettingsContext.js";
import type {
  SetupWizardAiState,
  SetupWizardSecurityState,
  SetupWizardSpendingState,
  SetupWizardUpdate,
} from "../SetupWizard.js";
import { NavRow, WizField, WizInput, WizSelect, WizToggle } from "./primitives.js";
import { getWindowToast, typedProviders } from "./shared.js";

const ENABLE_PLAID = true;

interface PagePass3Props {
  ai: SetupWizardAiState;
  updateAi: SetupWizardUpdate<SetupWizardAiState>;
  security: SetupWizardSecurityState;
  updateSecurity: SetupWizardUpdate<SetupWizardSecurityState>;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
  spending: SetupWizardSpendingState;
  updateSpending: SetupWizardUpdate<SetupWizardSpendingState>;
  saving: boolean;
  isPro: boolean;
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
}

export function PagePass3({
  ai,
  updateAi,
  security,
  updateSecurity,
  onNext,
  onBack,
  onSkip,
  spending,
  updateSpending,
  isPro,
  themeMode,
  setThemeMode,
}: PagePass3Props) {
  const provider = typedProviders[0] ?? { id: "backend", models: [] };
  const [confirm, setConfirm] = useState(security.pin || "");
  const [plaidConnecting, setPlaidConnecting] = useState(false);
  const [plaidCount, setPlaidCount] = useState(0);
  const isNative = Capacitor.getPlatform() !== "web";

  useEffect(() => {
    getConnections()
      .then(c => setPlaidCount(c?.length || 0))
      .catch(() => {});
  }, []);

  const handlePlaidConnect = async () => {
    setPlaidConnecting(true);
    try {
      await connectBank(
        async connection => {
          try {
            const existingCards = (await db.get("cards")) || [];
            const existingBanks = (await db.get("bank-accounts")) || [];
            const existingConfig = (await db.get("financial-config")) || {};
            const plaidInvestments = existingConfig.plaidInvestments || [];
            const cardCatalog = (await db.get("card-catalog")) || [];

            const { newCards, newBankAccounts, newPlaidInvestments } = autoMatchAccounts(
              connection,
              existingCards,
              existingBanks,
              cardCatalog,
              plaidInvestments
            );
            await saveConnectionLinks(connection);

            function mergeUniqueById<T extends { id?: string | null }>(existing: T[] = [], incoming: T[] = []): T[] {
              const ids = new Set(existing.map((item) => item.id).filter(Boolean));
              return [...existing, ...incoming.filter((item) => item.id && !ids.has(item.id))];
            }

            const allCards = mergeUniqueById(existingCards, newCards);
            const allBanks = mergeUniqueById(existingBanks, newBankAccounts);
            const allInvests = mergeUniqueById(plaidInvestments, newPlaidInvestments);

            await db.set("cards", allCards);
            await db.set("bank-accounts", allBanks);
            if (newPlaidInvestments.length > 0) {
              existingConfig.plaidInvestments = allInvests;
              await db.set("financial-config", existingConfig);
            }

            try {
              const refreshed = await fetchBalancesAndLiabilities(connection.id);
              if (refreshed) {
                const syncData = applyBalanceSync(refreshed, allCards, allBanks, allInvests) as {
                  updatedCards: unknown[];
                  updatedBankAccounts: unknown[];
                  updatedPlaidInvestments?: unknown[];
                };
                await db.set("cards", syncData.updatedCards);
                await db.set("bank-accounts", syncData.updatedBankAccounts);
                if (syncData.updatedPlaidInvestments) {
                  existingConfig.plaidInvestments = syncData.updatedPlaidInvestments;
                  await db.set("financial-config", existingConfig);
                }
                await saveConnectionLinks(refreshed);
              }
            } catch {
              // Non-fatal: account link succeeded, balances can refresh later.
            }
          } catch {
            // Surface only the top-level error toast below.
          }
        },
        () => {
          getWindowToast()?.error?.("Failed to link bank");
        }
      );

      const conns = await getConnections();
      setPlaidCount(conns?.length || 0);
      getWindowToast()?.success?.("Bank connected successfully!");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Connection failed";
      if (!message.toLowerCase().includes("exit") && !message.toLowerCase().includes("cancel")) {
        getWindowToast()?.error?.(message || "Connection failed");
      }
    }
    setPlaidConnecting(false);
  };

  const handleFaceIdToggle = async (checked: boolean) => {
    if (!checked) {
      updateSecurity("useFaceId", false);
      return;
    }
    try {
      const res = await FaceId.isAvailable();
      if (!res.isAvailable) {
        getWindowToast()?.error?.("No biometrics set up on this device.");
        return;
      }
      updateSecurity("useFaceId", true);
    } catch {
      getWindowToast()?.error?.("Biometrics unavailable.");
    }
  };

  const pinMismatch = security.pinEnabled && security.pin && confirm && security.pin !== confirm;
  const canProceed = !security.pinEnabled || (security.pin.length >= 4 && !pinMismatch);

  return (
    <div>
      <div
        style={{
          marginBottom: 18,
          padding: "12px 14px",
          background: T.bg.elevated,
          border: `1px solid ${T.border.subtle}`,
          borderRadius: T.radius.lg,
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 800, color: T.text.primary, marginBottom: 4 }}>Finish strong</div>
        <div style={{ fontSize: 12, color: T.text.secondary, lineHeight: 1.5 }}>
          Everything here is optional. You can complete setup now, then come back later to link banks, enable security,
          or track retirement accounts.
        </div>
      </div>

      {ENABLE_PLAID && (
        <>
          <div style={{ marginBottom: 24 }}>
            <h3 style={{ fontSize: 16, fontWeight: 800, color: T.text.primary, margin: "0 0 6px 0", letterSpacing: "-0.01em" }}>
              Connect Your Accounts
            </h3>
            <p style={{ fontSize: 13, color: T.text.secondary, margin: 0, lineHeight: 1.5 }}>
              Link accounts if you want live balances and faster updates. You can skip this now and use manual entry first.
            </p>
          </div>

          <div
            style={{
              padding: "16px",
              marginBottom: 20,
              background: `linear-gradient(145deg, ${T.bg.elevated}, ${T.bg.base})`,
              border: `1px solid ${T.border.default}`,
              borderRadius: T.radius.lg,
              boxShadow: `0 4px 24px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.05)`,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  flexShrink: 0,
                  background: "linear-gradient(135deg, #0A85D120, #6C63FF15)",
                  border: "1px solid #0A85D130",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 18,
                }}
              >
                🏦
              </div>
              <div>
                <h4 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: T.text.primary }}>Connect Your Bank</h4>
                <p style={{ margin: 0, fontSize: 11, color: T.text.dim }}>Auto-sync balances securely via Plaid</p>
              </div>
            </div>
            {plaidCount > 0 ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "10px 14px",
                  borderRadius: T.radius.md,
                  background: `${T.status.green}10`,
                  border: `1px solid ${T.status.green}25`,
                  marginBottom: 8,
                }}
              >
                <span style={{ fontSize: 14 }}>✅</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: T.status.green }}>
                  {plaidCount} bank{plaidCount > 1 ? "s" : ""} connected
                </span>
              </div>
            ) : (
              <p style={{ fontSize: 12, color: T.text.secondary, lineHeight: 1.5, margin: "0 0 12px 0" }}>
                Instantly pull real-time balances from your checking, savings, and credit accounts. Plaid handles
                authentication directly and Catalyst Cash never stores your bank login credentials.
              </p>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => {
                  haptic.medium();
                  void handlePlaidConnect();
                }}
                disabled={plaidConnecting}
                style={{
                  flex: 1,
                  padding: "14px",
                  borderRadius: T.radius.md,
                  border: "none",
                  background: T.accent.primary,
                  color: "#fff",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: plaidConnecting ? "not-allowed" : "pointer",
                  opacity: plaidConnecting ? 0.6 : 1,
                  boxShadow: `inset 0 1px 1px rgba(255,255,255,0.15), 0 4px 12px ${T.accent.primary}30`,
                  transition: "all 0.2s",
                }}
              >
                {plaidConnecting ? "Connecting…" : plaidCount > 0 ? "+ Link Another Bank" : "🔗 Link via Plaid"}
              </button>
            </div>
            <p style={{ fontSize: 10, color: T.text.dim, marginTop: 8, textAlign: "center", margin: "8px 0 0 0" }}>
              You can also skip this and enter individual balances manually later.
            </p>
          </div>
        </>
      )}

      <div style={{ margin: "12px 0", borderTop: `1px solid ${T.border.subtle}`, paddingTop: 16 }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, color: T.text.primary, margin: "0 0 4px 0" }}>
          Retirement Tracking
        </h3>
        <p style={{ fontSize: 11, color: T.text.muted, margin: "0 0 16px 0" }}>
          Let the AI optimize your retirement path and estimate tax savings.
        </p>
      </div>

      <WizToggle
        label="Track Roth IRA"
        sub="The AI will direct extra cash here after debts"
        checked={spending.trackRothContributions}
        onChange={v => updateSpending("trackRothContributions", v)}
      />
      {spending.trackRothContributions && (
        <WizField label="Roth Annual Limit ($)" hint="IRS limit for this year">
          <WizInput type="number" inputMode="decimal" pattern="[0-9]*" value={spending.rothAnnualLimit} onChange={v => updateSpending("rothAnnualLimit", v)} placeholder="e.g. 7000" />
        </WizField>
      )}

      <WizToggle
        label="Track 401k"
        sub="Factor in employer matches and tax deductions"
        checked={spending.track401k}
        onChange={v => updateSpending("track401k", v)}
      />
      {spending.track401k && (
        <>
          <WizField label="401k Annual Limit ($)" hint="IRS limit for this year">
            <WizInput type="number" inputMode="decimal" pattern="[0-9]*" value={spending.k401AnnualLimit} onChange={v => updateSpending("k401AnnualLimit", v)} placeholder="e.g. 23000" />
          </WizField>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <WizField label="Employer Match (%)" hint="e.g. 100 for dollar-for-dollar">
              <WizInput type="number" inputMode="decimal" pattern="[0-9]*" value={spending.k401EmployerMatchPct} onChange={v => updateSpending("k401EmployerMatchPct", v)} placeholder="e.g. 100" />
            </WizField>
            <WizField label="Match Ceiling (%)" hint="Up to % of your salary">
              <WizInput type="number" inputMode="decimal" pattern="[0-9]*" value={spending.k401EmployerMatchLimit} onChange={v => updateSpending("k401EmployerMatchLimit", v)} placeholder="e.g. 5" />
            </WizField>
          </div>
        </>
      )}

      <WizToggle label="Track HSA" sub="Triple tax-advantaged health savings" checked={spending.trackHSA} onChange={v => updateSpending("trackHSA", v)} />
      <WizToggle label="Track Crypto" sub="Monitor your digital assets" checked={spending.trackCrypto !== false} onChange={v => updateSpending("trackCrypto", v)} />

      <div style={{ margin: "24px 0 12px", borderTop: `1px solid ${T.border.subtle}`, paddingTop: 20 }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, color: T.text.primary, margin: "0 0 4px 0" }}>App Experience</h3>
        <p style={{ fontSize: 11, color: T.text.muted, margin: "0 0 16px 0" }}>
          Choose how Catalyst Cash looks and feels.
        </p>
      </div>

      <WizField label="Theme Mode" hint="System matches your device settings. Select Light or Dark to override.">
        <WizSelect
          value={themeMode || "system"}
          onChange={v => setThemeMode(v as ThemeMode)}
          options={[
            { value: "system", label: "⚙️ System Auto" },
            { value: "dark", label: "🌙 Dark Mode" },
            { value: "light", label: "☀️ Light Mode" },
          ]}
        />
      </WizField>

      <div style={{ margin: "24px 0 12px", borderTop: `1px solid ${T.border.subtle}`, paddingTop: 20 }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, color: T.text.primary, margin: "0 0 4px 0" }}>AI Intelligence</h3>
        <p style={{ fontSize: 11, color: T.text.muted, margin: "0 0 16px 0" }}>
          Choose how your audits are powered.
        </p>
      </div>

      <WizField label="AI Engine" hint="Catalyst AI handles everything — no configuration needed.">
        <div
          style={{
            padding: "14px 16px",
            background: `${T.status.green}15`,
            border: `1px solid ${T.status.green}30`,
            borderRadius: T.radius.md,
            marginBottom: 16,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 14, fontWeight: 800, color: T.accent.emerald }}>✨ Catalyst AI</span>
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: T.accent.primary,
                fontFamily: T.font.mono,
                background: T.accent.primaryDim,
                padding: "2px 8px",
                borderRadius: 99,
              }}
            >
              ACTIVE
            </span>
          </div>
          <p style={{ margin: 0, fontSize: 12, color: T.text.secondary, lineHeight: 1.5 }}>
            Your audits are powered by our secure AI backend. No API keys, no setup — just tap "Run Audit."
          </p>
        </div>
      </WizField>
      {isPro ? (
        <WizField label="Model" hint="Fast AI is selected by default. Switch anytime.">
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {provider.models.map(m => {
              const active = ai.aiModel === m.id;
              const isProModel = m.tier === "pro";
              const locked = (isProModel && !isPro) || m.disabled;
              return (
                <button
                  key={m.id}
                  onClick={() => {
                    if (!locked) {
                      updateAi("aiProvider", "backend");
                      updateAi("aiModel", m.id);
                    }
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "12px 14px",
                    borderRadius: T.radius.md,
                    cursor: locked ? "default" : "pointer",
                    opacity: m.disabled ? 0.4 : (isProModel && !isPro) ? 0.5 : 1,
                    background: active ? T.accent.primaryDim : T.bg.elevated,
                    border: `1.5px solid ${active ? T.accent.primary : T.border.default}`,
                    textAlign: "left",
                  }}
                >
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: T.text.primary }}>{m.name}</span>
                      {m.comingSoon ? (
                        <span style={{ fontSize: 8, fontWeight: 800, color: T.text.muted, background: `${T.text.muted}15`, border: `1px solid ${T.text.muted}30`, padding: "1px 6px", borderRadius: 99 }}>
                          SOON
                        </span>
                      ) : isProModel ? (
                        <span style={{ fontSize: 8, fontWeight: 800, color: "#FFD700", background: "linear-gradient(135deg, #FFD70020, #FFA50020)", border: "1px solid #FFD70030", padding: "1px 6px", borderRadius: 99 }}>
                          PRO
                        </span>
                      ) : (
                        <span style={{ fontSize: 8, fontWeight: 800, color: T.status.green, background: `${T.status.green}15`, border: `1px solid ${T.status.green}30`, padding: "1px 6px", borderRadius: 99 }}>
                          FREE
                        </span>
                      )}
                    </div>
                    <span style={{ fontSize: 11, color: T.text.dim }}>{m.comingSoon ? "Coming soon" : m.note}</span>
                  </div>
                  {active && <div style={{ width: 8, height: 8, borderRadius: "50%", background: T.accent.primary }} />}
                </button>
              );
            })}
          </div>
        </WizField>
      ) : (
        <WizField label="AI Model" hint="Free includes Standard AI. Upgrade later for Fast AI and Precision AI.">
          <div
            style={{
              padding: "14px 16px",
              borderRadius: T.radius.md,
              border: `1px solid ${T.border.default}`,
              background: T.bg.elevated,
              fontSize: 12,
              color: T.text.secondary,
              lineHeight: 1.5,
            }}
          >
            Standard AI is enabled automatically on Free. You can unlock Fast AI and Precision AI anytime after setup.
          </div>
        </WizField>
      )}

      <div style={{ margin: "24px 0 12px", borderTop: `1px solid ${T.border.subtle}`, paddingTop: 20 }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, color: T.text.primary, margin: "0 0 4px 0" }}>Security & Backup</h3>
        <p style={{ fontSize: 11, color: T.text.muted, margin: "0 0 16px 0" }}>Lock down your on-device data.</p>
      </div>

      {!isNative && (
        <div
          style={{
            marginBottom: 14,
            padding: "12px 14px",
            background: `${T.status.amber}10`,
            border: `1px solid ${T.status.amber}30`,
            borderRadius: T.radius.md,
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 800, color: T.status.amber, marginBottom: 4 }}>
            Native-only protection
          </div>
          <div style={{ fontSize: 11, color: T.text.secondary, lineHeight: 1.5 }}>
            PIN lock, biometrics, and Apple-backed device security are available in the native iPhone app only.
            Web setup keeps going without storing device secrets in the browser.
          </div>
        </div>
      )}

      <WizToggle
        label="Enable PIN lock"
        sub="Require a PIN to open the app"
        checked={security.pinEnabled}
        onChange={v => {
          if (!isNative) return;
          updateSecurity("pinEnabled", v);
        }}
        disabled={!isNative}
      />
      {security.pinEnabled && (
        <>
          <WizField label="Set PIN (4–8 digits)" hint="Numbers only">
            <WizInput
              type="tel"
              inputMode="numeric"
              pattern="[0-9]*"
              value={security.pin}
              onChange={v => updateSecurity("pin", v.replace(/\D/g, "").slice(0, 8))}
              placeholder="e.g. 1234"
            />
          </WizField>
          <WizField label="Confirm PIN">
            <WizInput
              type="tel"
              inputMode="numeric"
              pattern="[0-9]*"
              value={confirm}
              onChange={v => setConfirm(v.replace(/\D/g, "").slice(0, 8))}
              placeholder="Re-enter PIN"
              style={{ borderColor: pinMismatch ? T.status.red : undefined }}
            />
            {pinMismatch && <div style={{ fontSize: 12, color: T.status.red, marginTop: 4 }}>⚠️ PINs don't match</div>}
          </WizField>
          {isNative && (
            <div style={{ marginTop: 8, marginBottom: 16 }}>
              <WizToggle
                label="Enable Face ID / Touch ID"
                sub="Use biometrics for faster unlocking"
                checked={security.useFaceId}
                onChange={handleFaceIdToggle}
              />
            </div>
          )}
        </>
      )}
      <WizField label="Auto-Lock After" hint="How long before the app locks when backgrounded">
        <WizSelect
          value={security.lockTimeout}
          onChange={v => {
            if (!isNative) return;
            updateSecurity("lockTimeout", Number(v));
          }}
          disabled={!isNative}
          options={[
            { value: 0, label: "⚡ Immediately" },
            { value: 30, label: "⏱ 30 seconds" },
            { value: 60, label: "⏱ 1 minute" },
            { value: 300, label: "⏱ 5 minutes" },
            { value: 900, label: "⏱ 15 minutes" },
            { value: -1, label: "🔓 Never" },
          ]}
        />
      </WizField>

      <NavRow onBack={onBack} onNext={onNext} onSkip={onSkip} nextLabel="Save & Finish →" nextDisabled={!canProceed} />
    </div>
  );
}
