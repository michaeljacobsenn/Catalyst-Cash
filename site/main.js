function initNav() {
  const btn = document.getElementById("hamburger-btn");
  const nav = document.getElementById("nav-links");
  const overlay = document.getElementById("mobile-overlay");
  const body = document.body;

  if (!btn || !nav || !body) return;

  function setOpen(open) {
    nav.classList.toggle("open", open);
    btn.classList.toggle("active", open);
    btn.setAttribute("aria-expanded", String(open));
    if (overlay) overlay.classList.toggle("active", open);
    body.classList.toggle("nav-open", open);
  }

  function toggle() {
    setOpen(!nav.classList.contains("open"));
  }

  function close() {
    setOpen(false);
  }

  btn.addEventListener("click", toggle);
  if (overlay) overlay.addEventListener("click", close);

  nav.querySelectorAll("a").forEach(link => {
    link.addEventListener("click", close);
  });

  window.addEventListener("keydown", event => {
    if (event.key === "Escape") close();
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 1024) close();
  });
}

function initFaqSearch() {
  const root = document.querySelector("[data-faq-root]");
  if (!root) return;

  const input = root.querySelector("[data-faq-input]");
  const clear = root.querySelector("[data-faq-clear]");
  const resultLabel = root.querySelector("[data-faq-results]");
  const emptyState = root.querySelector("[data-faq-empty]");
  const chips = Array.from(root.querySelectorAll("[data-faq-query]"));

  if (!input || !resultLabel || !emptyState) return;

  const items = Array.from(root.querySelectorAll("[data-faq-item]")).map(item => {
    const question = item.querySelector(".faq-question")?.textContent?.trim() ?? "";
    const answer = item.querySelector(".faq-answer")?.textContent?.trim() ?? "";
    const keywords = item.dataset.keywords ?? "";
    const category = item.dataset.category ?? "";
    const searchable = normalizeFaqText(`${question} ${answer} ${keywords} ${category}`);

    return {
      item,
      question: normalizeFaqText(question),
      searchable,
      tokens: buildFaqTokenSet(searchable),
      section: item.closest("[data-faq-section]"),
    };
  });

  const sections = Array.from(root.querySelectorAll("[data-faq-section]"));
  const initialQuery = new URLSearchParams(window.location.search).get("q") ?? "";

  function updateUrl(rawQuery) {
    const url = new URL(window.location.href);
    const trimmed = rawQuery.trim();
    if (trimmed) {
      url.searchParams.set("q", trimmed);
    } else {
      url.searchParams.delete("q");
    }
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }

  function render(rawQuery, shouldUpdateUrl = false) {
    const trimmed = rawQuery.trim();
    const normalizedQuery = normalizeFaqText(trimmed);
    const queryTokens = buildFaqTokenSet(normalizedQuery);
    const rawQueryTokens = tokenizeFaqText(normalizedQuery);
    const minScore = rawQueryTokens.length > 1 ? 40 : 20;
    let visibleCount = 0;

    items.forEach(entry => {
      const score = scoreFaqEntry(entry, normalizedQuery, queryTokens, rawQueryTokens);
      const visible = !normalizedQuery || score >= minScore;
      entry.item.hidden = !visible;
      entry.item.style.order = visible ? String(Math.max(0, 200 - score)) : "999";
      entry.item.open = Boolean(normalizedQuery && score >= 42);
      if (visible) visibleCount += 1;
    });

    sections.forEach(section => {
      const hasVisibleItems = Array.from(section.querySelectorAll("[data-faq-item]")).some(item => !item.hidden);
      section.hidden = !hasVisibleItems;
    });

    if (!normalizedQuery) {
      resultLabel.textContent = `Browse ${items.length} answers across ${sections.length} categories.`;
      emptyState.hidden = true;
    } else if (visibleCount > 0) {
      const answerLabel = visibleCount === 1 ? "answer" : "answers";
      resultLabel.textContent = `Showing ${visibleCount} ${answerLabel} for "${trimmed}".`;
      emptyState.hidden = true;
    } else {
      resultLabel.textContent = `No exact match needed. Try "bank", "switch", "backup", or "Pro".`;
      emptyState.hidden = false;
    }

    if (clear) {
      clear.hidden = !trimmed;
    }

    chips.forEach(chip => {
      const chipQuery = normalizeFaqText(chip.dataset.faqQuery ?? "");
      chip.classList.toggle("active", Boolean(normalizedQuery && chipQuery === normalizedQuery));
    });

    if (shouldUpdateUrl) {
      updateUrl(trimmed);
    }
  }

  chips.forEach(chip => {
    chip.addEventListener("click", () => {
      const query = chip.dataset.faqQuery ?? "";
      input.value = query;
      render(query, true);
      input.focus();
    });
  });

  input.value = initialQuery;
  input.addEventListener("input", event => {
    const nextValue = event.currentTarget instanceof HTMLInputElement ? event.currentTarget.value : "";
    render(nextValue, true);
  });

  clear?.addEventListener("click", () => {
    input.value = "";
    render("", true);
    input.focus();
  });

  render(initialQuery, false);
}

