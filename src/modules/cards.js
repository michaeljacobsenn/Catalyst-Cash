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
