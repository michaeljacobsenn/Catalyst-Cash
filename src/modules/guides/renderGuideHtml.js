import {
  COMMON_QUESTIONS,
  COMING_SOON_FEATURES,
  FINANCE_LOGIC_CARDS,
  FREE_UPGRADE_CARDS,
  GUIDE_BADGES,
  PAYWALL_FEATURES,
  PLAN_FACTS,
  PRICING_FACTS,
  PRIVACY_CARDS,
  PRO_PLAYBOOK,
  TAB_GUIDE_CARDS,
  WORKFLOW_STEPS,
} from "./guideData.js";

const PAGE_CONFIG = {
  free: {
    eyebrow: "Free Guide",
    accent: "emerald",
    lead:
      "Start here if you want the simplest way to use the app well without learning finance jargon first.",
    secondaryCta: true,
  },
  pro: {
    eyebrow: "Pro Guide",
    accent: "gold",
    lead:
      "This is the same core workflow with more room, more depth, and better tools for heavier use.",
    secondaryCta: false,
  },
};

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderStat(label, value) {
  return `
    <div class="stat-card">
      <div class="stat-label">${escapeHtml(label)}</div>
      <div class="stat-value">${escapeHtml(value)}</div>
    </div>
  `;
}

function renderStatus(status, pageTier) {
  const label = GUIDE_BADGES[status] || status;
  const tone = status === "pro" ? "status-pro" : status === "split" ? "status-split" : status === "native" ? "status-native" : "status-all";
  const locked = pageTier === "free" && status === "pro" ? " status-locked" : "";
  return `<span class="status-pill ${tone}${locked}">${escapeHtml(label)}</span>`;
}

function renderCard(card, pageTier) {
  const locked = pageTier === "free" && card.status === "pro";
  return `
    <article class="info-card${locked ? " info-card-locked" : ""}">
      <div class="card-top">
        <h3>${escapeHtml(card.title)}</h3>
        ${renderStatus(card.status || "all", pageTier)}
      </div>
      <p>${escapeHtml(card.body)}</p>
    </article>
  `;
}

function renderStep(step, index) {
  return `
    <div class="step-row">
      <div class="step-index">${index + 1}</div>
      <div>
        <h3>${escapeHtml(step.title)}</h3>
        <p>${escapeHtml(step.body)}</p>
      </div>
    </div>
  `;
}

function renderMatrixRow(row) {
  return `
    <div class="matrix-row">
      <div class="matrix-label"><span>${escapeHtml(row.icon)}</span>${escapeHtml(row.label)}</div>
      <div class="matrix-free">${escapeHtml(row.free)}</div>
      <div class="matrix-pro">${escapeHtml(row.pro)}</div>
    </div>
  `;
}

function renderFaq(item) {
  return `
    <details class="faq-item">
      <summary>${escapeHtml(item.question)}</summary>
      <p>${escapeHtml(item.answer)}</p>
    </details>
  `;
}

function renderCallout(pageTier) {
  if (pageTier !== "free") return "";
  return `
    <section class="panel upgrade-panel">
      <div class="section-head">
        <div>
          <span class="section-kicker">When Pro Helps</span>
          <h2>Upgrade only when Free starts to feel tight</h2>
        </div>
        <button class="cta-button" type="button" data-upgrade="true">Start ${escapeHtml(PRICING_FACTS.trial)}</button>
      </div>
      <div class="card-grid">
        ${FREE_UPGRADE_CARDS.map(card => renderCard({ ...card, status: "pro" }, pageTier)).join("")}
      </div>
      <div class="price-strip">
        <span>${escapeHtml(PRICING_FACTS.monthly)}</span>
        <span>${escapeHtml(PRICING_FACTS.yearly)}</span>
        <span>${escapeHtml(PRICING_FACTS.yearlyPerMonth)}</span>
      </div>
    </section>
  `;
}

function renderTierSpecificSection(pageTier) {
  if (pageTier === "free") return renderCallout(pageTier);

  return `
    <section class="panel">
      <div class="section-head">
        <div>
          <span class="section-kicker">Pro Tips</span>
          <h2>How to get the most out of Pro</h2>
        </div>
      </div>
      <div class="steps-list">
        ${PRO_PLAYBOOK.map(renderStep).join("")}
      </div>
      <div class="coming-grid">
        ${COMING_SOON_FEATURES.map(
          item => `
            <article class="coming-card">
              <div class="coming-icon">${escapeHtml(item.icon)}</div>
              <h3>${escapeHtml(item.label)}</h3>
              <p>${escapeHtml(item.desc)}</p>
            </article>
          `
        ).join("")}
      </div>
    </section>
  `;
}

