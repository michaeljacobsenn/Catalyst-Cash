import { formatInterval } from "../../constants.js";

import type { Renewal } from "../../../types/index.js";

export const WEEK_OPTIONS = Array.from({ length: 52 }, (_, i) => i + 1);
export const MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => i + 1);
export const YEAR_OPTIONS = [1, 2, 3];
export const DAY_OPTIONS = Array.from({ length: 90 }, (_, i) => i + 1);

export function setRenewalOptional(
  renewal: Renewal,
  key: "source" | "chargedTo" | "chargedToId" | "chargedToType" | "nextDue" | "category",
  value: string | undefined | null,
  options?: { allowClear?: boolean }
): Renewal {
  if (value === undefined) return renewal;
  if (value == null || value === "") {
    if (!options?.allowClear) return renewal;
    const next = { ...renewal };
    delete next[key];
    return next;
  }
  return { ...renewal, [key]: value };
}

export function buildRenewalDraft(base: Renewal, patch, fallbackName?: string): Renewal {
  let next: Renewal = {
    ...base,
    name: (patch.name || "").trim() || fallbackName || base.name,
    amount: parseFloat(patch.amount) || 0,
    interval: patch.interval,
    intervalUnit: patch.intervalUnit,
    cadence: formatInterval(patch.interval, patch.intervalUnit),
  };
  next = setRenewalOptional(next, "source", patch.source, { allowClear: true });
  next = setRenewalOptional(next, "chargedTo", patch.chargedTo, { allowClear: true });
  next = setRenewalOptional(next, "chargedToId", patch.chargedToId, { allowClear: true });
  next = setRenewalOptional(next, "chargedToType", patch.chargedToType, { allowClear: true });
  next = setRenewalOptional(next, "nextDue", patch.nextDue, { allowClear: true });
  next = setRenewalOptional(next, "category", patch.category, { allowClear: true });
  return next;
}

export function buildNewRenewal(form, chargedToLabel: string): Renewal {
  let next: Renewal = {
    name: form.name.trim(),
    amount: parseFloat(form.amount) || 0,
    interval: Number(form.interval) || 1,
    intervalUnit: form.intervalUnit,
    cadence: formatInterval(Number(form.interval) || 1, form.intervalUnit),
  };
  next = setRenewalOptional(next, "source", form.source);
  next = setRenewalOptional(next, "chargedTo", chargedToLabel);
  next = setRenewalOptional(next, "chargedToId", form.chargedToId);
  next = setRenewalOptional(next, "chargedToType", form.chargedToType);
  next = setRenewalOptional(next, "category", form.category);
  next = setRenewalOptional(next, "nextDue", form.nextDue);
  return next;
}

export function toGroupedRenewalItem(renewal: Renewal, originalIndex: number, now: string) {
  return {
    ...renewal,
    originalIndex,
    isExpired: Boolean(renewal.intervalUnit === "one-time" && renewal.nextDue && renewal.nextDue < now && !renewal.isCancelled),
  };
}

