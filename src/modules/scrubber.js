export function buildScrubber(cards = [], renewals = [], config = {}, form = {}) {
    const map = new Map();
    let cIdx = 1, rIdx = 1, dIdx = 1, bIdx = 1, iIdx = 1;

    // Helper to safely add mappings (longer names first when sorting later)
    const addMap = (realName, prefix, getIdx) => {
        if (!realName || typeof realName !== 'string') return;
        const name = realName.trim();
        if (name.length < 3) return; // Don't scrub very short acronyms to avoid false positives
        if (!map.has(name)) {
            map.set(name, `${prefix} ${getIdx()}`);
        }
    };

    // Credit Cards
    cards.forEach(c => {
        addMap(c.name, "Credit Card", () => cIdx++);
        addMap(c.institution, "Bank", () => bIdx++);
    });

    // Subscriptions & Renewals
    renewals.forEach(r => {
        addMap(r.name, "Subscription", () => rIdx++);
        if (r.chargedTo && r.chargedTo !== 'checking') {
            addMap(r.chargedTo, "Account", () => bIdx++);
        }
    });

    // Non-card debts
    (config.nonCardDebts || []).forEach(d => {
        addMap(d.name, "Loan", () => dIdx++);
    });

    // Income Sources
    (config.incomeSources || []).forEach(inc => {
        addMap(inc.name, "Income Source", () => iIdx++);
    });

    // Budget Categories
    (config.budgetCategories || []).forEach(cat => {
        addMap(cat.name, "Category", () => iIdx++);
    });

    // Form Debts (ones not in config)
    (form.debts || []).forEach(d => {
        addMap(d.name, "Debt", () => dIdx++);
    });

    // Sort by length descending to replace the longest matched strings first
    // (e.g. "Chase Sapphire Reserve" before "Chase")
    const scrubList = Array.from(map.entries()).sort((a, b) => b[0].length - a[0].length);

    // Unscrub map needs to replace the exact generic token with the real name
    const unscrubList = scrubList.map(([real, fake]) => [fake, real]).sort((a, b) => b[0].length - a[0].length);

    // Escape regex characters
    const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Build RegExp objects once per scrubber instance for performance
    const scrubRegexes = scrubList.map(([real, fake]) => ({
        // Use word boundaries \b to prevent replacing substrings (e.g. "art" inside "cart")
        regex: new RegExp(`\\b${escapeRegex(real)}\\b`, 'gi'), // Case insensitive for scrubbing
        fake
    }));

    const unscrubRegexes = unscrubList.map(([fake, real]) => ({
        regex: new RegExp(escapeRegex(fake), 'g'), // Case sensitive for unscrubbing our own injected tokens
        real
    }));

    return {
        scrub: (text) => {
            if (!text) return text;
            let result = text;
            for (const { regex, fake } of scrubRegexes) {
                result = result.replace(regex, fake);
            }
            return result;
        },
        unscrub: (text) => {
            if (!text) return text;
            let result = text;
            for (const { regex, real } of unscrubRegexes) {
                result = result.replace(regex, real);
            }
            return result;
        },
        hasMappings: scrubList.length > 0
    };
}
