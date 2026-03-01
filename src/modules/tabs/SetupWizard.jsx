import { useState, useRef, useEffect } from "react";
import { T } from "../constants.js";
import { AI_PROVIDERS } from "../providers.js";
import { db } from "../utils.js";
import {
    PageWelcome, PageImport, PagePass1,
    PagePass2, PagePass3, PageDone
} from "./SetupWizardPages.jsx";

const PAGES = [
    { id: "welcome", emoji: "👋", title: "Welcome", subtitle: "AI-powered financial intelligence." },
    { id: "import", emoji: "📥", title: "Import Data", subtitle: "Already have a backup? Skip manual entry." },
    { id: "pass1", emoji: "⚡️", title: "Pass 1: Core Profile", subtitle: "Income, pay schedule, and spending allowances." },
    { id: "pass2", emoji: "🎯", title: "Pass 2: Safety Targets", subtitle: "Floor limits, reserves, and tax optimization." },
    { id: "pass3", emoji: "⚙️", title: "Pass 3: Power Features", subtitle: "Bank sync, retirement, AI engine, and security." },
    { id: "done", emoji: "🎉", title: "All Set!", subtitle: "" },
];
const TOTAL = PAGES.length;

function ProgressBar({ step }) {
    return (
        <div style={{ display: "flex", gap: 5, marginBottom: 6 }}>
            {PAGES.map((_, i) => (
                <div key={i} style={{
                    flex: 1, height: 3, borderRadius: 2,
                    background: i < step ? T.accent.primary : i === step ? T.accent.primarySoft : T.bg.surface,
                    transition: "background .35s"
                }} />
            ))}
        </div>
    );
}

function StepHeader({ step }) {
    const page = PAGES[step];
    if (step === TOTAL - 1) return null; // Done page has its own header
    return (
        <div style={{ marginBottom: 22 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                <span style={{ fontSize: 26 }}>{page.emoji}</span>
                <div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: T.text.primary, lineHeight: 1.2 }}>{page.title}</div>
                    {page.subtitle && <div style={{ fontSize: 13, color: T.text.dim, marginTop: 2 }}>{page.subtitle}</div>}
                </div>
            </div>
            <div style={{ fontSize: 11, color: T.text.dim, fontFamily: T.font.mono }}>
                Step {step + 1} of {TOTAL}
            </div>
        </div>
    );
}

import { useSecurity } from '../contexts/SecurityContext.jsx';
import { useNavigation } from '../contexts/NavigationContext.jsx';
import { useToast } from '../Toast.jsx';