export function renderGuideHtml(pageTier = "free") {
  const tier = pageTier === "pro" ? "pro" : "free";
  const page = PAGE_CONFIG[tier];
  const plan = PLAN_FACTS[tier];
  const oppositePlan = PLAN_FACTS[tier === "free" ? "pro" : "free"];

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="dark" />
  <meta name="theme-color" content="#071019" />
  <title>Catalyst Cash ${tier === "pro" ? "Pro" : "Free"} Guide</title>
  <style>
    :root {
      --bg: #071019;
      --bg2: #0f1724;
      --panel: rgba(15, 23, 36, 0.88);
      --card: rgba(17, 27, 42, 0.92);
      --border: rgba(255, 255, 255, 0.09);
      --text: #f4f7fb;
      --text2: #afbdd2;
      --text3: #70809a;
      --emerald: #40d9a4;
      --emerald-soft: rgba(64, 217, 164, 0.12);
      --cyan: #67c6ff;
      --gold: #dcb15b;
      --gold-soft: rgba(220, 177, 91, 0.14);
      --red: #ff7d7d;
      --shadow: 0 22px 60px rgba(0, 0, 0, 0.34);
      --radius-xl: 28px;
      --radius-lg: 20px;
      --radius-md: 14px;
      --font-sans: "SF Pro Display", "Avenir Next", "Segoe UI", sans-serif;
      --font-mono: "SF Mono", "Menlo", monospace;
    }
    * { box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body {
      margin: 0;
      font-family: var(--font-sans);
      background:
        radial-gradient(circle at top, ${tier === "pro" ? "rgba(220, 177, 91, 0.18)" : "rgba(64, 217, 164, 0.14)"} 0%, rgba(7, 16, 25, 0) 34%),
        linear-gradient(180deg, #08111b 0%, #071019 100%);
      color: var(--text);
      line-height: 1.58;
      padding-bottom: 80px;
    }
    body::before {
      content: "";
      position: fixed;
      inset: 0;
      pointer-events: none;
      background:
        linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px),
        linear-gradient(180deg, rgba(255,255,255,0.02) 1px, transparent 1px);
      background-size: 28px 28px;
      mask-image: linear-gradient(180deg, rgba(0,0,0,0.45), transparent 80%);
      opacity: 0.25;
    }
    .shell {
      width: min(960px, calc(100vw - 24px));
      margin: 0 auto;
      position: relative;
      z-index: 1;
    }
    .hero {
      padding: 22px 0 18px;
    }
    .hero-panel,
    .panel {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: var(--radius-xl);
      box-shadow: var(--shadow);
      backdrop-filter: blur(18px);
      -webkit-backdrop-filter: blur(18px);
    }
    .hero-panel {
      overflow: hidden;
      position: relative;
    }
    .hero-panel::after {
      content: "";
      position: absolute;
      inset: 0;
      background: linear-gradient(135deg, ${tier === "pro" ? "rgba(220, 177, 91, 0.15)" : "rgba(64, 217, 164, 0.12)"} 0%, transparent 48%);
      pointer-events: none;
    }
    .hero-top {
      padding: 24px 20px 18px;
      display: grid;
      gap: 14px;
    }
    .eyebrow-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
    }
    .eyebrow {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 7px 12px;
      border-radius: 999px;
      border: 1px solid ${tier === "pro" ? "rgba(220, 177, 91, 0.38)" : "rgba(64, 217, 164, 0.34)"};
      background: ${tier === "pro" ? "var(--gold-soft)" : "var(--emerald-soft)"};
      color: ${tier === "pro" ? "var(--gold)" : "var(--emerald)"};
      font-family: var(--font-mono);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .eyebrow-sub {
      color: var(--text3);
      font-family: var(--font-mono);
      font-size: 11px;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }
    h1 {
      margin: 0;
      font-size: clamp(30px, 6vw, 46px);
      line-height: 1;
      letter-spacing: -0.05em;
      max-width: 14ch;
    }
    .hero-copy {
      display: grid;
      gap: 8px;
      max-width: 62ch;
    }
    .hero-copy p,
    .panel p,
    .step-row p,
    .faq-item p,
    .coming-card p,
    .info-card p {
      margin: 0;
      color: var(--text2);
      font-size: 15px;
    }
    .hero-actions {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }
    .cta-button,
    .ghost-button,
    .nav-chip {
      appearance: none;
      border: none;
      cursor: pointer;
      text-decoration: none;
      font: inherit;
    }
    .cta-button {
      padding: 12px 16px;
      border-radius: 14px;
      background: ${tier === "pro" ? "linear-gradient(135deg, #dcb15b, #f3d084)" : "linear-gradient(135deg, #40d9a4, #67c6ff)"};
      color: #071019;
      font-weight: 800;
    }
    .ghost-button {
      padding: 12px 16px;
      border-radius: 14px;
      background: rgba(255,255,255,0.04);
      color: var(--text);
      border: 1px solid var(--border);
    }
    .hero-stats {
      display: grid;
      grid-template-columns: repeat(5, minmax(0, 1fr));
      gap: 1px;
      background: rgba(255,255,255,0.05);
    }
    .stat-card {
      background: var(--card);
      padding: 14px 12px;
      min-height: 84px;
    }
    .stat-label {
      font-family: var(--font-mono);
      font-size: 10px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--text3);
      margin-bottom: 8px;
    }
    .stat-value {
      font-size: 14px;
      font-weight: 800;
      line-height: 1.25;
    }
    .chip-row {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      padding: 18px 0 0;
    }
    .nav-chip {
      display: inline-flex;
      align-items: center;
      padding: 8px 12px;
      border-radius: 999px;
      border: 1px solid var(--border);
      background: rgba(255,255,255,0.03);
      color: var(--text2);
      font-size: 12px;
    }
    .content {
      display: grid;
      gap: 16px;
      margin-top: 12px;
    }
    .panel {
      padding: 20px;
    }
    .section-head {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
      margin-bottom: 14px;
      flex-wrap: wrap;
    }
    .section-kicker {
      display: inline-block;
      color: ${tier === "pro" ? "var(--gold)" : "var(--emerald)"};
      font-family: var(--font-mono);
      font-size: 10px;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      margin-bottom: 8px;
    }
    h2 {
      margin: 0;
      font-size: clamp(21px, 4vw, 28px);
      letter-spacing: -0.04em;
      line-height: 1.08;
    }
    .card-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;
    }
    .info-card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      padding: 15px;
      min-height: 148px;
    }
    .info-card-locked {
      background: linear-gradient(180deg, var(--card), rgba(220, 177, 91, 0.08));
      border-color: rgba(220, 177, 91, 0.24);
    }
    .card-top {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 10px;
      margin-bottom: 8px;
    }
    .card-top h3,
    .step-row h3,
    .coming-card h3 {
      margin: 0;
      font-size: 15px;
      letter-spacing: -0.02em;
    }
    .status-pill {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 25px;
      padding: 5px 9px;
      border-radius: 999px;
      font-family: var(--font-mono);
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      white-space: nowrap;
    }
    .status-all {
      color: var(--emerald);
      background: var(--emerald-soft);
      border: 1px solid rgba(64, 217, 164, 0.26);
    }
    .status-pro {
      color: var(--gold);
      background: var(--gold-soft);
      border: 1px solid rgba(220, 177, 91, 0.3);
    }
    .status-split {
      color: var(--cyan);
      background: rgba(103, 198, 255, 0.12);
      border: 1px solid rgba(103, 198, 255, 0.28);
    }
    .status-native {
      color: #f3a95f;
      background: rgba(243, 169, 95, 0.12);
      border: 1px solid rgba(243, 169, 95, 0.28);
    }
    .steps-list {
      display: grid;
      gap: 10px;
    }
    .step-row {
      display: grid;
      grid-template-columns: 42px minmax(0, 1fr);
      gap: 12px;
      align-items: flex-start;
      padding: 12px 0;
      border-top: 1px solid rgba(255,255,255,0.06);
    }
    .step-row:first-child {
      border-top: none;
      padding-top: 0;
    }
    .step-index {
      width: 42px;
      height: 42px;
      border-radius: 14px;
      display: grid;
      place-items: center;
      background: ${tier === "pro" ? "var(--gold-soft)" : "var(--emerald-soft)"};
      border: 1px solid ${tier === "pro" ? "rgba(220, 177, 91, 0.28)" : "rgba(64, 217, 164, 0.24)"};
      color: ${tier === "pro" ? "var(--gold)" : "var(--emerald)"};
      font-weight: 800;
      font-family: var(--font-mono);
    }
    .matrix {
      overflow: hidden;
      border-radius: 18px;
      border: 1px solid var(--border);
      background: rgba(255,255,255,0.025);
    }
    .matrix-header,
    .matrix-row {
      display: grid;
      grid-template-columns: minmax(0, 1.8fr) minmax(110px, 0.8fr) minmax(130px, 0.9fr);
      gap: 10px;
      align-items: center;
      padding: 12px 14px;
    }
    .matrix-header {
      background: rgba(255,255,255,0.03);
      font-family: var(--font-mono);
      font-size: 11px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--text3);
    }
    .matrix-row {
      border-top: 1px solid rgba(255,255,255,0.05);
      font-size: 13px;
    }
    .matrix-label {
      display: flex;
      align-items: center;
      gap: 9px;
      font-weight: 700;
      color: var(--text);
    }
    .matrix-free { color: var(--text2); }
    .matrix-pro {
      color: var(--gold);
      font-weight: 700;
    }
    .price-strip {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 18px;
    }
    .price-strip span {
      padding: 8px 10px;
      border-radius: 999px;
      border: 1px solid rgba(220, 177, 91, 0.24);
      background: rgba(220, 177, 91, 0.08);
      color: #f0d094;
      font-size: 12px;
      font-family: var(--font-mono);
    }
    .faq-list {
      display: grid;
      gap: 10px;
    }
    .faq-item {
      border-radius: 16px;
      border: 1px solid var(--border);
      background: rgba(255,255,255,0.03);
      padding: 13px 15px;
    }
    .faq-item summary {
      cursor: pointer;
      font-weight: 700;
      color: var(--text);
      list-style: none;
    }
    .faq-item summary::-webkit-details-marker { display: none; }
    .faq-item p { margin-top: 10px; }
    .coming-grid {
      margin-top: 14px;
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;
    }
    .coming-card {
      border-radius: 18px;
      border: 1px solid var(--border);
      background: rgba(255,255,255,0.03);
      padding: 15px;
    }
    .coming-icon {
      width: 42px;
      height: 42px;
      border-radius: 14px;
      display: grid;
      place-items: center;
      margin-bottom: 12px;
      background: ${tier === "pro" ? "var(--gold-soft)" : "var(--emerald-soft)"};
      font-size: 20px;
    }
    .footer {
      text-align: center;
      padding: 18px 10px 0;
      color: var(--text3);
      font-size: 11px;
      line-height: 1.6;
    }
    .footer strong {
      color: var(--text2);
    }
    @media (max-width: 900px) {
      .hero-stats,
      .card-grid,
      .coming-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }
    @media (max-width: 640px) {
      .shell {
        width: min(100vw - 14px, 960px);
      }
      .hero-top,
      .panel {
        padding: 16px;
      }
      .hero-stats,
      .card-grid,
      .coming-grid,
      .matrix-header,
      .matrix-row {
        grid-template-columns: 1fr;
      }
      .matrix-header {
        gap: 4px;
      }
      .matrix-row {
        gap: 6px;
      }
      .matrix-free::before,
      .matrix-pro::before {
        display: inline-block;
        margin-right: 8px;
        font-family: var(--font-mono);
        font-size: 10px;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--text3);
      }
      .matrix-free::before { content: "Free"; }
      .matrix-pro::before { content: "Pro"; }
    }
  </style>
