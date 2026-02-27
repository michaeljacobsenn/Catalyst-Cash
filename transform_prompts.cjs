const fs = require('fs');

try {
    let content = fs.readFileSync('src/modules/prompts.js', 'utf8');

    // Helper to safely wrap a regex match in a template conditional
    const wrapSection = (regex, condition) => {
        content = content.replace(regex, (match, p1) => {
            // p1 is the unwrapped section text.
            // We don't need to escape backticks that are inside ${} blocks, but we shouldn't have any unescaped backticks outside of them.
            // There shouldn't be any in these sections. Let's just wrap it.
            return `\${${condition} ? \`\n${p1}\n\` : ''}\n`;
        });
    };

    wrapSection(/(========================\nJ\) STRATEGIC SINKING FUNDS.*?LIVE APP DATA\.)\n/s, 'goalsData');
    wrapSection(/(========================\nK\) TAX SETTLEMENT ESCROW.*?escrowed tax\/refund logic])\n/s, 'config?.isContractor');
    wrapSection(/(========================\nL\) CREDIT & DEBT PORTFOLIO.*?during a run\.)\n/s, '(cardData !== "  - (No cards mapped in UI)" || debtData)');
    wrapSection(/(========================\nH\) SUBSCRIPTION STACK[\s\S]*?(?====))/s, '(renewalData !== "  - (No renewals mapped in UI)")');
    wrapSection(/(========================\nF\) SUBS CARD \+ BONUS CHASE[\s\S]*?(?====))/s, '(renewalData !== "  - (No renewals mapped in UI)")');

    // Section S & T
    const stRegex = /(========================\nS\) INVESTMENTS & CRYPTO[\s\S]*?creates any hard-deadline shortfall\.)\n/s;
    content = content.replace(stRegex, (match, p1) => {
        // Wrap the S & T section text inside a condition
        // Wait, let's fix the inner backticks in Section S if they were escaped but since we are just moving the exact text into a \` ... \` it should work identically to the outer \` ... \`
        return `\${(config?.trackRoth || config?.track401k || config?.brokerageAccount || config?.crypto || config?.enableHoldings) ? \`\n${p1}\n\` : ''}\n`;
    });

    // Inject elite framing
    const headerRegex = /(========================\nFINANCIAL AUDIT INSTRUCTIONS v1\n========================\n)/;
    const eliteFraming = `========================
ROLE: ELITE FINANCIAL ADVISOR & DEBT PAYOFF SPECIALIST
========================
You are acting as a top 0.00000001% financial logic and freedom specialist, an elite debt payoff expert, and a safe but optimized investment specialist. You provide unparalleled financial audits and actionable advice without hesitation, prioritizing mathematical correctness, user experience, and structural scaling above all else.
`;
    content = content.replace(headerRegex, `$1${eliteFraming}`);

    fs.writeFileSync('src/modules/prompts.js', content);
    console.log('Successfully transformed prompts.js');
} catch (e) {
    console.error(e);
}
