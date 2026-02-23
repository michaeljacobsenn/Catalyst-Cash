// ═══════════════════════════════════════════════════════════════
// US BANK ACCOUNT CATALOG — Catalyst Cash
// Comprehensive list of US checking & savings products.
// Mirrors the issuerCards.js pattern for credit cards.
// ═══════════════════════════════════════════════════════════════

export const BANK_CATALOG = {
    lastUpdated: "2026-02-25",
    banks: {
        // ─── Big 4 ────────────────────────────────────────────────
        "Chase": {
            checking: [
                "Chase Total Checking",
                "Chase Secure Banking",
                "Chase Premier Plus Checking",
                "Chase Sapphire Checking",
                "Chase College Checking",
                "Chase High School Checking",
                "Chase Private Client Checking",
            ],
            savings: [
                "Chase Savings",
                "Chase Premier Savings",
                "Chase Private Client Savings",
            ],
        },
        "Bank of America": {
            checking: [
                "Bank of America Advantage SafePass Banking",
                "Bank of America Advantage Plus Banking",
                "Bank of America Advantage Relationship Banking",
                "Bank of America Advantage Banking",
            ],
            savings: [
                "Bank of America Advantage Savings",
                "Bank of America Rewards Money Market Savings",
            ],
        },
        "Wells Fargo": {
            checking: [
                "Wells Fargo Everyday Checking",
                "Wells Fargo Prime Checking",
                "Wells Fargo Premier Checking",
                "Wells Fargo Preferred Checking",
                "Wells Fargo Clear Access Banking",
                "Wells Fargo Simple Business Checking",
            ],
            savings: [
                "Wells Fargo Way2Save Savings",
                "Wells Fargo Platinum Savings",
            ],
        },
        "Citibank": {
            checking: [
                "Citi Basic Banking",
                "Citi Access Account",
                "Citi Custom Cash Checking",
                "Citi Priority Account",
                "Citi Wealth Account",
                "Citigold Account",
                "Citigold Private Client",
            ],
            savings: [
                "Citi Savings",
                "Citi Accelerate Savings",
            ],
        },

        // ─── Major Regional / National ────────────────────────────
        "Capital One": {
            checking: [
                "Capital One 360 Checking",
                "MONEY Teen Checking",
                "Kids Savings Account",
            ],
            savings: [
                "Capital One 360 Performance Savings",
                "Capital One 360 CDs",
            ],
        },
        "US Bank": {
            checking: [
                "U.S. Bank Smartly Checking",
                "U.S. Bank Easy Checking",
                "U.S. Bank Safe Debit Account",
                "U.S. Bank Gold Checking",
                "U.S. Bank Platinum Checking",
            ],
            savings: [
                "U.S. Bank Standard Savings",
                "U.S. Bank Elite Money Market Savings",
            ],
        },
        "PNC": {
            checking: [
                "PNC Virtual Wallet",
                "PNC Virtual Wallet with Performance Spend",
                "PNC Virtual Wallet with Performance Select",
                "PNC Foundation Checking",
                "PNC Standard Checking",
            ],
            savings: [
                "PNC Standard Savings",
                "PNC High Yield Savings",
            ],
        },
        "Truist": {
            checking: [
                "Truist One Checking",
                "Truist Bright Checking",
                "Truist Confidence Account",
                "Truist Wealth Checking",
            ],
            savings: [
                "Truist One Savings",
                "Truist Confidence Savings",
            ],
        },
        "TD Bank": {
            checking: [
                "TD Beyond Checking",
                "TD Convenience Checking",
                "TD Simple Checking",
                "TD 60 Plus Checking",
                "TD Student Checking",
            ],
            savings: [
                "TD Simple Savings",
                "TD Beyond Savings",
            ],
        },
        "Citizens": {
            checking: [
                "Citizens One Deposit Checking",
                "Citizens Quest Checking",
                "Citizens Student Checking",
            ],
            savings: [
                "Citizens One Deposit Savings",
                "Citizens Quest Savings",
                "Citizens Online Savings",
            ],
        },
        "Fifth Third Bank": {
            checking: [
                "Fifth Third Momentum Checking",
                "Fifth Third Enhanced Checking",
                "Fifth Third Preferred Checking",
                "Fifth Third Express Banking",
            ],
            savings: [
                "Fifth Third Momentum Savings",
                "Fifth Third Relationship Savings",
            ],
        },
        "Regions": {
            checking: [
                "Regions LifeGreen Checking",
                "Regions Prestige Checking",
                "Regions Foundations Checking",
                "Regions 62+ LifeGreen Checking",
                "Regions Student Checking",
            ],
            savings: [
                "Regions LifeGreen Savings",
                "Regions Premium Savings",
                "Regions Savings",
            ],
        },
        "M&T Bank": {
            checking: [
                "M&T EZChoice Checking",
                "M&T MyChoice Premium Checking",
                "M&T MyChoice Plus Checking",
                "M&T MyChoice Money Market",
            ],
            savings: [
                "M&T Starter Savings",
                "M&T MyPay Savings",
                "M&T Relationship Savings",
            ],
        },
        "KeyBank": {
            checking: [
                "KeyBank Hassle-Free Account",
                "Key Smart Checking",
                "Key Advantage Checking",
                "Key Privilege Checking",
                "Key Private Bank Checking",
            ],
            savings: [
                "Key Active Saver",
                "Key Advantage Money Market Savings",
            ],
        },
        "Huntington": {
            checking: [
                "Huntington Asterisk-Free Checking",
                "Huntington Perks Checking",
                "Huntington Platinum Perks Checking",
                "Huntington Private Client Checking",
                "Huntington 25 Checking",
            ],
            savings: [
                "Huntington Savings",
                "Huntington Premier Savings",
                "Huntington Money Market Account",
                "Huntington Relationship Money Market",
            ],
        },
        "BMO": {
            checking: [
                "BMO Smart Advantage Checking",
                "BMO Smart Money Checking",
                "BMO Relationship Checking",
                "BMO Premier Checking",
            ],
            savings: [
                "BMO Savings",
                "BMO Alto Online Savings",
            ],
        },

        // ─── Online Banks / Neobanks ──────────────────────────────
        "Ally Bank": {
            checking: [
                "Ally Interest Checking",
                "Ally Spending Account",
            ],
            savings: [
                "Ally Online Savings",
                "Ally Money Market Account",
                "Ally No Penalty CD",
                "Ally Raise Your Rate CD",
                "Ally High Yield CD",
            ],
        },
        "Marcus (Goldman Sachs)": {
            checking: [],
            savings: [
                "Marcus Online Savings Account",
                "Marcus High-Yield CD",
                "Marcus No-Penalty CD",
            ],
        },
        "Discover Bank": {
            checking: [
                "Discover Cashback Debit",
            ],
            savings: [
                "Discover Online Savings",
                "Discover Money Market Account",
                "Discover CDs",
            ],
        },
        "SoFi": {
            checking: [
                "SoFi Checking and Savings",
            ],
            savings: [
                "SoFi Savings (Vaults)",
            ],
        },
        "Wealthfront": {
            checking: [],
            savings: [
                "Wealthfront Cash Account",
            ],
        },
        "Betterment": {
            checking: [
                "Betterment Checking",
            ],
            savings: [
                "Betterment Cash Reserve",
            ],
        },
        "Chime": {
            checking: [
                "Chime Checking Account",
            ],
            savings: [
                "Chime Savings Account",
                "Chime Credit Builder",
            ],
        },
        "Varo": {
            checking: [
                "Varo Bank Account",
            ],
            savings: [
                "Varo Savings Account",
            ],
        },
        "Current": {
            checking: [
                "Current Personal Account",
                "Current Teen Account",
            ],
            savings: [
                "Current Savings Pods",
            ],
        },
        "Axos Bank": {
            checking: [
                "Axos Rewards Checking",
                "Axos Essential Checking",
                "Axos CashBack Checking",
                "Axos Golden Checking",
                "Axos First Checking",
            ],
            savings: [
                "Axos High Yield Savings",
                "Axos High Yield Money Market",
            ],
        },

        // ─── High-Yield Savings Specialists ───────────────────────
        "American Express National Bank": {
            checking: [],
            savings: [
                "Amex High Yield Savings",
                "Amex CDs",
            ],
        },
        "Bread Financial": {
            checking: [],
            savings: [
                "Bread Savings",
                "Bread CDs",
            ],
        },
        "CIT Bank": {
            checking: [],
            savings: [
                "CIT Bank Platinum Savings",
                "CIT Bank Savings Connect",
                "CIT Bank Money Market",
                "CIT Bank No-Penalty CD",
                "CIT Bank Term CDs",
            ],
        },
        "Bask Bank": {
            checking: [],
            savings: [
                "Bask Interest Savings",
                "Bask Mileage Savings",
            ],
        },
        "UFB Direct": {
            checking: [],
            savings: [
                "UFB Secure Savings",
                "UFB Portfolio Savings",
                "UFB Best Money Market",
            ],
        },
        "Popular Direct": {
            checking: [],
            savings: [
                "Popular Direct High-Rise Savings",
                "Popular Direct CDs",
            ],
        },
        "TAB Bank": {
            checking: [
                "TAB Kasasa Cash Checking",
            ],
            savings: [
                "TAB High Yield Savings",
                "TAB Money Market",
            ],
        },
        "Barclays": {
            checking: [],
            savings: [
                "Barclays Online Savings",
                "Barclays Tiered Savings",
                "Barclays CDs",
                "Barclays No-Penalty CD",
            ],
        },
        "Synchrony Bank": {
            checking: [],
            savings: [
                "Synchrony High Yield Savings",
                "Synchrony Money Market",
                "Synchrony CDs",
                "Synchrony No-Penalty CD",
                "Synchrony IRA Savings",
            ],
        },

        // ─── Credit Unions ─────────────────────────────────────────
        "Navy Federal": {
            checking: [
                "Navy Federal Free Active Duty Checking",
                "Navy Federal Free Easy Checking",
                "Navy Federal Flagship Checking",
                "Navy Federal Campus Checking",
            ],
            savings: [
                "Navy Federal Share Savings",
                "Navy Federal Money Market Savings",
                "Navy Federal Jumbo Money Market Savings",
                "Navy Federal Share Certificate",
            ],
        },
        "PenFed": {
            checking: [
                "PenFed Access America Checking",
            ],
            savings: [
                "PenFed Premium Online Savings",
                "PenFed Money Market",
                "PenFed Share Certificates",
            ],
        },
        "Alliant Credit Union": {
            checking: [
                "Alliant High-Rate Checking",
                "Alliant Free Checking",
                "Alliant Teen Checking",
            ],
            savings: [
                "Alliant High-Rate Savings",
                "Alliant Supplemental Savings",
                "Alliant Kids Savings",
                "Alliant Share Certificates",
            ],
        },
        "BECU": {
            checking: [
                "BECU Member Advantage Checking",
                "BECU Money Market",
                "BECU Early Saver Checking",
            ],
            savings: [
                "BECU Member Advantage Savings",
                "BECU Member Savings",
            ],
        },
        "SchoolsFirst FCU": {
            checking: [
                "SchoolsFirst Free Checking",
                "SchoolsFirst Interest Checking",
            ],
            savings: [
                "SchoolsFirst Savings",
                "SchoolsFirst Money Market",
                "SchoolsFirst Share Certificates",
            ],
        },
        "State Employees' CU": {
            checking: [
                "SECU Share Draft Checking",
            ],
            savings: [
                "SECU Share Savings",
                "SECU Money Market",
                "SECU Share Term Certificates",
            ],
        },
        "First Tech FCU": {
            checking: [
                "First Tech Rewards Checking",
                "First Tech Simple Checking",
                "First Tech Dividend Checking",
            ],
            savings: [
                "First Tech Regular Savings",
                "First Tech High Yield Savings",
                "First Tech Money Market",
            ],
        },
        "Pentagon FCU": {
            checking: [
                "PenFed Free Checking (Pentagon Federal)",
            ],
            savings: [
                "PenFed Regular Savings",
            ],
        },

        // ─── Brokerage-Linked ──────────────────────────────────────
        "Fidelity": {
            checking: [
                "Fidelity Cash Management Account",
            ],
            savings: [
                "Fidelity Government Money Market Fund",
            ],
        },
        "Charles Schwab": {
            checking: [
                "Schwab Bank Investor Checking",
            ],
            savings: [
                "Schwab Bank Investor Savings",
                "Schwab Value Advantage Money Fund",
            ],
        },
        "E*TRADE (Morgan Stanley)": {
            checking: [
                "E*TRADE Max-Rate Checking",
            ],
            savings: [
                "E*TRADE Premium Savings",
                "Morgan Stanley CashPlus",
            ],
        },
        "Vanguard": {
            checking: [
                "Vanguard Cash Plus Account",
            ],
            savings: [
                "Vanguard Federal Money Market Fund",
            ],
        },
        "Interactive Brokers": {
            checking: [],
            savings: [
                "IBKR Interest on Cash Balances",
            ],
        },

        // ─── Other ─────────────────────────────────────────────────
        "USAA": {
            checking: [
                "USAA Classic Checking",
                "USAA Cashback Rewards Checking",
                "USAA Youth Spending Account",
            ],
            savings: [
                "USAA Savings",
                "USAA Performance First Savings",
            ],
        },
        "HSBC": {
            checking: [
                "HSBC Premier Checking",
                "HSBC Everyday Checking",
            ],
            savings: [
                "HSBC Direct Savings",
            ],
        },
        "FNBO": {
            checking: [
                "FNBO Online Checking",
            ],
            savings: [
                "FNBO Online Savings",
            ],
        },
        "EverBank": {
            checking: [
                "EverBank Yield Pledge Checking",
            ],
            savings: [
                "EverBank Performance Savings",
                "EverBank Yield Pledge Money Market",
            ],
        },
        "LendingClub": {
            checking: [
                "LendingClub Rewards Checking",
            ],
            savings: [
                "LendingClub High-Yield Savings",
                "LendingClub CDs",
            ],
        },
        "Laurel Road": {
            checking: [
                "Laurel Road Linked Checking",
            ],
            savings: [
                "Laurel Road High Yield Savings",
            ],
        },
        "nbkc Bank": {
            checking: [
                "nbkc Everything Account",
            ],
            savings: [
                "nbkc Personal Savings",
            ],
        },
        "Dollar Bank": {
            checking: [
                "Dollar Bank Free Checking",
                "Dollar Bank MyRate Checking",
            ],
            savings: [
                "Dollar Bank Statement Savings",
                "Dollar Bank Money Market Savings",
            ],
        },
        "Connexus CU": {
            checking: [
                "Connexus Xtraordinary Checking",
            ],
            savings: [
                "Connexus High Yield Savings",
                "Connexus Money Market",
            ],
        },
        "Other": {
            checking: ["Other Checking Account"],
            savings: ["Other Savings Account", "Other Money Market Account"],
        },
    },
};

/** All bank names, sorted alphabetically (for dropdown) */
export function getBankNames() {
    return Object.keys(BANK_CATALOG.banks).sort((a, b) => {
        if (a === "Other") return 1;
        if (b === "Other") return -1;
        return a.localeCompare(b);
    });
}

/** Get checking/savings product list for a bank */
export function getBankProducts(bankName) {
    const bank = BANK_CATALOG.banks[bankName];
    if (!bank) return { checking: [], savings: [] };
    return {
        checking: bank.checking || [],
        savings: bank.savings || [],
    };
}