</head>
<body>
  <div class="shell">
    <header class="hero">
      <div class="hero-panel">
        <div class="hero-top">
          <div class="eyebrow-row">
            <span class="eyebrow">${escapeHtml(page.eyebrow)}</span>
            <span class="eyebrow-sub">${escapeHtml(plan.badge)} · ${escapeHtml(plan.label)}</span>
          </div>
          <div class="hero-copy">
            <h1>${escapeHtml(plan.heroTitle)}</h1>
            <p>${escapeHtml(plan.heroBody)}</p>
            <p>${escapeHtml(page.lead)}</p>
          </div>
          <div class="hero-actions">
            ${tier === "free" ? `<a class="ghost-button" href="#workflow">How to use it each week</a>` : `<a class="ghost-button" href="#workflow">Best Pro workflow</a>`}
            ${page.secondaryCta ? `<button class="cta-button" type="button" data-upgrade="true">See what Pro adds</button>` : `<a class="ghost-button" href="#matrix">Plan differences</a>`}
          </div>
        </div>
        <div class="hero-stats">
          ${renderStat("Audit access", plan.audits)}
          ${renderStat("AskAI", plan.chats)}
          ${renderStat("AI models", plan.models)}
          ${renderStat("Plaid", plan.plaid)}
          ${renderStat("History", plan.history)}
        </div>
      </div>
      <nav class="chip-row" aria-label="Guide sections">
        <a class="nav-chip" href="#tabs">Tabs</a>
        <a class="nav-chip" href="#workflow">Weekly use</a>
        <a class="nav-chip" href="#logic">What it looks at</a>
        <a class="nav-chip" href="#privacy">Privacy</a>
        <a class="nav-chip" href="#matrix">Plans</a>
        <a class="nav-chip" href="#faq">Questions</a>
      </nav>
    </header>

    <main class="content">
      <section class="panel" id="tabs">
        <div class="section-head">
          <div>
            <span class="section-kicker">Start Here</span>
            <h2>What each tab does</h2>
          </div>
        </div>
        <div class="card-grid">
          ${TAB_GUIDE_CARDS.map(card => renderCard(card, tier)).join("")}
        </div>
      </section>

      <section class="panel" id="workflow">
        <div class="section-head">
          <div>
            <span class="section-kicker">Weekly Rhythm</span>
            <h2>How to use the app each week</h2>
          </div>
        </div>
        <div class="steps-list">
          ${WORKFLOW_STEPS.map(renderStep).join("")}
        </div>
      </section>

      <section class="panel" id="logic">
        <div class="section-head">
          <div>
            <span class="section-kicker">What Catalyst Watches</span>
            <h2>What the app pays attention to</h2>
          </div>
        </div>
        <div class="card-grid">
          ${FINANCE_LOGIC_CARDS.map(card => renderCard({ ...card, status: "all" }, tier)).join("")}
        </div>
      </section>

      <section class="panel" id="privacy">
        <div class="section-head">
          <div>
            <span class="section-kicker">Privacy and Backup</span>
            <h2>The basics of where your data lives</h2>
          </div>
        </div>
        <div class="card-grid">
          ${PRIVACY_CARDS.map(card => renderCard(card, tier)).join("")}
        </div>
      </section>

      <section class="panel" id="matrix">
        <div class="section-head">
          <div>
            <span class="section-kicker">Plans</span>
            <h2>What Free and Pro change</h2>
          </div>
          <div class="price-strip">
            <span>${escapeHtml(PRICING_FACTS.monthly)}</span>
            <span>${escapeHtml(PRICING_FACTS.yearly)}</span>
            <span>${escapeHtml(PRICING_FACTS.yearlySavings)}</span>
          </div>
        </div>
        <div class="matrix">
          <div class="matrix-header">
            <div>Feature</div>
            <div>Free</div>
            <div>Pro</div>
          </div>
          ${PAYWALL_FEATURES.map(renderMatrixRow).join("")}
        </div>
        <p style="margin-top:16px;">Free is meant to be genuinely useful. Pro mainly adds more room, deeper AI, broader sync, and faster cleanup tools.</p>
      </section>

      ${renderTierSpecificSection(tier)}

      <section class="panel" id="faq">
        <div class="section-head">
          <div>
            <span class="section-kicker">Common Questions</span>
            <h2>Quick answers before you move on</h2>
          </div>
        </div>
        <div class="faq-list">
          ${COMMON_QUESTIONS.map(renderFaq).join("")}
          ${tier === "free" ? renderFaq({
            question: "What am I upgrading from and to?",
            answer: `You currently have ${PLAN_FACTS.free.audits}, ${PLAN_FACTS.free.chats}, ${PLAN_FACTS.free.plaid}, and ${PLAN_FACTS.free.history}. Pro changes that to ${oppositePlan.audits}, ${oppositePlan.chats}, ${oppositePlan.plaid}, and ${oppositePlan.history}.`,
          }) : ""}
        </div>
      </section>
    </main>

    <footer class="footer">
      <p><strong>Catalyst Cash provides educational analysis only.</strong> It is not tax, legal, investment, or professional financial advice. Confirm major decisions with a qualified advisor when the stakes justify it.</p>
      <p>Guide facts are aligned to the current app tier limits, pricing, and gating states.</p>
    </footer>
  </div>
  <script>
    document.querySelectorAll("[data-upgrade='true']").forEach(function (button) {
      button.addEventListener("click", function () {
        if (window.parent) {
          window.parent.postMessage({ type: "OPEN_UPGRADE" }, "*");
        }
      });
    });
  </script>
</body>
</html>`;
}