export default function SetupWizard() {
    const { setAppleLinkedId, appleLinkedId } = useSecurity();
    const { setOnboardingComplete } = useNavigation();
    const toast = useToast();
    const onComplete = () => setOnboardingComplete(true);

    // Called from Import page "Go to Dashboard" — saves data and exits directly
    const skipToDashboard = async () => {
        setSaving(true);
        try {
            // Save AI provider + model defaults
            await db.set("ai-provider", ai.aiProvider);
            await db.set("ai-model", ai.aiModel);
            // Mark onboarding complete so wizard never shows again
            await db.set("onboarding-complete", true);
            // Exit the wizard directly
            setIsExiting(true);
            setTimeout(() => window.location.reload(), 300);
        } catch (e) {
            toast?.error("Save failed: " + (e.message || "unknown error"));
        }
        setSaving(false);
    };

    const [step, setStep] = useState(0);
    const [saving, setSaving] = useState(false);
    const [isExiting, setIsExiting] = useState(false);
    const scrollRef = useRef(null);

    useEffect(() => {
        if (scrollRef.current) scrollRef.current.scrollTo(0, 0);
    }, [step]);

    // Per-page state
    const [income, setIncome] = useState({
        payFrequency: "bi-weekly", payday: "Friday",
        incomeType: "salary", hourlyRateNet: "", typicalHours: "", averagePaycheck: "",
        paycheckStandard: "", paycheckFirstOfMonth: "", isContractor: false,
        taxBracketPercent: "",
    });
    const [spending, setSpending] = useState({
        weeklySpendAllowance: "", emergencyFloor: "", checkingBuffer: "",
        greenStatusTarget: "", emergencyReserveTarget: "", defaultAPR: "24.99",
        trackRothContributions: false, rothAnnualLimit: "",
        track401k: false, k401AnnualLimit: "", k401EmployerMatchPct: "", k401EmployerMatchLimit: "",
    }); // Spending state preserved for saveAndFinish defaults
    const [ai, setAi] = useState({
        aiProvider: "backend", aiModel: "gemini-2.5-flash", apiKey: "",
    });
    const [security, setSecurity] = useState({
        pinEnabled: false, pin: "", lockTimeout: 0, useFaceId: false,
    });

    const updateIncome = (k, v) => setIncome(p => ({ ...p, [k]: v }));
    const updateSpending = (k, v) => setSpending(p => ({ ...p, [k]: v }));
    const updateAi = (k, v) => setAi(p => {
        const next = { ...p, [k]: v };
        if (k === "aiProvider") {
            const prov = AI_PROVIDERS.find(x => x.id === v);
            if (prov) next.aiModel = prov.defaultModel;
        }
        return next;
    });
    const updateSecurity = (k, v) => setSecurity(p => ({ ...p, [k]: v }));

    const next = () => setStep(s => Math.min(s + 1, TOTAL - 1));
    const back = () => setStep(s => Math.max(s - 1, 0));
    const skip = () => next(); // skip = advance without saving page data

    // Called from Security page "Save & Finish"
    const saveAndFinish = async () => {
        setSaving(true);
        try {
            // Financial config — merge with any existing (e.g. from CSV import)
            const existing = (await db.get("financial-config")) || {};
            const merged = {
                ...existing,
                payFrequency: income.payFrequency,
                payday: income.payday,
                incomeType: income.incomeType || "salary",
                hourlyRateNet: parseFloat(income.hourlyRateNet) || existing.hourlyRateNet || 0,
                typicalHours: parseFloat(income.typicalHours) || existing.typicalHours || 0,
                averagePaycheck: parseFloat(income.averagePaycheck) || existing.averagePaycheck || 0,
                paycheckStandard: parseFloat(income.paycheckStandard) || existing.paycheckStandard || 0,
                paycheckFirstOfMonth: parseFloat(income.paycheckFirstOfMonth) || existing.paycheckFirstOfMonth || 0,
                isContractor: income.isContractor,
                taxBracketPercent: parseFloat(income.taxBracketPercent) || existing.taxBracketPercent || 0,
                weeklySpendAllowance: parseFloat(spending.weeklySpendAllowance) || existing.weeklySpendAllowance || 0,
                emergencyFloor: parseFloat(spending.emergencyFloor) || existing.emergencyFloor || 0,
                checkingBuffer: parseFloat(spending.checkingBuffer) || existing.checkingBuffer || 0,
                greenStatusTarget: parseFloat(spending.greenStatusTarget) || existing.greenStatusTarget || 0,
                emergencyReserveTarget: parseFloat(spending.emergencyReserveTarget) || existing.emergencyReserveTarget || 0,
                defaultAPR: parseFloat(spending.defaultAPR) || existing.defaultAPR || 24.99,
                trackRothContributions: spending.trackRothContributions,
                rothAnnualLimit: parseFloat(spending.rothAnnualLimit) || existing.rothAnnualLimit || 0,
                track401k: spending.track401k,
                k401AnnualLimit: parseFloat(spending.k401AnnualLimit) || existing.k401AnnualLimit || 0,
                k401EmployerMatchPct: parseFloat(spending.k401EmployerMatchPct) || existing.k401EmployerMatchPct || 0,
                k401EmployerMatchLimit: parseFloat(spending.k401EmployerMatchLimit) || existing.k401EmployerMatchLimit || 0,
            };
            delete merged._fromSetupWizard;
            await db.set("financial-config", merged);

            // AI provider + model
            await db.set("ai-provider", ai.aiProvider);
            await db.set("ai-model", ai.aiModel);
            if (ai.apiKey.trim()) {
                const prov = AI_PROVIDERS.find(p => p.id === ai.aiProvider);
                if (prov) await db.set(prov.keyStorageKey, ai.apiKey.trim());
            }

            // Security — only write if user set a PIN
            if (security.pinEnabled && security.pin.length >= 4) {
                await db.set("app-passcode", security.pin);
                await db.set("require-auth", true);
                if (security.useFaceId) await db.set("use-face-id", true);
            }
            if (security.lockTimeout !== undefined) {
                await db.set("lock-timeout", security.lockTimeout);
            }
            if (security.autoBackupInterval) {
                await db.set("auto-backup-interval", security.autoBackupInterval);
            }

            // Mark onboarding complete so wizard never shows again
            await db.set("onboarding-complete", true);

            next(); // → Done page
        } catch (e) {
            toast?.error("Save failed: " + (e.message || "unknown error"));
        }
        setSaving(false);
    };

    // Security page "Save & Finish" triggers saveAndFinish instead of next()
    const handleSecurityNext = () => saveAndFinish();

    // "Skip" on security page still saves non-PIN settings and marks complete
    const handleSecuritySkip = async () => {
        setSaving(true);
        try {
            await db.set("lock-timeout", security.lockTimeout);
            await db.set("onboarding-complete", true);
            next();
        } catch { /* ignore */ }
        setSaving(false);
    };

    const handleFinish = () => {
        setIsExiting(true);
        // Delay reload to let fade animation play out natively (onComplete is naturally true in DB now)
        setTimeout(() => window.location.reload(), 300);
    };

    const pageId = PAGES[step].id;

    return (
        <div style={{
            position: "fixed", inset: 0, zIndex: 200,
            background: T.bg.base,
            display: "flex", flexDirection: "column",
            fontFamily: T.font.sans, overflow: "hidden",
            transition: "opacity 0.3s ease-in-out",
            opacity: isExiting ? 0 : 1,
        }}>
            {/* Scrollable content area */}
            <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "calc(env(safe-area-inset-top, 40px) + 20px) 20px 40px" }}>
                <style>{`
                    @keyframes slideFadeIn {
                        from { opacity: 0; transform: translateY(20px) scale(0.98); }
                        to { opacity: 1; transform: translateY(0) scale(1); }
                    }
                    .wiz-input { transition: border-color 0.2s ease, box-shadow 0.2s ease; }
                    .wiz-input:focus { border-color: ${T.accent.primary} !important; box-shadow: 0 0 0 3px ${T.accent.primary}30 !important; }
                `}</style>
                <div style={{ maxWidth: 420, margin: "0 auto" }}>

                    {/* Top gradient accent line */}
                    <div style={{ height: 3, background: T.accent.gradient, flexShrink: 0, marginBottom: 8, borderRadius: 2 }} />

                    {/* Progress */}
                    <ProgressBar step={step} />

                    {/* Step header */}
                    <StepHeader step={step} />

                    {/* Page content */}
                    <div key={pageId} style={{ animation: "slideFadeIn 0.4s cubic-bezier(0.2, 0.8, 0.2, 1) forwards" }}>
                        {pageId === "welcome" && (
                            <PageWelcome onNext={next} />
                        )}
                        {pageId === "import" && (
                            <PageImport onNext={next} toast={toast} onComplete={skipToDashboard} />
                        )}
                        {pageId === "pass1" && (
                            <PagePass1
                                data={{ ...income, ...spending }}
                                onChange={(k, v) => {
                                    if (k in income) updateIncome(k, v);
                                    else updateSpending(k, v);
                                }}
                                onNext={next} onBack={back} onSkip={skip}
                            />
                        )}
                        {pageId === "pass2" && (
                            <PagePass2
                                data={{ ...income, ...spending }}
                                onChange={(k, v) => {
                                    if (k in income) updateIncome(k, v);
                                    else updateSpending(k, v);
                                }}
                                onNext={next} onBack={back} onSkip={skip}
                            />
                        )}
                        {pageId === "pass3" && (
                            <PagePass3
                                ai={ai} security={security} spending={spending}
                                updateAi={updateAi} updateSecurity={updateSecurity} updateSpending={updateSpending}
                                onNext={handleSecurityNext}
                                onBack={back}
                                onSkip={handleSecuritySkip}
                                saving={saving}
                                setAppleLinkedId={setAppleLinkedId}
                                appleLinkedId={appleLinkedId}
                            />
                        )}
                        {pageId === "done" && (
                            <PageDone onFinish={handleFinish} />
                        )}
                    </div>
                </div>
            </div>

            {/* Bottom safe area spacer */}
            <div style={{ height: "env(safe-area-inset-bottom, 16px)", flexShrink: 0 }} />
        </div>
    );
}