export const CANCELLATION_LINKS = {
  "netflix": "https://www.netflix.com/cancelplan",
  "hulu": "https://secure.hulu.com/account",
  "disney+": "https://www.disneyplus.com/account",
  "disney plus": "https://www.disneyplus.com/account",
  "max": "https://auth.max.com/subscription",
  "hbo max": "https://auth.max.com/subscription",
  "hbo": "https://auth.max.com/subscription",
  "peacock": "https://www.peacocktv.com/account",
  "paramount+": "https://www.paramountplus.com/account/",
  "paramount plus": "https://www.paramountplus.com/account/",
  "youtube premium": "https://www.youtube.com/paid_memberships",
  "youtube tv": "https://tv.youtube.com/welcome/",
  "youtube music": "https://www.youtube.com/paid_memberships",
  "crunchyroll": "https://www.crunchyroll.com/account/subscription",
  "funimation": "https://www.funimation.com/account/",
  "espn+": "https://plus.espn.com/account",
  "espn plus": "https://plus.espn.com/account",
  "discovery+": "https://www.discoveryplus.com/account",
  "amc+": "https://www.amcplus.com/account",
  "starz": "https://www.starz.com/account",
  "showtime": "https://www.sho.com/account",
  "britbox": "https://www.britbox.com/account",
  "mubi": "https://mubi.com/account",
  "tubi": "https://tubitv.com/account",
  "sling tv": "https://www.sling.com/account",
  "sling": "https://www.sling.com/account",
  "fubo": "https://www.fubo.tv/account",
  "fubotv": "https://www.fubo.tv/account",
  "philo": "https://www.philo.com/account",
  "dazn": "https://www.dazn.com/account",
  "spotify": "https://www.spotify.com/us/account/subscription/",
  "apple music": "https://apps.apple.com/account/subscriptions",
  "tidal": "https://account.tidal.com/subscription",
  "pandora": "https://www.pandora.com/account/settings",
  "amazon music": "https://www.amazon.com/music/settings",
  "deezer": "https://www.deezer.com/account/subscription",
  "audible": "https://www.audible.com/account/overview",
  "apple tv+": "https://apps.apple.com/account/subscriptions",
  "apple tv": "https://apps.apple.com/account/subscriptions",
  "icloud": "https://apps.apple.com/account/subscriptions",
  "icloud+": "https://apps.apple.com/account/subscriptions",
  "apple one": "https://apps.apple.com/account/subscriptions",
  "apple arcade": "https://apps.apple.com/account/subscriptions",
  "apple fitness": "https://apps.apple.com/account/subscriptions",
  "apple news": "https://apps.apple.com/account/subscriptions",
  "amazon prime": "https://www.amazon.com/mc",
  "prime video": "https://www.amazon.com/mc",
  "prime": "https://www.amazon.com/mc",
  "kindle unlimited": "https://www.amazon.com/kindle-dbs/ku/ku-central",
  "kindle": "https://www.amazon.com/kindle-dbs/ku/ku-central",
  "walmart+": "https://www.walmart.com/plus/account",
  "walmart plus": "https://www.walmart.com/plus/account",
  "instacart": "https://www.instacart.com/store/account/instacart-plus",
  "instacart+": "https://www.instacart.com/store/account/instacart-plus",
  "doordash": "https://www.doordash.com/consumer/membership/",
  "dashpass": "https://www.doordash.com/consumer/membership/",
  "grubhub": "https://www.grubhub.com/account/manage-membership",
  "grubhub+": "https://www.grubhub.com/account/manage-membership",
  "blue apron": "https://www.blueapron.com/account/details",
  "home chef": "https://www.homechef.com/account",
  "planet fitness": "https://www.planetfitness.com/my-account/subscription",
  "crunch fitness": "https://members.crunch.com/",
  "crunch": "https://members.crunch.com/",
  "equinox": "https://www.equinox.com/account",
  "orangetheory": "https://www.orangetheory.com/en-us/member-portal",
  "strava": "https://www.strava.com/account",
  "alltrails": "https://www.alltrails.com/account",
  "headspace": "https://www.headspace.com/subscriptions",
  "fitbit": "https://www.fitbit.com/settings/subscription",
  "tonal": "https://www.tonal.com/account",
  "beachbody": "https://www.beachbodyondemand.com/account",
  "classpass": "https://classpass.com/account/membership",
  "ymca": "https://www.ymca.org/",
  "24 hour fitness": "https://www.24hourfitness.com/myaccount/",
  "lifetime fitness": "https://my.lifetime.life/account",
  "adobe": "https://account.adobe.com/plans",
  "adobe creative cloud": "https://account.adobe.com/plans",
  "canva": "https://www.canva.com/settings/billing",
  "microsoft 365": "https://account.microsoft.com/services",
  "microsoft": "https://account.microsoft.com/services",
  "office 365": "https://account.microsoft.com/services",
  "google one": "https://one.google.com/settings",
  "google workspace": "https://workspace.google.com/dashboard",
  "google storage": "https://one.google.com/settings",
  "dropbox": "https://www.dropbox.com/account/plan",
  "notion": "https://www.notion.so/my-account",
  "evernote": "https://www.evernote.com/Settings.action",
  "slack": "https://slack.com/plans",
  "zoom": "https://us02web.zoom.us/account",
  "grammarly": "https://account.grammarly.com/subscription",
  "1password": "https://my.1password.com/settings/billing",
  "dashlane": "https://app.dashlane.com/settings/subscription",
  "figma": "https://www.figma.com/settings",
  "github copilot": "https://github.com/settings/copilot",
  "chatgpt": "https://chat.openai.com/settings/subscription",
  "openai": "https://platform.openai.com/settings/organization/billing",
  "claude": "https://claude.ai/settings",
  "midjourney": "https://www.midjourney.com/account",
  "nordvpn": "https://my.nordaccount.com/dashboard/nordvpn/",
  "expressvpn": "https://www.expressvpn.com/subscriptions",
  "surfshark": "https://my.surfshark.com/subscription",
  "protonvpn": "https://account.protonvpn.com/dashboard",
  "proton": "https://account.proton.me/dashboard",
  "norton": "https://my.norton.com/extspa/subscriptions",
  "malwarebytes": "https://my.malwarebytes.com/account/subscriptions",
  "xbox game pass": "https://account.microsoft.com/services",
  "xbox": "https://account.microsoft.com/services",
  "playstation plus": "https://store.playstation.com/en-us/subscriptions",
  "ps plus": "https://store.playstation.com/en-us/subscriptions",
  "playstation": "https://store.playstation.com/en-us/subscriptions",
  "nintendo switch online": "https://ec.nintendo.com/my/membership",
  "nintendo": "https://ec.nintendo.com/my/membership",
  "geforce now": "https://www.nvidia.com/en-us/account/gfn/",
  "wsj": "https://customercenter.wsj.com/manage-subscriptions",
  "wall street journal": "https://customercenter.wsj.com/manage-subscriptions",
  "nytimes": "https://myaccount.nytimes.com/seg/subscription",
  "new york times": "https://myaccount.nytimes.com/seg/subscription",
  "medium": "https://medium.com/me/settings/membership",
  "linkedin": "https://www.linkedin.com/premium/cancel",
  "linkedin premium": "https://www.linkedin.com/premium/cancel",
  "bumble": "https://bumble.com/en/get-started",
  "hinge": "https://hingeapp.zendesk.com/hc/en-us/articles/360012065853",
  "match": "https://www.match.com/account",
  "duolingo": "https://www.duolingo.com/settings/subscription",
  "masterclass": "https://www.masterclass.com/account/subscription",
  "coursera": "https://www.coursera.org/account-settings",
  "skillshare": "https://www.skillshare.com/settings/payments",
  "blinkist": "https://www.blinkist.com/en/settings/subscription",
  "barkbox": "https://www.barkbox.com/account",
  "dollar shave club": "https://www.dollarshaveclub.com/your-account",
  "fabfitfun": "https://www.fabfitfun.com/account",
  "stitch fix": "https://www.stitchfix.com/settings/account",
  "ipsy": "https://www.ipsy.com/glambag/settings",
  "state farm": "https://www.statefarm.com/customer-care",
  "ring": "https://account.ring.com/account/subscription",
  "simplisafe": "https://webapp.simplisafe.com/new/#/account",
  "apple care+": "https://apps.apple.com/account/subscriptions",
  "apple care": "https://apps.apple.com/account/subscriptions",
  "applecare+": "https://apps.apple.com/account/subscriptions",
  "applecare": "https://apps.apple.com/account/subscriptions",
  "hevy pro": "https://apps.apple.com/account/subscriptions",
  "hevy": "https://apps.apple.com/account/subscriptions",
  "google ai pro": "https://myaccount.google.com/payments-and-subscriptions",
  "google ai": "https://myaccount.google.com/payments-and-subscriptions",
  "gemini advanced": "https://myaccount.google.com/payments-and-subscriptions",
  "gemini": "https://myaccount.google.com/payments-and-subscriptions",
  "siriusxm": "https://care.siriusxm.com/",
  "sirius xm": "https://care.siriusxm.com/",
};

function getDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const matrix = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(null));
  const firstRow = matrix[0];
  if (!firstRow) return Math.max(a.length, b.length);
  for (let i = 0; i <= a.length; i += 1) firstRow[i] = i;
  for (let j = 0; j <= b.length; j += 1) {
    const row = matrix[j];
    if (row) row[0] = j;
  }
  for (let j = 1; j <= b.length; j += 1) {
    for (let i = 1; i <= a.length; i += 1) {
      const ind = a[i - 1] === b[j - 1] ? 0 : 1;
      const currentRow = matrix[j];
      const previousRow = matrix[j - 1];
      if (!currentRow || !previousRow) continue;
      currentRow[i] = Math.min(
        (currentRow[i - 1] ?? 0) + 1,
        (previousRow[i] ?? 0) + 1,
        (previousRow[i - 1] ?? 0) + ind
      );
    }
  }
  return matrix[b.length]?.[a.length] ?? Math.max(a.length, b.length);
}

export function getCancelUrl(itemName: string | undefined): string | null {
  const nameLower = (itemName || "").toLowerCase().trim();
  if (!nameLower) return null;
  if (CANCELLATION_LINKS[nameLower]) return CANCELLATION_LINKS[nameLower];

  const normalizedInput = nameLower.replace(/[^a-z0-9]/g, "");

  for (const key of Object.keys(CANCELLATION_LINKS)) {
    const normalizedKey = key.replace(/[^a-z0-9]/g, "");
    if (normalizedInput.includes(normalizedKey) || normalizedKey.includes(normalizedInput)) {
      return CANCELLATION_LINKS[key];
    }
    if (normalizedInput.length >= 4 && normalizedKey.length >= 4) {
      const allowedTypos = Math.floor(Math.max(normalizedInput.length, normalizedKey.length) / 5) || 1;
      if (getDistance(normalizedInput, normalizedKey) <= allowedTypos) {
        return CANCELLATION_LINKS[key];
      }
    }
  }

  return null;
}
