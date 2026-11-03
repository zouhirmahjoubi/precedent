// A second opinion on keyword matches: would the work, done as written,
// break the decision, fit it, or is it about something else? Runs on
// Atlassian-hosted Forge LLMs, so work item text never leaves Atlassian.
import { chat } from '@forge/llm';
import { buildPrompt, parseVerdicts } from './verdicts';

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
