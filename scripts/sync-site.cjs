const fs = require("fs");
const path = require("path");

const PLAN_CATALOG_PATH = path.join(__dirname, "../src/modules/planCatalog.js");
const SITE_INDEX_HTM_PATH = path.join(__dirname, "../site/index.html");
const SITE_COMPARE_HTM_PATH = path.join(__dirname, "../site/compare.html");
const SITE_FAQ_HTM_PATH = path.join(__dirname, "../site/faq.html");

function getConstant(filePath, regex, fallback) {
  try {
    const content = fs.readFileSync(filePath, "utf8");
    const match = content.match(regex);
    if (match && match[1]) {
      return match[1];
    }
  } catch {
    console.error(`Error reading ${filePath}`);
  }
  return fallback;
}

// Extract limits from source of truth (planCatalog.js)
const proAudits = getConstant(PLAN_CATALOG_PATH, /PRO_MONTHLY_AUDIT_CAP\s*=\s*(\d+);/, "20");
const freeAudits = getConstant(PLAN_CATALOG_PATH, /FREE_AUDIT_LIMIT\s*=\s*(\d+);/, "2");
const proChats = getConstant(PLAN_CATALOG_PATH, /PRO_DAILY_CHAT_CAP\s*=\s*(\d+);/, "30");
const freeChats = getConstant(PLAN_CATALOG_PATH, /FREE_CHAT_LIMIT\s*=\s*(\d+);/, "10");
const freePlaid = getConstant(PLAN_CATALOG_PATH, /INSTITUTION_LIMITS\s*=\s*\{\s*free:\s*(\d+),/, "1");
const proPlaid = getConstant(PLAN_CATALOG_PATH, /INSTITUTION_LIMITS\s*=\s*\{\s*free:\s*\d+,\s*pro:\s*(\d+),/, "8");

console.log("=== Found Limits ===");
console.log(`Pro Audits: ${proAudits}/mo`);
console.log(`Free Audits: ${freeAudits}/wk`);
console.log(`Pro Chats: ${proChats}/day`);
console.log(`Free Chats: ${freeChats}/day`);
console.log(`Free Plaid: ${freePlaid} banks`);
console.log(`Pro Plaid: ${proPlaid} banks`);

function updateSiteHtml(filePath) {
  if (!fs.existsSync(filePath)) return;
  let content = fs.readFileSync(filePath, "utf8");
  
  // Smart Regex replacements for index.html pricing/hero bullets
  // Match patterns like "X free audits every week" or "X weekly audits"
  content = content.replace(/<span>\d+ free audits every week<\/span>/g, `<span>${freeAudits} free audits every week</span>`);
  content = content.replace(/<span>\d+ free AskAI chats per day<\/span>/g, `<span>${freeChats} free AskAI chats per day</span>`);
  
  content = content.replace(/<li>\d+ weekly audits<\/li>/g, `<li>${freeAudits} weekly audits</li>`);
  content = content.replace(/<li>\d+ audits per week<\/li>/g, `<li>${freeAudits} audits per week</li>`);
  content = content.replace(/<li>\d+ AskAI chats per day<\/li>/g, `<li>${freeChats} AskAI chats per day</li>`);
  content = content.replace(/<li>\d+ Bank Snapshots? \(Manual Plaid sync\)<\/li>/g, `<li>${freePlaid} Bank Snapshot${parseInt(freePlaid) > 1 ? "s" : ""} (Manual Plaid sync)</li>`);
  content = content.replace(/<li>\d+ Plaid institution or fully manual use<\/li>/g, `<li>${freePlaid} Plaid institution or fully manual use</li>`);
  
  content = content.replace(/<li>\d+ audits\/month \(1\/day\) &amp; \d+ AskAI chats\/day<\/li>/g, `<li>${proAudits} audits/month &amp; ${proChats} AskAI chats/day</li>`);
  content = content.replace(/<li>\d+ audits\/month & \d+ AskAI chats\/day<\/li>/g, `<li>${proAudits} audits/month & ${proChats} AskAI chats/day</li>`);
  content = content.replace(/<li>\d+ audits per month and \d+ AskAI chats per day<\/li>/g, `<li>${proAudits} audits per month and ${proChats} AskAI chats per day</li>`);
  content = content.replace(/up to \d+ Plaid institutions/g, `up to ${proPlaid} Plaid institutions`);
  content = content.replace(/Up to \d+ Plaid institutions/g, `Up to ${proPlaid} Plaid institutions`);
  content = content.replace(/keep all \d+ usable/g, `keep all ${proPlaid} usable`);
  content = content.replace(/>\d+ Plaid institutions</g, `>${proPlaid} Plaid institutions<`);
  content = content.replace(/>\d+ institutions</g, `>${proPlaid} institutions<`);
  content = content.replace(/<li>Up to \d+ Plaid institutions with quiet balance \+ ledger upkeep<\/li>/g, `<li>Up to ${proPlaid} Plaid institutions with quiet balance + ledger upkeep</li>`);

  // Compare.html specific replaces
  content = content.replace(/All features\. \d+ AI Chats\/day\./g, `All features. ${proChats} AI Chats/day.`);
  content = content.replace(/reasoning models, and \d+ AskAI chats per day\./g, `reasoning models, and ${proChats} AskAI chats per day.`);
  content = content.replace(/Free supports \d+ Plaid institutions?\./g, `Free supports ${freePlaid} Plaid institution${parseInt(freePlaid) === 1 ? "" : "s"}.`);
  content = content.replace(/Pro supports up to \d+ Plaid institutions?\./g, `Pro supports up to ${proPlaid} Plaid institutions.`);
  content = content.replace(/Pro expands usage and depth: \d+ audits per month, \d+ AskAI chats per day, up to \d+ Plaid institutions/g, `Pro expands usage and depth: ${proAudits} audits per month, ${proChats} AskAI chats per day, up to ${proPlaid} Plaid institutions`);

  fs.writeFileSync(filePath, content);
  console.log(`Synced limits -> ${path.basename(filePath)}`);
}

updateSiteHtml(SITE_INDEX_HTM_PATH);
updateSiteHtml(SITE_COMPARE_HTM_PATH);
updateSiteHtml(SITE_FAQ_HTM_PATH);

console.log("✅ Marketing site pricing synced with code variables.");
