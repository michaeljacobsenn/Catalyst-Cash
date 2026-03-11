const fs = require("fs");
const path = require("path");

const SUBSCRIPTION_JS_PATH = path.join(__dirname, "../src/modules/subscription.js");
const WORKER_INDEX_JS_PATH = path.join(__dirname, "../worker/src/index.js");
const SITE_INDEX_HTM_PATH = path.join(__dirname, "../site/index.html");
const SITE_COMPARE_HTM_PATH = path.join(__dirname, "../site/compare.html");

function getConstant(filePath, regex, fallback) {
  try {
    const content = fs.readFileSync(filePath, "utf8");
    const match = content.match(regex);
    if (match && match[1]) {
      return match[1];
    }
  } catch (err) {
    console.error(`Error reading ${filePath}`);
  }
  return fallback;
}

// Extract limits from source of truth
const proAudits = getConstant(SUBSCRIPTION_JS_PATH, /PRO_MONTHLY_AUDIT_CAP\s*=\s*(\d+);/, "31");
const freeAudits = getConstant(WORKER_INDEX_JS_PATH, /FREE_AUDITS_PER_WEEK\s*=\s*(\d+);/, "2");
const proChats = getConstant(WORKER_INDEX_JS_PATH, /PRO_CHATS_PER_DAY\s*=\s*(\d+);/, "50");
const freeChats = getConstant(WORKER_INDEX_JS_PATH, /FREE_CHATS_PER_DAY\s*=\s*(\d+);/, "10");
const freePlaid = getConstant(SUBSCRIPTION_JS_PATH, /INSTITUTION_LIMITS\s*=\s*\{\s*free:\s*(\d+),/, "2");

console.log("=== Found Limits ===");
console.log(`Pro Audits: ${proAudits}/mo`);
console.log(`Free Audits: ${freeAudits}/wk`);
console.log(`Pro Chats: ${proChats}/day`);
console.log(`Free Chats: ${freeChats}/day`);
console.log(`Free Plaid: ${freePlaid} banks`);

function updateSiteHtml(filePath) {
  if (!fs.existsSync(filePath)) return;
  let content = fs.readFileSync(filePath, "utf8");
  
  // Smart Regex replacements for index.html pricing/hero bullets
  // Match patterns like "X free audits every week" or "X weekly audits"
  content = content.replace(/<span>\d+ free audits every week<\/span>/g, `<span>${freeAudits} free audits every week</span>`);
  content = content.replace(/<span>\d+ free AskAI chats per day<\/span>/g, `<span>${freeChats} free AskAI chats per day</span>`);
  
  content = content.replace(/<li>\d+ weekly audits<\/li>/g, `<li>${freeAudits} weekly audits</li>`);
  content = content.replace(/<li>\d+ AskAI chats per day<\/li>/g, `<li>${freeChats} AskAI chats per day</li>`);
  content = content.replace(/<li>\d+ Bank Snapshots? \(Manual Plaid sync\)<\/li>/g, `<li>${freePlaid} Bank Snapshot${parseInt(freePlaid) > 1 ? "s" : ""} (Manual Plaid sync)</li>`);
  
  content = content.replace(/<li>\d+ audits\/month \(1\/day\) &amp; \d+ AskAI chats\/day<\/li>/g, `<li>${proAudits} audits/month &amp; ${proChats} AskAI chats/day</li>`);
  content = content.replace(/<li>\d+ audits\/month & \d+ AskAI chats\/day<\/li>/g, `<li>${proAudits} audits/month & ${proChats} AskAI chats/day</li>`);

  // Compare.html specific replaces
  content = content.replace(/All features\. \d+ AI Chats\/day\./g, `All features. ${proChats} AI Chats/day.`);
  content = content.replace(/reasoning models, and \d+ AskAI chats per day\./g, `reasoning models, and ${proChats} AskAI chats per day.`);

  fs.writeFileSync(filePath, content);
  console.log(`Synced limits -> ${path.basename(filePath)}`);
}

updateSiteHtml(SITE_INDEX_HTM_PATH);
updateSiteHtml(SITE_COMPARE_HTM_PATH);

console.log("✅ Marketing site pricing synced with code variables.");