function normalizeFaqText(value) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const FAQ_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "be",
  "can",
  "do",
  "does",
  "for",
  "from",
  "how",
  "i",
  "if",
  "is",
  "it",
  "my",
  "of",
  "on",
  "or",
  "the",
  "to",
  "what",
  "when",
  "why",
  "with",
  "your",
]);

const FAQ_ALIAS_MAP = {
  mint: ["migration", "switch", "credit", "karma"],
  credit: ["mint", "karma"],
  karma: ["mint", "credit"],
  switch: ["migration", "move", "replace", "mint", "monarch", "rocket", "ynab"],
  migration: ["switch", "move", "replace", "mint", "monarch", "rocket", "ynab"],
  move: ["migration", "switch", "replace"],
  replace: ["switch", "migration"],
  bank: ["institution", "plaid", "account", "accounts"],
  plaid: ["bank", "institution", "account", "sync"],
  sync: ["refresh", "update", "live", "stale"],
  refresh: ["sync", "update", "live"],
  update: ["sync", "refresh", "stale"],
  backup: ["restore", "recovery", "export"],
  restore: ["backup", "recovery"],
  recovery: ["backup", "restore"],
  history: ["ledger", "transactions", "archive", "import", "export"],
  ledger: ["history", "transactions", "export"],
  transactions: ["ledger", "history", "import", "export"],
  pro: ["pricing", "upgrade", "plan", "subscription", "premium"],
  pricing: ["pro", "plan", "subscription", "upgrade"],
  subscription: ["pricing", "plan", "pro"],
  askai: ["ai", "chat"],
  ai: ["askai", "chat"],
};

function stemFaqToken(token) {
  if (token.endsWith("ies") && token.length > 4) return `${token.slice(0, -3)}y`;
  if (token.endsWith("ing") && token.length > 5) return token.slice(0, -3);
  if (token.endsWith("ed") && token.length > 4) return token.slice(0, -2);
  if (token.endsWith("s") && token.length > 4) return token.slice(0, -1);
  return token;
}

function tokenizeFaqText(text) {
  const normalized = normalizeFaqText(text);
  const rawTokens = normalized.split(" ").filter(Boolean);
  const stemmedTokens = rawTokens.map(stemFaqToken).filter(Boolean);
  const filteredTokens = stemmedTokens.filter(token => !FAQ_STOP_WORDS.has(token));
  return filteredTokens.length ? filteredTokens : stemmedTokens;
}

function buildFaqTokenSet(text) {
  const tokens = new Set(tokenizeFaqText(text));

  Array.from(tokens).forEach(token => {
    const aliases = FAQ_ALIAS_MAP[token] ?? [];
    aliases.forEach(alias => tokens.add(alias));
  });

  return tokens;
}

function scoreFaqEntry(entry, normalizedQuery, queryTokens, rawQueryTokens) {
  if (!normalizedQuery) return 1;

  let score = 0;

  if (entry.searchable.includes(normalizedQuery)) score += 70;
  if (entry.question.includes(normalizedQuery)) score += 50;

  let directMatches = 0;

  rawQueryTokens.forEach(token => {
    if (entry.tokens.has(token)) {
      directMatches += 1;
    }
  });

  queryTokens.forEach(token => {
    if (entry.tokens.has(token)) {
      score += token.length >= 5 ? 5 : 3;
    }
  });

  score += directMatches * 18;

  if (rawQueryTokens.length > 1 && directMatches === rawQueryTokens.length) {
    score += 24;
  } else if (directMatches > 0) {
    score += 6;
  }

  return score;
}

(() => {
  initNav();
  initFaqSearch();
})();
