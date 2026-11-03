// Calls to Atlassian-hosted Forge LLMs, so work item text never leaves Atlassian.
// judge: a second opinion on keyword matches (conflicts, fits, unclear, unrelated).
// extractDecision: the decision a comment states, if any.
// draftPageDecision: the rule, reason and keywords for a Confluence decision item.
import { chat } from '@forge/llm';
import { buildPrompt, parseVerdicts } from './verdicts';
import { buildExtractPrompt, buildPageDraftPrompt, parseExtract } from './suggest';

const MAX_DECISIONS = 6;

// On any failure the caller falls back to keyword matching, so this never throws.
export async function judge(work, decisions) {
  const list = decisions.slice(0, MAX_DECISIONS);
  if (!list.length) return {};
  try {
    const response = await chat(buildPrompt(work, list));
    return parseVerdicts(response, list.map((d) => d.ref));
  } catch (e) {
    console.warn(`Precedent: AI check failed, using keyword matches only. ${e.message}`);
    return {};
  }
}

// Null when there is no decision or the call fails.
export async function extractDecision(work, comment) {
  try {
    return parseExtract(await chat(buildExtractPrompt(work, comment)));
  } catch (e) {
    console.warn(`Precedent: could not read a decision from ${work.key}. ${e.message}`);
    return null;
  }
}

// Null when the call fails; the caller then uses the item's own words.
export async function draftPageDecision(page, item) {
  try {
    return parseExtract(await chat(buildPageDraftPrompt(page, item)));
  } catch (e) {
    console.warn(`Precedent: could not draft a decision from page ${page.id}. ${e.message}`);
    return null;
  }
}
