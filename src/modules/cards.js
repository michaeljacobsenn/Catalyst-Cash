export function ensureCardIds(cards = []) {
  let changed = false;
  const updated = cards.map((c, idx) => {
    if (c && c.id) return c;
    const id = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `card_${Date.now()}_${idx}`;
    changed = true;
    return { ...c, id };
  });
  return { cards: updated, changed };
}

export function getCardLabel(cards, card) {
  if (!card) return "";
  const name = card.name || "";
  const nick = (card.nickname || "").trim();
  const base = nick ? `${name} · ${nick}` : name;
  const dupes = cards.filter(c => c.institution === card.institution && c.name === card.name);
  if (dupes.length <= 1) return base;
  const index = dupes.findIndex(c => c.id === card.id);
  const n = index >= 0 ? index + 1 : 1;
  return `${base} #${n}`;
}

export function resolveCardLabel(cards, cardId, fallbackName = "") {
  const card = cards.find(c => c.id === cardId);
  return card ? getCardLabel(cards, card) : fallbackName;
}

/** Compact card label for tight spaces (e.g., InputForm dropdowns) */
export function getShortCardLabel(cards, card) {
  if (!card) return "";
  let name = card.name || "";
  // Strip verbose suffixes
  name = name.replace(/ American Express Card$/i, "")
    .replace(/ from American Express$/i, "")
    .replace(/ Visa Signature Card$/i, "")
    .replace(/ World Elite Mastercard$/i, "")
    .replace(/ Visa Card$/i, "")
    .replace(/ Mastercard$/i, "")
    .replace(/ credit card$/i, "")
    .replace(/ Card$/i, "")
    .trim();
  // Abbreviate "Business" → "Biz" for business cards
  if (name.length > 28) name = name.replace(/\bBusiness\b/g, "Biz");
  const nick = (card.nickname || "").trim();
  const base = nick ? `${name} · ${nick}` : name;
  const dupes = cards.filter(c => c.institution === card.institution && c.name === card.name);
  if (dupes.length <= 1) return base;
  const index = dupes.findIndex(c => c.id === card.id);
  return `${base} #${index >= 0 ? index + 1 : 1}`;
}
