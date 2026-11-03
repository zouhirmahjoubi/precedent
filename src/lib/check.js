import { matchWork } from './decisions';
import { applyVerdicts } from './matcher';
import { judge } from './judge';
import { verdictKey } from './verdicts';

// Verdicts already stored on the work item that still match its text and the decision.
export function storedVerdicts(work, matches, flags) {
  const out = {};
  for (const m of matches) {
    const f = flags[m.decision.ref];
    if (f?.verdict && f.verdictKey === verdictKey(work, m.decision)) out[m.decision.ref] = f;
  }
  return out;
}

// Keyword matches first, then, when an admin turned it on, an AI verdict on each.
// Verdicts are stored on the work item until its text or the decision changes,
// so opening the panel again does not call the model.
// Returns the matches to show and the new verdicts to store.
export async function checkWorkItem(work, flags, settings) {
  const matches = await matchWork(work);
  if (!settings.useAi || !matches.length) return { matches, judged: {} };

  const stored = storedVerdicts(work, matches, flags);
  const stale = matches.filter((m) => !stored[m.decision.ref]).map((m) => m.decision);
  const judged = {};
  for (const [ref, v] of Object.entries(await judge(work, stale))) {
    judged[ref] = { ...v, verdictKey: verdictKey(work, stale.find((d) => d.ref === ref)) };
  }
  return { matches: applyVerdicts(matches, { ...stored, ...judged }), judged };
}
