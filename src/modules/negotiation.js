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
    tactic: "Under the FTC Click-to-Cancel rule, Xfinity must offer online cancellation. However, calling retention (say 'cancel service') yields $20-$40/mo discounts. Mention T-Mobile 5G Home or a local fiber provider. Ask for the 'new customer promotional rate' applied to your existing account. Target: 30-50% discount for 12 months.",
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
    tactic: "Spectrum's current pricing is aggressive post-contract. Call retention and mention T-Mobile 5G Home Internet ($50/mo) or Starlink. Ask for the 'loyalty pricing' — typically $15-$25/mo off for 12 months. If they refuse, schedule cancellation for 30 days out — they'll call back with an offer within a week.",
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
    tactic: "Netflix doesn't negotiate directly, but the current cancel flow shows a retention offer 70% of the time. Start the cancellation at netflix.com/cancelplan. You'll typically see: (1) downgrade to ad-supported, or (2) a free month to reconsider. Complete the flow to see the offer — you can always resubscribe.",
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
    tactic: "Planet Fitness may still require in-person or certified-letter cancellation in many states. Visit your home club and say you're canceling due to relocation or financial hardship. They often offer 1-3 months free or a rate freeze. Check if your state's consumer protection laws require online cancellation under the FTC Click-to-Cancel rule.",
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
    tactic: "Call and ask for a policy review. Mention you got a lower quote from Progressive, USAA, or a direct writer. Ask about multi-policy, safe driver, military, federal employee, and low-mileage discounts. Also ask about telematics (DriveEasy) discounts — up to 25% off for safe driving.",
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
    tactic: "Under the FTC Click-to-Cancel rule, SiriusXM must allow online cancellation (they were specifically targeted by the FTC). But calling still gets better deals: (1) DO NOT accept the first 3 offers, (2) Target the $5/mo for 12 months plan + waived royalty fees, (3) If they won't go below $8/mo, cancel fully — they'll call back within 48 hours with the lowest offer.",
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

  // ═══════════════════════════════════════════════════════════
  // Gaming Subscriptions (Medium success — 40-60%)
  // ═══════════════════════════════════════════════════════════
  {
    merchant: "Xbox Game Pass",
    aliases: ["Xbox Game Pass", "Game Pass", "Xbox", "Microsoft Game Pass"],
    type: "Gaming",
    tactic: "Cancel at account.microsoft.com/services. Microsoft's cancel flow shows a retention offer — typically 1 free month or $1 for the next month. If you cancel fully, Microsoft sends 'come back for $1' emails within 2-4 weeks. The $1/3-months reactivation deal is almost always available to returning subscribers.",
  },
  {
    merchant: "PlayStation Plus",
    aliases: ["PlayStation Plus", "PS Plus", "PSN", "PlayStation Now"],
    type: "Gaming",
    tactic: "Cancel via Settings → Account Management → Subscriptions on your PS5, or store.playstation.com. PS Plus doesn't typically negotiate, but downgrading tiers (Premium → Extra → Essential) saves $40-$60/yr. Sony occasionally offers discounted annual renewals via email after cancellation. Buy annual during Black Friday sales ($40 vs $60 for Essential).",
  },
  {
    merchant: "Nintendo Switch Online",
    aliases: ["Nintendo Switch Online", "NSO", "Nintendo Online"],
    type: "Gaming",
    tactic: "Cancel at accounts.nintendo.com. Nintendo doesn't negotiate, but the Family Plan ($34.99/yr for 8 users) is drastically cheaper per-person than individual ($19.99/yr). Find a family group online to split costs — $4.37/yr per person.",
  },
  {
    merchant: "EA Play",
    aliases: ["EA Play", "EA Access", "Electronic Arts"],
    type: "Gaming",
    tactic: "Cancel via ea.com/ea-play or your platform's subscription management. EA Play is included free with Xbox Game Pass Ultimate — check if you're double-paying. The Pro tier ($16.99/mo) is rarely worth it vs. buying games individually on sale.",
  },
  {
    merchant: "Apple Arcade",
    aliases: ["Apple Arcade"],
    type: "Gaming",
    tactic: "Cancel via Settings → Apple ID → Subscriptions. Apple Arcade ($6.99/mo) is included in Apple One ($19.95/mo). If you pay for 3+ Apple services, Apple One saves money. After cancellation, Apple sometimes offers a free month re-trial after 30+ days.",
  },

  // ═══════════════════════════════════════════════════════════
  // Dating Apps (Medium success — 50-70%)
  // ═══════════════════════════════════════════════════════════
  {
    merchant: "Match.com",
    aliases: ["Match.com", "Match"],
    type: "Dating",
    tactic: "Cancel at match.com/account. Match.com has aggressive retention — expect 50-60% off renewal during the cancel flow. If you cancel and wait 7-14 days, they send 'come back' emails with heavily discounted 3-month plans. Their retention budget is one of the highest in dating apps.",
  },
  {
    merchant: "Tinder",
    aliases: ["Tinder", "Tinder Plus", "Tinder Gold", "Tinder Platinum"],
    type: "Dating",
    tactic: "Cancel via your App Store/Play Store subscription settings (not through the Tinder app). Tinder offers downgrade options during cancellation (Platinum → Gold → Plus). After cancelling, Tinder frequently emails 50% off 'come back' promotions within 1-2 weeks. Never pay full price for re-subscription.",
  },
  {
    merchant: "Bumble",
    aliases: ["Bumble", "Bumble Premium", "Bumble Boost"],
    type: "Dating",
    tactic: "Cancel via App Store/Play Store subscription settings. Bumble shows retention offers during the cancel flow — typically 1 week free or a discounted month. Bumble Premium Lifetime ($199.99) eliminates recurring charges entirely if you plan to use it long-term.",
  },

  // ═══════════════════════════════════════════════════════════
  // VPN Services (High success — 70-85%)
  // ═══════════════════════════════════════════════════════════
  {
    merchant: "NordVPN",
    aliases: ["NordVPN", "Nord VPN"],
    type: "VPN",
    tactic: "Cancel at my.nordaccount.com. NordVPN's retention is aggressive — during cancellation they offer 60-70% off for 2-year plans. If no good offer, cancel fully and wait 1-2 weeks — they email a 70%+ discount 'come back' deal. Nord is famous for never letting subscribers pay full price on renewal.",
  },
  {
    merchant: "ExpressVPN",
    aliases: ["ExpressVPN", "Express VPN"],
    type: "VPN",
    tactic: "Cancel at expressvpn.com/subscriptions. ExpressVPN offers retention discounts of 40-50% during the cancel flow. The 12-month plan is significantly cheaper per-month than monthly billing. Check if ExpressVPN is included with your Aircove router purchase.",
  },
  {
    merchant: "Surfshark",
    aliases: ["Surfshark"],
    type: "VPN",
    tactic: "Cancel at my.surfshark.com. Surfshark offers 80%+ off 2-year plans during retention. Their pricing strategy relies heavily on long-term commitments — if offered a discounted 2-year plan during cancellation, it's typically the best VPN value available.",
  },

  // ═══════════════════════════════════════════════════════════
  // Identity Protection & Credit Monitoring (Medium — 50-65%)
  // ═══════════════════════════════════════════════════════════
  {
    merchant: "Norton LifeLock",
    aliases: ["Norton", "LifeLock", "Norton LifeLock", "Norton 360"],
    type: "Security",
    tactic: "Call 800-543-3562 and say 'cancel'. Norton/LifeLock retention is well-documented: expect 40-60% off your renewal rate. They almost never let you leave at the first attempt. Check if your bank/credit card offers free identity monitoring (many premium cards do). If canceling, also check norton.com/manage for online cancellation per FTC rules.",
  },
  {
    merchant: "McAfee",
    aliases: ["McAfee", "McAfee Total Protection"],
    type: "Security",
    tactic: "Cancel at mcafee.com/myaccount. McAfee's auto-renewal is notoriously hard to turn off — look for 'Turn Off Auto-Renewal' in My Account. Retention offers 50-60% off. Windows Defender (free, built-in) provides equivalent protection for most users — consider if you need McAfee at all.",
  },
  {
    merchant: "Experian",
    aliases: ["Experian", "Experian CreditWorks"],
    type: "Credit",
    tactic: "Cancel at experian.com/consumer/account. Experian Premium ($24.99/mo) is often unnecessary — Credit Karma, Discover Scorecard, and most bank apps provide free FICO scores and monitoring. If you need bureau-specific monitoring, call retention for a discounted rate.",
  },
  {
    merchant: "IdentityForce",
    aliases: ["IdentityForce", "Identity Guard"],
    type: "Security",
    tactic: "Cancel via your account dashboard or call customer service. These services often offer 30-50% off during retention. Check if your employer, bank, or credit card already provides identity monitoring — many offer it free as a benefit.",
  },

  // ═══════════════════════════════════════════════════════════
  // Tax & Financial Software (Medium — 40-60%)
  // ═══════════════════════════════════════════════════════════
  {
    merchant: "TurboTax",
    aliases: ["TurboTax", "Intuit TurboTax"],
    type: "Software",
    tactic: "TurboTax now uses a subscription model. Cancel at accounts.intuit.com. Before renewal, check IRS Free File (free if AGI < $84k), FreeTaxUSA ($14.99 for federal+state), or Cash App Taxes (free). TurboTax is significantly overpriced for simple returns. If you must stay, call to negotiate — retention sometimes offers 30-40% off.",
  },
  {
    merchant: "H&R Block",
    aliases: ["H&R Block", "HR Block", "HRBlock"],
    type: "Software",
    tactic: "Cancel subscriptions at hrblock.com/account. H&R Block's online pricing is negotiable if you call — mention you're switching to TurboTax or FreeTaxUSA. In-person preparation is also negotiable, especially early season (January-February).",
  },

  // ═══════════════════════════════════════════════════════════
  // Language Learning (High success — 65-80%)
  // ═══════════════════════════════════════════════════════════
  {
    merchant: "Duolingo",
    aliases: ["Duolingo", "Duolingo Plus", "Duolingo Super"],
    type: "Education",
    tactic: "Cancel via App Store/Play Store subscription settings. Duolingo Super ($12.99/mo) occasionally shows 50% off annual ($79.99/yr) during the cancel flow. After cancellation, Duolingo sends 'come back' emails with 60% off promotions. The free tier is fully functional for learning — Super just removes ads and adds mistakes tracking.",
  },
  {
    merchant: "Rosetta Stone",
    aliases: ["Rosetta Stone"],
    type: "Education",
    tactic: "Cancel at rosettastone.com/account. Rosetta Stone offers retention discounts of 40-50% or extended access periods. Their Lifetime subscription ($179 on sale) eliminates recurring charges — wait for holiday sales when it drops to $120-$150.",
  },
  {
    merchant: "Babbel",
    aliases: ["Babbel"],
    type: "Education",
    tactic: "Cancel at babbel.com/account. Babbel offers 30-50% off during the cancel flow. Their Lifetime membership ($149.99 on sale) is the best value — check for promotional pricing on deal sites.",
  },

  // ═══════════════════════════════════════════════════════════
  // Home Warranty (Medium success — 50-65%)
  // ═══════════════════════════════════════════════════════════
  {
    merchant: "American Home Shield",
    aliases: ["American Home Shield", "AHS"],
    type: "Home",
    tactic: "Call 888-682-1043 and say 'cancel'. AHS retention offers $5-$15/mo discounts or a reduced service call fee. If your contract is up, compare Choice Home Warranty or First American — use the competitor quote as leverage. Ask about their 'loyalty rate' for renewing customers.",
  },
  {
    merchant: "Choice Home Warranty",
    aliases: ["Choice Home Warranty", "CHW"],
    type: "Home",
    tactic: "Call 888-275-2980 to cancel. Choice Home Warranty offers retention discounts of $10-$20/mo. They also offer multi-year discounts — 3-year plans are typically 30% cheaper per year than annual billing.",
  },

  // ═══════════════════════════════════════════════════════════
  // Lawn & Pest Control (Medium success — 50-65%)
  // ═══════════════════════════════════════════════════════════
  {
    merchant: "TruGreen",
    aliases: ["TruGreen"],
    type: "Home",
    tactic: "Call 866-688-6722 to cancel. TruGreen's retention team offers free additional treatments, discounted annual plans, or a seasonal pause option. Mention you received a lower quote from a local provider — they typically match within 10-15%.",
  },
  {
    merchant: "Terminix",
    aliases: ["Terminix"],
    type: "Home",
    tactic: "Call 877-837-6464 to cancel. Terminix's contracts are annual — check your term. Retention offers $10-$20/mo discounts on quarterly pest control plans. Mention you're switching to a local provider or DIY solutions.",
  },

  // ═══════════════════════════════════════════════════════════
  // Food Delivery Memberships (High success — 65-80%)
  // ═══════════════════════════════════════════════════════════
  {
    merchant: "DoorDash DashPass",
    aliases: ["DoorDash", "DashPass", "DoorDash DashPass"],
    type: "Subscription",
    tactic: "Cancel at doordash.com/consumer/membership. DashPass ($9.99/mo) shows retention offers during cancellation — typically a free month or $4.99/mo for 2 months. Check if your Chase Sapphire or Capital One Savor card includes a free/discounted DashPass benefit — many premium cards include this.",
  },
  {
    merchant: "Uber One",
    aliases: ["Uber One", "Uber Eats Pass", "Uber Pass"],
    type: "Subscription",
    tactic: "Cancel at account.uber.com/membership. Uber One ($9.99/mo) occasionally shows $4.99/mo retention offers. Check if your American Express or Capital One card includes an Uber credit — many premium cards offer $10-$15/mo Uber credits that offset the membership cost entirely.",
  },
  {
    merchant: "Instacart+",
    aliases: ["Instacart+", "Instacart Plus", "Instacart Express"],
    type: "Subscription",
    tactic: "Cancel at instacart.com/account. Instacart+ ($9.99/mo or $99/yr) shows retention offers 60% of the time. Instacart also partners with Chase and other banks for free membership with certain credit cards — check your card benefits before paying.",
  },

  // ═══════════════════════════════════════════════════════════
  // Antivirus & Digital Security (High success — 70-85%)
  // ═══════════════════════════════════════════════════════════
  {
    merchant: "Bitdefender",
    aliases: ["Bitdefender"],
    type: "Security",
    tactic: "Cancel at central.bitdefender.com. Bitdefender's auto-renewal is at full price ($80-$100/yr) — always cancel before renewal and rebuy at the promotional new-customer rate ($30-$40/yr). This is the standard practice for all antivirus products and saves 50-60%.",
  },
  {
    merchant: "Kaspersky",
    aliases: ["Kaspersky"],
    type: "Security",
    tactic: "Cancel at my.kaspersky.com. Same strategy as all antivirus: cancel before auto-renewal and re-purchase at the new-customer discount (50-70% off). Consider Windows Defender (free) or Bitdefender Free as zero-cost alternatives for basic protection.",
  },
  {
    merchant: "Malwarebytes",
    aliases: ["Malwarebytes"],
    type: "Security",
    tactic: "Cancel at my.malwarebytes.com/account. Malwarebytes Premium ($44.99/yr) auto-renews at full price — cancel and rebuy at the promotional rate ($29.99-$34.99/yr for new customers). The free version still provides on-demand scanning, which is sufficient for most users.",
  },

  // ═══════════════════════════════════════════════════════════
  // Productivity & SaaS (Medium success — 40-60%)
  // ═══════════════════════════════════════════════════════════
  {
    merchant: "LinkedIn Premium",
    aliases: ["LinkedIn", "LinkedIn Premium", "LinkedIn Sales Navigator"],
    type: "Professional",
    tactic: "Cancel at linkedin.com/psettings/account. LinkedIn Premium ($29.99-$59.99/mo) shows a retention offer of 50% off for 2 months during the cancel flow. After cancellation, LinkedIn often emails a 'come back for 50% off' deal within 2-4 weeks. Sales Navigator cancellation requires calling — retention discounts of 20-30% are common.",
  },
  {
    merchant: "Grammarly",
    aliases: ["Grammarly", "Grammarly Premium"],
    type: "Software",
    tactic: "Cancel at account.grammarly.com. Grammarly Premium ($12/mo) offers 40-50% off annual plans during the cancel flow. Grammarly's free tier handles basic grammar — Premium is mainly for tone/clarity suggestions. Check if your employer or university provides Grammarly Business for free.",
  },
  {
    merchant: "Canva Pro",
    aliases: ["Canva", "Canva Pro"],
    type: "Software",
    tactic: "Cancel at canva.com/settings/billing. Canva Pro ($12.99/mo) shows retention offers of 30-50% off during cancellation. The Canva for Teams plan ($14.99/mo per person) is more cost-effective if you have 2+ users. Canva Free includes 250k+ templates — evaluate if Pro features are truly needed.",
  },
  {
    merchant: "Zoom",
    aliases: ["Zoom", "Zoom Pro", "Zoom Workplace"],
    type: "Software",
    tactic: "Cancel at zoom.us/account/billing. Zoom Pro ($13.33/mo annually) can often be negotiated down 15-25% by calling sales directly and mentioning you're switching to Google Meet (free) or Microsoft Teams (free). Annual billing saves 17% over monthly. Check if your employer provides Zoom already.",
  },
  {
    merchant: "Evernote",
    aliases: ["Evernote"],
    type: "Software",
    tactic: "Cancel at evernote.com/settings. Evernote Personal ($14.99/mo) shows retention offers during cancellation — typically 40% off annual billing. Consider switching to Apple Notes (free), Notion (free tier), or Obsidian (free) as alternatives with comparable or better features.",
  },

  // ═══════════════════════════════════════════════════════════
  // Mental Health & Therapy (Medium success — 50-65%)
  // ═══════════════════════════════════════════════════════════
  {
    merchant: "BetterHelp",
    aliases: ["BetterHelp"],
    type: "Health",
    tactic: "Cancel at betterhelp.com/account. BetterHelp ($65-$100/week) offers a financial aid discount (25-50% off) if you mention cost as the reason for canceling. They also offer session frequency reductions. Check if your employer EAP (Employee Assistance Program) covers therapy sessions — most provide 6-12 free sessions per year.",
  },
  {
    merchant: "Talkspace",
    aliases: ["Talkspace"],
    type: "Health",
    tactic: "Cancel at talkspace.com/account. Talkspace ($69-$109/week) offers retention discounts of 20-30% but also check your health insurance — many insurers now cover Talkspace as an in-network provider (copay only, not full price). Your employer's EAP may also cover Talkspace sessions.",
  },
  {
    merchant: "Care.com",
    aliases: ["Care.com"],
    type: "Health",
    tactic: "Cancel at care.com/account. Care.com Premium ($39.99/mo) shows retention offers of 50% off during cancellation. If you only need occasional caregiving, their one-time background check option ($58) is cheaper than maintaining a monthly subscription.",
  },

  // ═══════════════════════════════════════════════════════════
  // Pet Services (Medium-High success — 55-75%)
  // ═══════════════════════════════════════════════════════════
  {
    merchant: "Chewy Autoship",
    aliases: ["Chewy", "Chewy Autoship"],
    type: "Pet",
    tactic: "Manage at chewy.com/app/account/autoship. Chewy Autoship already gives 5-10% off — but you can call 800-672-4399 and the famously helpful Chewy team often applies additional credits ($10-$20) to retain autoship subscribers. Adjusting delivery frequency (every 8-12 weeks instead of 4-6) reduces costs without losing the discount.",
  },
  {
    merchant: "Rover",
    aliases: ["Rover"],
    type: "Pet",
    tactic: "Rover doesn't have a subscription, but their fees are negotiable for repeat bookings. Contact your sitter directly about off-platform arrangements for repeat service (Rover charges 20% service fee). For recurring pet sitting, negotiate a flat weekly rate directly with your sitter.",
  },
  {
    merchant: "Wag",
    aliases: ["Wag", "Wag!"],
    type: "Pet",
    tactic: "Cancel Wag Premium ($9.99/mo) at wagwalking.com/account. Wag Premium offers insurance/VIP support — evaluate if standard Wag (no subscription) meets your needs. Wag's retention typically offers 1-2 free months during cancellation.",
  },

  // ═══════════════════════════════════════════════════════════
  // More Fitness (Verified tactics — 55-75%)
  // ═══════════════════════════════════════════════════════════
  {
    merchant: "Strava",
    aliases: ["Strava", "Strava Summit", "Strava Premium"],
    type: "Fitness",
    tactic: "Cancel at strava.com/settings/subscription. Strava Premium ($11.99/mo) shows a retention offer of 2 free months during cancellation about 60% of the time. The free tier still tracks activities — Premium is mainly for training analytics and route planning. Annual billing ($79.99/yr) saves 45%.",
  },
  {
    merchant: "Fitbit Premium",
    aliases: ["Fitbit Premium", "Fitbit"],
    type: "Fitness",
    tactic: "Cancel via the Fitbit app or fitbit.com/settings. Fitbit Premium ($9.99/mo) is included with Pixel Watch and some Fitbit devices for 6 months. After that, evaluate if the free features (step tracking, heart rate, sleep) are sufficient. Google sometimes emails $4.99/mo retention offers to returning users.",
  },
  {
    merchant: "Apple Fitness+",
    aliases: ["Apple Fitness+", "Apple Fitness Plus"],
    type: "Fitness",
    tactic: "Cancel via Settings → Apple ID → Subscriptions. Apple Fitness+ ($9.99/mo) is included in Apple One Premier ($32.95/mo). It's also included free for 3 months with new Apple Watch purchases. After cancellation, Apple occasionally offers a free month to return.",
  },
  {
    merchant: "WHOOP",
    aliases: ["WHOOP"],
    type: "Fitness",
    tactic: "Cancel at app.whoop.com/account. WHOOP ($30/mo or $239/yr) offers retention discounts of 20-30% during cancel flow. The 24-month commitment ($16.60/mo) is significantly cheaper. If canceling, you keep the device but lose data access — export your data before canceling.",
  },
  {
    merchant: "MyFitnessPal",
    aliases: ["MyFitnessPal", "MyFitnessPal Premium", "MFP"],
    type: "Fitness",
    tactic: "Cancel via App Store/Play Store subscription settings. MyFitnessPal Premium ($19.99/mo) is overpriced — cancel and use the free tier (calorie tracking, food database) or switch to Cronometer (free, better micronutrient tracking). MFP occasionally emails 50% off 'come back' offers.",
  },

  // ═══════════════════════════════════════════════════════════
  // Box Subscriptions (Very high success — 80-95%)
  // ═══════════════════════════════════════════════════════════
  {
    merchant: "Stitch Fix",
    aliases: ["Stitch Fix"],
    type: "Subscription",
    tactic: "Cancel at stitchfix.com/account/settings. Stitch Fix charges a $20 styling fee (credited toward purchases) — you can pause deliveries indefinitely without canceling to avoid fees. If you ask to cancel, they offer a free styling session or $25 credit to stay.",
  },
  {
    merchant: "Dollar Shave Club",
    aliases: ["Dollar Shave Club", "DSC"],
    type: "Subscription",
    tactic: "Cancel at dollarshaveclub.com/account. Dollar Shave Club offers skip/pause options and retention discounts of 20-30% during the cancel flow. Their razor handle is compatible with cheap third-party cartridges — consider switching to refills only.",
  },
  {
    merchant: "Harry's",
    aliases: ["Harry's", "Harrys"],
    type: "Subscription",
    tactic: "Cancel at harrys.com/account. Harry's offers flexible delivery pausing (skip up to 3 months) and retention credits ($5-$10) during cancellation. Their Trial Set ($13) is a low-cost way to re-engage vs. full subscription.",
  },
  {
    merchant: "Ipsy",
    aliases: ["Ipsy", "IPSY"],
    type: "Subscription",
    tactic: "Cancel at ipsy.com/account. Ipsy offers skip months and retention discounts (free bag or 30% off next month) during cancellation. Pause instead of canceling to keep your beauty profile and preferences.",
  },

  // ═══════════════════════════════════════════════════════════
  // More Telecom & Internet (High success — 65-80%)
  // ═══════════════════════════════════════════════════════════
  {
    merchant: "Google Fiber",
    aliases: ["Google Fiber", "Google Fi Internet"],
    type: "ISP",
    tactic: "Google Fiber doesn't negotiate much on price since they're already competitively priced, but you can downgrade speed tiers to save $20-$40/mo. If in a Google Fiber market, use your Google Fiber pricing as leverage when negotiating with competitors.",
  },
  {
    merchant: "T-Mobile Home Internet",
    aliases: ["T-Mobile Home Internet", "T-Mobile 5G Home"],
    type: "ISP",
    tactic: "Cancel at t-mobile.com/account. T-Mobile Home Internet ($50/mo) is already among the cheapest options. If experiencing issues, call 611 — T-Mobile sometimes offers $10/mo credits for 6-12 months. Use this service as negotiation leverage against cable ISPs (Comcast, Spectrum).",
  },
  {
    merchant: "Verizon 5G Home",
    aliases: ["Verizon 5G Home", "Verizon Home Internet"],
    type: "ISP",
    tactic: "Cancel at verizon.com/account. Verizon 5G Home Internet ($35-$60/mo with Verizon Wireless) is discounted when bundled with wireless. If you're a Verizon Wireless customer, the bundled discount makes this one of the cheapest home internet options. Threaten to drop the bundle for maximum leverage.",
  },

  // ═══════════════════════════════════════════════════════════
  // Professional & Email (Medium success — 40-55%)
  // ═══════════════════════════════════════════════════════════
  {
    merchant: "Slack",
    aliases: ["Slack", "Slack Pro", "Slack Business"],
    type: "Professional",
    tactic: "Cancel at slack.com/admin/billing. Slack Pro ($7.25/mo per user) — for small teams, consider switching to Discord (free) or Google Chat (free with Workspace). Slack's sales team can negotiate 15-25% volume discounts for annual commitments of 10+ seats.",
  },
  {
    merchant: "Squarespace",
    aliases: ["Squarespace"],
    type: "Professional",
    tactic: "Cancel at squarespace.com/account/billing. Squarespace ($16-$49/mo) offers 20-30% off annual billing during the cancel flow. If you're on a personal site, Carrd ($19/yr) or WordPress.com free tier may be sufficient alternatives. Check 'SQUARESPACE' promo codes from podcast sponsorships — they're frequently available online.",
  },
  {
    merchant: "GoDaddy",
    aliases: ["GoDaddy"],
    type: "Professional",
    tactic: "Call 480-505-8877 to cancel. GoDaddy's auto-renewal pricing is 2-3x the promotional rate — always call retention before renewal. They offer 30-50% renewal discounts. For domains only, transfer to Cloudflare Registrar ($0 markup) or Namecheap (cheaper renewals).",
  },
];

