import React, { useState, useMemo, useEffect, Suspense } from "react";
import { Plus, Settings, AlertTriangle, ArrowRight, Wallet, TrendingUp, HelpCircle } from "lucide-react";
import { T } from "../constants.js";
import { Card } from "../ui.jsx";
import { useBudget } from "../contexts/BudgetContext.jsx";
import { usePortfolio } from "../contexts/PortfolioContext.jsx";
import { useAudit } from "../contexts/AuditContext.jsx";
import { fmt } from "../utils.js";
import { haptic } from "../haptics.js";
import { shouldShowGating } from "../subscription.js";
import ProBanner from "./ProBanner.jsx";
const LazyProPaywall = React.lazy(() => import("./ProPaywall.jsx"));

const STRIPE_CSS = `
@keyframes progress-stripe {
  from { background-position: 20px 0; }
  to { background-position: 0 0; }
}
`;

const BUDGET_CATEGORIES = [
  { id: "housing", label: "Housing & Utilities", icon: "🏠", color: T.status.blue },
  { id: "food", label: "Food & Dining", icon: "🍔", color: T.status.orange },
  { id: "transportation", label: "Transportation", icon: "🚗", color: T.accent.primary },
  { id: "shopping", label: "Shopping", icon: "🛍️", color: T.accent.emerald },
  { id: "entertainment", label: "Entertainment", icon: "🎬", color: T.status.magenta },
  { id: "personal", label: "Personal Care", icon: "✂️", color: T.status.cyan },
  { id: "health", label: "Health & Wellness", icon: "💊", color: T.status.red },
  { id: "savings", label: "Savings & Investments", icon: "📈", color: T.status.green },
];

function getBucketId(name) {
  const n = name.toLowerCase();
  if (n.includes("house") || n.includes("rent") || n.includes("util")) return "housing";
  if (n.includes("food") || n.includes("dining") || n.includes("restaurant") || n.includes("grocer")) return "food";
  if (n.includes("car") || n.includes("gas") || n.includes("transit") || n.includes("uber")) return "transportation";
  if (n.includes("shop") || n.includes("amazon") || n.includes("retail")) return "shopping";
  if (n.includes("movie") || n.includes("fun") || n.includes("enter") || n.includes("subscrip")) return "entertainment";
  if (n.includes("health") || n.includes("doctor") || n.includes("pharm") || n.includes("fitness") || n.includes("gym")) return "health";
  if (n.includes("save") || n.includes("invest")) return "savings";
  return "personal";
}

