// ═══════════════════════════════════════════════════════════════
// MEMORY BANK — Stateful RAG Memory for Catalyst Cash AI
//
// This module provides persistent key-value memory for the AI.
// When the AI observes a user preference (e.g., "I consider 
// Starbucks to be a 'Guilty Pleasure'"), it can save it here.
// These facts are injected into every future prompt.
// ═══════════════════════════════════════════════════════════════

  import { log } from "./logger.js";
  import { db } from "./utils.js";

const MEMORY_DB_KEY = "catalyst-ai-memory-bank";

/**
 * Get all stored memory facts.
 * @returns {Promise<Array<{key: string, value: string, timestamp: number}>>}
 */
export async function getMemoryFacts() {
  try {
    const facts = await db.get(MEMORY_DB_KEY);
    return Array.isArray(facts) ? facts : [];
  } catch (e) {
    void log.error("memory-bank", "Failed to load memory facts", { error: e });
    return [];
  }
}

/**
 * Save a new memory fact or update an existing one.
 * @param {string} key - A short identifier (e.g., "category_preference")
 * @param {string} value - The fact string (e.g., "Starbucks = Guilty Pleasure")
 */
export async function saveMemoryFact(key, value) {
  try {
    const facts = await getMemoryFacts();
    const existingIndex = facts.findIndex((f) => f.key === key);
    
    if (existingIndex >= 0) {
      facts[existingIndex] = { key, value, timestamp: Date.now() };
    } else {
      facts.push({ key, value, timestamp: Date.now() });
    }
    
    await db.set(MEMORY_DB_KEY, facts);
    void log.info("memory-bank", "Saved memory fact", { key, totalFacts: facts.length });
    return true;
  } catch (e) {
    void log.error("memory-bank", "Failed to save memory fact", { error: e, key });
    return false;
  }
}

/**
 * Delete a specific memory fact by key.
 * @param {string} key 
 */
export async function deleteMemoryFact(key) {
  try {
    let facts = await getMemoryFacts();
    const len = facts.length;
    facts = facts.filter((f) => f.key !== key);
    
    if (facts.length !== len) {
      await db.set(MEMORY_DB_KEY, facts);
      void log.info("memory-bank", "Deleted memory fact", { key, totalFacts: facts.length });
      return true;
    }
    return false;
  } catch (e) {
    void log.error("memory-bank", "Failed to delete memory fact", { error: e, key });
    return false;
  }
}

/**
 * Clear all memory facts.
 */
export async function clearAllMemory() {
  try {
    await db.del(MEMORY_DB_KEY);
    void log.info("memory-bank", "Cleared all memory facts");
    return true;
  } catch (e) {
    void log.error("memory-bank", "Failed to clear memory facts", { error: e });
    return false;
  }
}

/**
 * Format the memory bank into a string block for prompt injection.
 * @returns {Promise<string>}
 */
export async function getMemoryPromptContext() {
  const facts = await getMemoryFacts();
  if (facts.length === 0) return "";

  let ctx = "<USER_MEMORY_BANK>\n";
  ctx += "These are explicitly stated preferences and facts about the user. Always obey them.\n";
  facts.forEach((f) => {
    ctx += `- ${f.key}: ${f.value}\n`;
  });
  ctx += "</USER_MEMORY_BANK>\n";
  
  return ctx;
}
