// src/modules/negotiation.js

/**
 * A curated list of merchants known to have retention departments and be open to negotiation.
 * These are mapped against user bills (case-insensitive substring match).
 */
export const NEGOTIABLE_MERCHANTS = [
  // ═══════════════════════════════════════════════════════════
  // ISPs & Cable (Highest success rate — 70-90%)
  // ═══════════════════════════════════════════════════════════
  {
    merchant: "Comcast",
    aliases: ["Xfinity", "Comcast"],
    type: "ISP",
    tactic: "Under the 2026 FTC Click-to-Cancel rule, Xfinity must offer online cancellation. However, calling retention (say 'cancel service') yields $20-$40/mo discounts. Mention T-Mobile 5G Home or a local fiber provider. Ask for the 'new customer promotional rate' applied to your existing account. Target: 30-50% discount for 12 months.",
  },
  {
    merchant: "AT&T",
    aliases: ["AT&T", "ATT Internet", "U-verse", "ATT Fiber"],
    type: "ISP",
    tactic: "Call 800-288-2020 and say 'cancel service' to reach retention. Mention Google Fiber, T-Mobile Home Internet, or Starlink. AT&T's retention team can offer $20-$30/mo loyalty credits for 12 months. If on fiber, leverage that switching costs are low. Ask: 'What's the best rate you can offer to keep me as a customer?'",
  },
  {
    merchant: "Spectrum",
    aliases: ["Spectrum", "Charter Communications", "Time Warner Cable"],
    type: "ISP",
    tactic: "Spectrum's 2026 pricing is aggressive post-contract. Call retention and mention T-Mobile 5G Home Internet ($50/mo) or Starlink. Ask for the 'loyalty pricing' — typically $15-$25/mo off for 12 months. If they refuse, schedule cancellation for 30 days out — they'll call back with an offer within a week.",
  },
  {
    merchant: "Cox",
    aliases: ["Cox Communications", "Cox Internet"],
    type: "ISP",
    tactic: "Request the loyalty department. Research a local competitor's rate and ask Cox to match it. Cox retention frequently offers $10-$20/mo credits for 12 months.",
  },
  {
    merchant: "Optimum",
    aliases: ["Optimum", "Altice", "Suddenlink"],
    type: "ISP",
    tactic: "Use Optimum's online chat to request cancellation — the bot will route you to retention. Ask for their current introductory price applied to your account. Target: $20-$30/mo savings.",
  },
  {
    merchant: "Verizon Fios",
    aliases: ["Verizon Fios", "Fios Internet"],
    type: "ISP",
    tactic: "Check if you're month-to-month (most Fios plans are now). Ask about 'Mix & Match' pricing or current customer loyalty credits. Mention competitor fiber rates. Target: $10-$20/mo credit for 12 months.",
  },
  {
    merchant: "DirecTV",
    aliases: ["DirecTV", "Direct TV"],
    type: "Cable",
    tactic: "Say 'Cancel Service' at the voice prompt to reach retention. Ask for a 12-month promotional discount and free premium channels. DirecTV retention is aggressive — expect $30-$50/mo off for 6-12 months.",
  },
  {
    merchant: "Dish Network",
    aliases: ["Dish Network", "Dish"],
    type: "Cable",
    tactic: "State you're moving to YouTube TV or Hulu Live because the monthly cost is too high. Dish typically offers $20-$40/mo off for 6-12 months plus free premium channels to prevent cord-cutting.",
  },
  {
    merchant: "Starlink",
    aliases: ["Starlink", "SpaceX Internet"],
    type: "ISP",
    tactic: "Starlink doesn't negotiate pricing, but you can pause service for up to 6 months to avoid paying during low-usage periods. Check if a lower 'Standard' tier is available in your area vs. the 'Priority' plan.",
  },

  // ═══════════════════════════════════════════════════════════
  // Cellular (High success rate — 60-80%)
  // ═══════════════════════════════════════════════════════════
  {
    merchant: "Verizon Wireless",
    aliases: ["Verizon", "Verizon Wireless", "VZW"],
    type: "Cellular",
    tactic: "Call 800-922-0204 and ask for the loyalty department. Mention T-Mobile's buyout offers or switching to an MVNO like Visible ($25/mo on Verizon's own network). Ask about unadvertised loyalty discounts — Verizon commonly offers $10-$15/line/mo credits for 12-24 months.",
  },
  {
    merchant: "T-Mobile",
    aliases: ["T-Mobile", "Tmo", "Sprint"],
    type: "Cellular",
    tactic: "Message T-Force on Twitter/X (@TMobileHelp) — they have more authority than phone reps. Mention you're considering porting to Mint Mobile ($15/mo) or US Mobile. T-Mobile retention often adds bill credits or free line promotions.",
  },
  {
    merchant: "AT&T Wireless",
    aliases: ["AT&T Wireless", "ATT Wireless", "AT&T Mobility"],
    type: "Cellular",
    tactic: "Call 611 from your AT&T phone and say 'cancel service'. The retention team can offer $5-$15/line/mo loyalty credits. Mention Cricket ($30/mo on AT&T network) or T-Mobile's port-in deals.",
  },

  // ═══════════════════════════════════════════════════════════
  // Streaming (Medium success — retention offers are common)
  // ═══════════════════════════════════════════════════════════
  {
    merchant: "Netflix",
    aliases: ["Netflix"],
    type: "Streaming",
    tactic: "Netflix doesn't negotiate directly, but the 2026 cancel flow shows a retention offer 70% of the time. Start the cancellation at netflix.com/cancelplan. You'll typically see: (1) downgrade to ad-supported for $7.99/mo, or (2) a free month to reconsider. Complete the flow to see the offer — you can always resubscribe.",
  },
  {
    merchant: "Hulu",
    aliases: ["Hulu"],
    type: "Streaming",
    tactic: "Start the online cancellation flow at hulu.com/account. On the 'Are you sure?' screen, Hulu frequently offers a discounted rate ($2.99/mo for 3 months) or a free month. Always complete the full flow to see the retention offer — it appears on the final confirmation screen.",
  },
  {
    merchant: "Disney+",
    aliases: ["Disney+", "Disney Plus"],
    type: "Streaming",
    tactic: "Cancel via the app or disneyplus.com/account. Disney+ often offers a discounted rate ($4.99/mo for 3 months) on the cancellation screen. If you have the bundle (Disney+/Hulu/ESPN+), cancel the bundle and resubscribe to individual services at promotional rates.",
  },
  {
    merchant: "Max (HBO)",
    aliases: ["Max", "HBO Max", "HBO"],
    type: "Streaming",
    tactic: "Cancel via max.com/account. Max frequently offers a 50% discount for 2-3 months on the cancel screen. If no offer appears, cancel and wait 3-7 days — Max sends 'come back' emails with $4.99/mo promotional rates.",
  },
  {
    merchant: "Paramount+",
    aliases: ["Paramount+", "Paramount Plus"],
    type: "Streaming",
    tactic: "Cancel at paramountplus.com/account. Paramount+ often offers 50% off for 1-3 months during the cancel flow. Annual plans unlock better per-month pricing — check if switching from monthly to annual saves more than the retention offer.",
  },
  {
    merchant: "Peacock",
    aliases: ["Peacock"],
    type: "Streaming",
    tactic: "Cancel at peacocktv.com/account. Peacock frequently emails $1.99/mo 'come back' offers within 1-2 weeks of cancellation. Cancel and wait for the email — it's almost guaranteed.",
  },
  {
    merchant: "Apple TV+",
    aliases: ["Apple TV+", "Apple TV Plus"],
    type: "Streaming",
    tactic: "Apple TV+ is $9.99/mo but Apple frequently offers 3-month free trials with device purchases, student bundles, or Apple One bundle savings. Check if Apple One ($19.95/mo for 6 services) is cheaper than your individual subscriptions combined.",
  },
  {
    merchant: "YouTube TV",
    aliases: ["YouTube TV", "YTTV"],
    type: "Streaming",
    tactic: "Pause your membership for up to 6 months at tv.youtube.com/settings. YouTube TV sends a re-activation discount ($10-$15/mo off for 3 months) via email after 2-3 weeks of being paused. This works almost every time.",
  },
  {
    merchant: "Sling TV",
    aliases: ["Sling TV", "Sling"],
    type: "Streaming",
    tactic: "Cancel online at sling.com/account. Sling emails a 'come back' offer within 7 days — typically 50% off for the first month back. Some users report getting $10/mo off for 3 months.",
  },
  {
    merchant: "Spotify",
    aliases: ["Spotify", "Spotify Premium"],
    type: "Streaming",
    tactic: "Cancel at spotify.com/account. Spotify shows a retention offer on the cancel screen — usually 3 months at $10.99 instead of $13.99 (for Premium), or a free month. If you cancel fully, Spotify emails a $0.99/3-months 'come back' deal within 2-4 weeks.",
  },
  {
    merchant: "Apple Music",
    aliases: ["Apple Music"],
    type: "Streaming",
    tactic: "Apple Music doesn't negotiate directly, but check: (1) Student plan at $5.99/mo, (2) Apple One bundle savings, (3) Carrier deals — Verizon/T-Mobile sometimes include Apple Music free with certain plans. Cancel and wait for re-subscription offers.",
  },
  {
    merchant: "Amazon Prime",
    aliases: ["Amazon Prime"],
    type: "Streaming",
    tactic: "Go to amazon.com/prime and click 'End membership'. Amazon shows a multi-step retention flow: (1) offers to switch to monthly, (2) shows what you'll lose, (3) sometimes offers a discounted rate. Students get 50% off ($7.49/mo). Check if your employer or EBT card qualifies for Prime Access ($6.99/mo).",
  },
  {
    merchant: "Audible",
    aliases: ["Audible"],
    type: "Streaming",
    tactic: "Start cancellation at audible.com/account. Audible's retention is best-in-class — they offer: (1) 3 months at $7.95/mo (vs $14.95), (2) a free month, or (3) credit pause for up to 3 months while keeping your library. Always go through the full cancel flow.",
  },

  // ═══════════════════════════════════════════════════════════
  // Cloud & Software (Medium success)
  // ═══════════════════════════════════════════════════════════
  {
    merchant: "Adobe Creative Cloud",
    aliases: ["Adobe", "Adobe Creative Cloud", "Adobe CC"],
    type: "Software",
    tactic: "Call Adobe at 800-833-6687 and say 'cancel subscription'. Adobe retention offers 2-3 months free or a 40-60% discount for the remainder of your annual term. Key: if on an annual plan, canceling early incurs a 50% remaining-term fee — the retention discount avoids this. Ask for the 'Photography Plan' at $9.99/mo if you only need Photoshop + Lightroom.",
  },
  {
    merchant: "Microsoft 365",
    aliases: ["Microsoft 365", "Office 365", "M365"],
    type: "Software",
    tactic: "Cancel at account.microsoft.com. Microsoft occasionally offers a free month extension on the cancel screen. Check if your employer provides M365 licenses — many do. Family plan ($99.99/yr for 6 users) is often cheaper than 2+ individual plans.",
  },
  {
    merchant: "iCloud+",
    aliases: ["iCloud", "iCloud+", "Apple iCloud"],
    type: "Software",
    tactic: "iCloud doesn't negotiate pricing, but Apple One ($19.95/mo) bundles iCloud 50GB + Music + TV+ + Arcade + Fitness+. If you pay for 2+ Apple services separately, switching to Apple One often saves $5-$15/mo.",
  },
  {
    merchant: "Dropbox",
    aliases: ["Dropbox"],
    type: "Software",
    tactic: "Start cancellation at dropbox.com/account. Dropbox offers a 20-30% discount for annual billing during the cancel flow. Consider switching to iCloud+ (50GB for $0.99/mo) or Google One (100GB for $1.99/mo) if you only need basic cloud storage.",
  },

  // ═══════════════════════════════════════════════════════════
  // Meal Kits (Very high success — 80-95%)
  // ═══════════════════════════════════════════════════════════
  {
    merchant: "HelloFresh",
    aliases: ["HelloFresh", "Hello Fresh"],
    type: "Meal Kit",
    tactic: "Cancel via the app or hellofresh.com/my-account. HelloFresh's retention is aggressive — expect: (1) 50-60% off your next 2-4 boxes, (2) free premium meals added, or (3) a full skip for 8 weeks. If no good offer, cancel fully — they'll email a 65-75% off 'come back' deal within 1-2 weeks. This is nearly guaranteed.",
  },
  {
    merchant: "Blue Apron",
    aliases: ["Blue Apron"],
    type: "Meal Kit",
    tactic: "Cancel at blueapron.com/account. Blue Apron offers $30-$40 off your next order during the cancel flow. If you cancel anyway, expect a 'come back' email within 7-14 days with a heavy first-box discount.",
  },
  {
    merchant: "Factor",
    aliases: ["Factor", "Factor Meals", "Factor_"],
    type: "Meal Kit",
    tactic: "Factor (owned by HelloFresh) uses the same retention playbook. Cancel via the app — expect 50%+ off offers for 2-3 weeks. Cancel and wait for the re-engagement email for the deepest discounts.",
  },
  {
    merchant: "Home Chef",
    aliases: ["Home Chef"],
    type: "Meal Kit",
    tactic: "Cancel at homechef.com/account. Home Chef offers skip weeks (up to 5 consecutive) or a discount on next delivery. Cancel fully for a 'come back' offer within 2 weeks.",
  },

  // ═══════════════════════════════════════════════════════════
  // Fitness Apps & Gyms (Medium-High success — 60-80%)
  // ═══════════════════════════════════════════════════════════
  {
    merchant: "Planet Fitness",
    aliases: ["Planet Fitness", "PF"],
    type: "Gym",
    tactic: "In 2026, Planet Fitness still requires in-person or certified-letter cancellation in many states. Visit your home club and say you're canceling due to relocation or financial hardship. They often offer 1-3 months free or a rate freeze. Check if your state's consumer protection laws now require online cancellation under the FTC's 2024 Click-to-Cancel rule.",
  },
  {
    merchant: "LA Fitness",
    aliases: ["LA Fitness", "Esporta"],
    type: "Gym",
    tactic: "Call corporate at 949-255-7200. Tell them you want to cancel due to price. Ask for a reduced rate or month-to-month conversion. LA Fitness/Esporta retention often offers $10-$20/mo rate reductions.",
  },
  {
    merchant: "Peloton",
    aliases: ["Peloton"],
    type: "Fitness",
    tactic: "Cancel the All-Access membership ($44/mo) at onepeloton.com/account. Peloton's retention offers include: (1) downgrade to App membership ($12.99/mo), (2) 2-3 months at 50% off, or (3) a free month. If you own the hardware, the app-only membership still gives access to most content.",
  },
  {
    merchant: "ClassPass",
    aliases: ["ClassPass"],
    type: "Fitness",
    tactic: "Pause your membership for up to 3 months at classpass.com/account — this is the best first move. When you return, ClassPass often offers a discounted re-activation rate. If canceling, they offer 1-2 months at 30-50% off.",
  },
  {
    merchant: "Noom",
    aliases: ["Noom"],
    type: "Fitness",
    tactic: "Cancel via the app's Settings → Subscription. Noom's retention offers include extended free trials or heavily discounted rates ($14.99/mo vs $59/mo). If you already prepaid annually, request a prorated refund via chat — Noom has honored these under consumer pressure.",
  },
  {
    merchant: "Calm",
    aliases: ["Calm"],
    type: "Fitness",
    tactic: "Cancel at calm.com/account. Calm sometimes offers a discounted annual rate ($39.99/yr vs $69.99/yr) during the cancel flow. Check if your employer or health insurance provides Calm for free — many corporate wellness programs include it.",
  },
  {
    merchant: "Headspace",
    aliases: ["Headspace"],
    type: "Fitness",
    tactic: "Cancel at headspace.com/subscriptions. Similar to Calm — check employer/insurance benefits first. Headspace offers student plans at 85% off and sometimes shows retention pricing during cancellation.",
  },

  // ═══════════════════════════════════════════════════════════
  // News & Media (High success — 70-90%)
  // ═══════════════════════════════════════════════════════════
  {
    merchant: "Wall Street Journal",
    aliases: ["WSJ", "Wall Street Journal", "The Wall Street Journal"],
    type: "News",
    tactic: "Go to the online cancellation flow or call. Ask for the $4/mo or $12/year digital retention offer — this is available to nearly everyone who threatens to cancel. WSJ's retention rate is the best deal in news media.",
  },
  {
    merchant: "New York Times",
    aliases: ["New York Times", "NYT", "NY Times", "The New York Times"],
    type: "News",
    tactic: "Start the online chat to cancel. State the price is too high. NYT almost always offers $4/mo or $1/week retention rate for 12 months. If you're paying full price ($17/mo), you're overpaying — retention pricing is the norm, not the exception.",
  },
  {
    merchant: "Washington Post",
    aliases: ["Washington Post", "WaPo", "The Washington Post"],
    type: "News",
    tactic: "Go to cancel online or call. Ask for the lowest retention rate, typically $29-$40/year — a massive discount from the standard $120/year.",
  },
  {
    merchant: "The Athletic",
    aliases: ["The Athletic"],
    type: "News",
    tactic: "Cancel at theathletic.com/account. The Athletic (owned by NYT) frequently offers 50-70% off annual plans during cancellation. Cancel and wait — they send aggressive 'come back' offers within 1-2 weeks.",
  },

  // ═══════════════════════════════════════════════════════════
  // Home Security (Medium success — 50-70%)
  // ═══════════════════════════════════════════════════════════
  {
    merchant: "ADT",
    aliases: ["ADT", "ADT Security"],
    type: "Security",
    tactic: "Call and request the cancellation department. State you're switching to Ring or SimpliSafe because monitoring is too high. Ask them to lower it to match DIY systems ($15-$20/mo). ADT's contracts are long — check your remaining term and early termination fee before calling. Under the FTC rule, they must allow easy cancellation.",
  },
  {
    merchant: "SimpliSafe",
    aliases: ["SimpliSafe"],
    type: "Security",
    tactic: "Cancel online at simplisafe.com/account. SimpliSafe is no-contract, so you can cancel anytime. However, calling retention can get you $5-$10/mo off monitoring for 6-12 months. The self-monitoring plan ($0/mo) still gives basic alerts.",
  },
  {
    merchant: "Vivint",
    aliases: ["Vivint", "Vivint Smart Home"],
    type: "Security",
    tactic: "Vivint has contracts — check your term. Call 800-216-5232 and say 'cancel'. Retention offers $10-$20/mo off monitoring. If you're near the end of your contract, threaten to let it expire and switch to Ring — they'll offer aggressive discounts to extend.",
  },
  {
    merchant: "Ring Protect",
    aliases: ["Ring", "Ring Protect", "Ring Alarm"],
    type: "Security",
    tactic: "Cancel at ring.com/account. Ring Protect Plus ($20/mo) can be downgraded to Basic ($4.99/mo per camera). If you only use the doorbell, Basic is usually sufficient. No negotiation needed — just pick the right tier.",
  },

  // ═══════════════════════════════════════════════════════════
  // Car Insurance (Often negotiable via re-quoting — 50-70%)
  // ═══════════════════════════════════════════════════════════
  {
    merchant: "GEICO",
    aliases: ["GEICO", "Geico"],
    type: "Insurance",
    tactic: "Call and ask for a policy review. Mention you got a lower quote from Progressive, USAA, or a direct writer. Ask about multi-policy, safe driver, military, federal employee, and low-mileage discounts. In 2026, also ask about telematics (DriveEasy) discounts — up to 25% off for safe driving.",
  },
  {
    merchant: "State Farm",
    aliases: ["State Farm", "StateFarm"],
    type: "Insurance",
    tactic: "Ask your agent to re-quote with higher deductibles ($1,000 vs $500 can save 15-25%). Mention a competitive quote from GEICO or Progressive and ask them to match. State Farm's 'Drive Safe & Save' telematics can save up to 30%.",
  },
  {
    merchant: "Progressive",
    aliases: ["Progressive"],
    type: "Insurance",
    tactic: "Call and request a rate review. Enable Snapshot telematics for up to 30% discount. Bundle with renters/homeowners for additional 5-15% multi-policy discount. Ask about 'Name Your Price' — it lets you adjust coverage to hit a target premium.",
  },

  // ═══════════════════════════════════════════════════════════
  // Satellite Radio (Near 100% success rate)
  // ═══════════════════════════════════════════════════════════
  {
    merchant: "Sirius XM",
    aliases: ["Sirius XM", "SiriusXM", "Sirius Radio"],
    type: "Subscription",
    tactic: "Under the 2026 FTC Click-to-Cancel rule, SiriusXM now must allow online cancellation (they were specifically targeted by the FTC). But calling still gets better deals: (1) DO NOT accept the first 3 offers, (2) Target the $5/mo for 12 months plan + waived royalty fees, (3) If they won't go below $8/mo, cancel fully — they'll call back within 48 hours with the lowest offer.",
  },

  // ═══════════════════════════════════════════════════════════
  // Box Subscriptions (Very high success — 80-95%)
  // ═══════════════════════════════════════════════════════════
  {
    merchant: "BarkBox",
    aliases: ["BarkBox", "Bark Box", "BARK"],
    type: "Subscription",
    tactic: "Cancel via chat at barkbox.com or call 855-944-2275. BarkBox retention offers: (1) free extra toy in next box, (2) 50% off next 2 shipments, or (3) skip for up to 3 months. Their retention budget is high — always negotiate.",
  },
  {
    merchant: "FabFitFun",
    aliases: ["FabFitFun", "FFF"],
    type: "Subscription",
    tactic: "Cancel at fabfitfun.com/account. FabFitFun offers seasonal skip options and sometimes $10-$20 off next box during the cancel flow. Cancel between seasons for the cleanest exit.",
  },
  {
    merchant: "Birchbox",
    aliases: ["Birchbox"],
    type: "Subscription",
    tactic: "Cancel at birchbox.com/account. Birchbox typically offers a free box or heavily discounted renewal during cancellation. If no offer appears, cancel and wait for the re-engagement email.",
  },
];

/**
 * Checks if a given item name matches a known negotiable merchant.
 * @param {string} itemName 
 * @returns {Object|null} The merchant object if negotiable, or null.
 */
export function getNegotiableMerchant(itemName) {
  if (!itemName) return null;
  const normalized = itemName.toLowerCase().trim();
  
  for (const merchant of NEGOTIABLE_MERCHANTS) {
    for (const alias of merchant.aliases) {
      if (normalized.includes(alias.toLowerCase())) {
        return merchant;
      }
    }
  }
  return null;
}