export default function BudgetTab({ onRunAudit }) {
  const { envelopes, monthlyIncome, updateMonthlyIncome, allocateToEnvelope, getReadyToAssign } = useBudget();
  const { current } = useAudit();
  
  const [editingIncome, setEditingIncome] = useState(false);
  const [incomeInput, setIncomeInput] = useState("");
  const [showPaywall, setShowPaywall] = useState(false);

  useEffect(() => {
    if (editingIncome) setIncomeInput(String(monthlyIncome || ""));
  }, [editingIncome, monthlyIncome]);

  const readyToAssign = getReadyToAssign();
  
  const spendTracking = useMemo(() => {
    if (!current?.parsed?.categories) return {};
    const tracking = {};
    Object.entries(current.parsed.categories).forEach(([cat, data]) => {
      const mappedId = getBucketId(cat);
      if (!tracking[mappedId]) tracking[mappedId] = 0;
      tracking[mappedId] += (data.total || 0);
    });
    return tracking;
  }, [current]);

  const handleIncomeSubmit = (e) => {
    e.preventDefault();
    const val = parseFloat(incomeInput.replace(/[^0-9.]/g, ''));
    if (!isNaN(val)) {
      updateMonthlyIncome(val);
      haptic.success();
    }
    setEditingIncome(false);
  };

  const onAllocate = (catId, valStr) => {
    const val = parseFloat(valStr.replace(/[^0-9.]/g, ''));
    if (!isNaN(val) && val >= 0) {
      allocateToEnvelope(catId, val);
    }
  };

  return (
    <div className="page-body stagger-container" style={{ paddingBottom: 100, display: "flex", flexDirection: "column", alignItems: "center", width: "100%" }}>
      <style>{STRIPE_CSS}</style>
      <div style={{ width: "100%", maxWidth: 768, display: "flex", flexDirection: "column" }}>
      {/* ═══ Header ═══ */}
      <div style={{ paddingTop: 20, paddingBottom: 16 }}>
        <h1 style={{ fontSize: 24, fontWeight: 900, marginBottom: 8, color: T.text.primary }}>Active Budget</h1>
        <p style={{ fontSize: 13, color: T.text.secondary, margin: 0 }}>
          Give every dollar a job. Allocate your income across your envelopes to stay ahead of spending.
        </p>
      </div>

      {shouldShowGating() && (
        <ProBanner
          onUpgrade={() => setShowPaywall(true)}
          label="⚡ AI Budget Insights"
          sublabel="Pro unlocks AI-powered spending patterns and smart alerts"
        />
      )}
      {showPaywall && (
        <Suspense fallback={null}>
          <LazyProPaywall onClose={() => setShowPaywall(false)} />
        </Suspense>
      )}

      {/* ═══ Ready to Assign Block ═══ */}
      <Card
        variant="glass"
        style={{
          padding: 24,
          marginBottom: 24,
          background: readyToAssign > 0 
            ? `linear-gradient(135deg, ${T.status.green}15, ${T.status.green}05)` 
            : readyToAssign < 0 
              ? `linear-gradient(135deg, ${T.status.red}15, ${T.status.red}05)`
              : T.bg.elevated,
          border: `1px solid ${readyToAssign > 0 ? T.status.green : readyToAssign < 0 ? T.status.red : T.border.default}`,
          textAlign: "center"
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 800, color: readyToAssign === 0 ? T.text.dim : readyToAssign > 0 ? T.status.green : T.status.red, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
          {readyToAssign > 0 ? "Ready to Assign" : readyToAssign < 0 ? "Overassigned" : "All Funds Assigned"}
        </div>
        <div style={{ fontSize: 42, fontWeight: 900, color: T.text.primary, letterSpacing: "-0.04em", display: "flex", alignItems: "baseline", justifyContent: "center" }}>
          <span style={{ fontSize: 24, color: T.text.dim, marginRight: 4, transform: "translateY(-6px)" }}>$</span>
          {Math.abs(readyToAssign).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
        </div>
        
        <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${T.border.subtle}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
           <span style={{ fontSize: 12, color: T.text.dim }}>Monthly Income</span>
           {editingIncome ? (
              <form onSubmit={handleIncomeSubmit} style={{ display: "flex", gap: 8 }}>
                 <input 
                   autoFocus
                   type="number"
                   value={incomeInput}
                   onChange={e => setIncomeInput(e.target.value)}
                   style={{
                     background: T.bg.base,
                     border: `1px solid ${T.accent.primary}50`,
                     color: T.text.primary,
                     borderRadius: 6,
                     padding: "4px 8px",
                     width: 100,
                     fontSize: 14,
                     outline: "none"
                   }}
                 />
                 <button type="submit" style={{ background: T.accent.primary, color: "#fff", border: "none", borderRadius: 6, padding: "4px 12px", fontSize: 12, fontWeight: 700 }}>Save</button>
              </form>
           ) : (
             <div 
               onClick={() => { haptic.light(); setEditingIncome(true); }}
               style={{ fontSize: 15, fontWeight: 700, color: T.text.primary, borderBottom: `1px dashed ${T.border.default}`, cursor: "pointer" }}
              >
               ${(monthlyIncome || 0).toLocaleString()}
             </div>
           )}
        </div>
      </Card>

      {/* ═══ Envelopes List ═══ */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {BUDGET_CATEGORIES.map((cat, idx) => {
          const allocation = envelopes[cat.id] || 0;
          const spent = spendTracking[cat.id] || 0;
          const remaining = allocation - spent;
          const progress = allocation > 0 ? Math.min(spent / allocation, 1) : 0;
          
          return (
            <Card
              key={cat.id}
              animate
              delay={idx * 50}
              style={{
                padding: 0,
                overflow: "hidden",
                borderLeft: `3px solid ${cat.color}`
              }}
            >
              <div 
                style={{ 
                  display: "flex", 
                  alignItems: "center", 
                  justifyContent: "space-between",
                  padding: "16px",
                  background: `${cat.color}08`,
                  borderBottom: `1px solid ${T.border.subtle}`
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ fontSize: 20 }}>{cat.icon}</div>
                  <span style={{ fontSize: 14, fontWeight: 700, color: T.text.primary }}>{cat.label}</span>
                </div>
                
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", marginRight: 12 }}>
                     <span style={{ fontSize: 10, color: T.text.dim, textTransform: "uppercase", fontWeight: 700 }}>Assigned</span>
                     <input
                        type="number"
                        placeholder="0"
                        value={allocation || ""}
                        onChange={(e) => onAllocate(cat.id, e.target.value)}
                        style={{
                           background: T.bg.elevated,
                           border: `1px solid ${T.border.default}`,
                           padding: "4px 8px",
                           borderRadius: 6,
                           width: 80,
                           textAlign: "right",
                           color: T.accent.primary,
                           fontSize: 14,
                           fontWeight: 800,
                           outline: "none"
                        }}
                     />
                  </div>
                </div>
              </div>

              <div style={{ padding: "16px" }}>
                 <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
                    <div>
                       <span style={{ fontSize: 20, fontWeight: 800, color: remaining < 0 ? T.status.red : T.text.primary, letterSpacing: "-0.02em" }}>
                          ${remaining.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                       </span>
                       <span style={{ fontSize: 12, color: T.text.dim, marginLeft: 6 }}>Available</span>
                    </div>
                    
                    <div style={{ fontSize: 12, color: T.text.secondary, fontWeight: 600 }}>
                       ${spent.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })} spent
                    </div>
                 </div>

                 <div style={{ width: "100%", height: 8, borderRadius: 4, background: `${T.border.default}80`, overflow: "hidden", position: "relative" }}>
                    {/* Background track */}
                    <div 
                      style={{ 
                        height: "100%", 
                        width: `${progress * 100}%`, 
                        background: remaining < 0 ? T.status.red : progress > 0.85 ? T.status.orange : cat.color,
                        transition: "width 0.5s cubic-bezier(0.4, 0, 0.2, 1), background-color 0.3s ease",
                        borderRadius: 4,
                        position: "relative",
                        overflow: "hidden"
                      }}
                    >
                      {/* Warning stripes when overspent or near limit */}
                      {progress > 0.85 && (
                        <div style={{
                          position: "absolute",
                          top: 0, left: 0, right: 0, bottom: 0,
                          backgroundImage: "linear-gradient(45deg, rgba(255,255,255,.15) 25%, transparent 25%, transparent 50%, rgba(255,255,255,.15) 50%, rgba(255,255,255,.15) 75%, transparent 75%, transparent)",
                          backgroundSize: "20px 20px",
                          animation: "progress-stripe 2s linear infinite",
                          opacity: remaining < 0 ? 0.8 : 0.4
                        }} />
                      )}
                    </div>
                 </div>
              </div>
            </Card>
          )
        })}
      </div>
      </div>
    </div>
  );
}