/**
 * Simple Levenshtein edit-distance for typo tolerance.
 * Only used as a fallback when exact substring matching fails.
 */
function levenshtein(a, b) {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      const cost = b[i - 1] === a[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,       // deletion
        matrix[i][j - 1] + 1,       // insertion
        matrix[i - 1][j - 1] + cost  // substitution
      );
    }
  }
  return matrix[b.length][a.length];
}

/**
 * Checks if a given item name matches a known negotiable merchant.
 * Uses a 3-pass strategy for maximum coverage:
 *   1. Exact substring match (handles "Netflix james@gmail.com")
 *   2. Word-level exact match (handles "my netflix account")
 *   3. Fuzzy Levenshtein fallback (handles "Netflx", "Comcst", "Spotfy")
 *
 * @param {string} itemName - The bill/subscription name to check.
 * @returns {Object|null} The merchant object if negotiable, or null.
 */
export function getNegotiableMerchant(itemName) {
  if (!itemName) return null;
  const normalized = itemName.toLowerCase().trim();

  // Explicit exclusionary rules for physical goods / false positives
  const exclusions = ["subscribe", "save", "delivery", "order", "shampoo", "pens", "paper", "amazon.com", "amzn", "marketplace", "whole foods"];
  if (exclusions.some(ex => normalized.includes(ex))) {
    return null;
  }

  // ── Pass 1: Exact substring match (fastest) ──
  for (const merchant of NEGOTIABLE_MERCHANTS) {
    for (const alias of merchant.aliases) {
      if (normalized.includes(alias.toLowerCase())) {
        return merchant;
      }
    }
  }

  // ── Pass 2: Fuzzy match — split input into words, check each against aliases ──
  const words = normalized.replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(w => w.length >= 3);
  let bestMatch = null;
  let bestDistance = Infinity;

  for (const merchant of NEGOTIABLE_MERCHANTS) {
    for (const alias of merchant.aliases) {
      const aliasLower = alias.toLowerCase().replace(/[^a-z0-9\s]/g, " ").trim();
      const aliasWords = aliasLower.split(/\s+/);
      const maxDist = aliasLower.length >= 5 ? 2 : 1;

      // Only check single words if the alias itself is a single word
      if (aliasWords.length === 1) {
        const aw = aliasWords[0];
        if (aw.length < 3) continue;

        for (const word of words) {
          if (Math.abs(word.length - aw.length) > 2) continue;
          const dist = levenshtein(word, aw);
          const maxLen = Math.max(word.length, aw.length);
          const ratio = 1 - dist / maxLen;
          
          if (dist <= maxDist && ratio >= 0.7 && dist < bestDistance) {
            bestDistance = dist;
            bestMatch = merchant;
          }
        }
      } 
      // If the alias is multi-word, ONLY use the sliding window of N words
      else if (aliasWords.length > 1) {
        for (let i = 0; i <= words.length - aliasWords.length; i++) {
          const joined = words.slice(i, i + aliasWords.length).join(" ");
          const dist = levenshtein(joined, aliasLower);
          const maxLen = Math.max(joined.length, aliasLower.length);
          const ratio = 1 - dist / maxLen;
          
          if (dist <= maxDist && ratio >= 0.7 && dist < bestDistance) {
            bestDistance = dist;
            bestMatch = merchant;
          }
        }
      }
    }
  }

  return bestMatch;
}
