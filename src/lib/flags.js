// What the Guard does with a work item's matches: which decisions to count as
// caught, which to comment on, and the flags to store. Pure, so it can be tested.
import { isConflict } from './matcher.js';

// Flags written before verdicts existed have a strength but no checkedAt.
// Those were already counted, and commented on when strong.
function upgrade(flag) {
  if (!flag.strength || flag.checkedAt) return flag;
  return { ...flag, caughtAt: flag.at, commentedAt: flag.strength === 'strong' ? flag.at : undefined };
}

// Each decision is counted once per work item, and commented on once, the
// first time the work goes against it. Work that fits is neither.
export function guardStep(flags, matches, judged, settings, at) {
  const next = { ...flags };
  for (const [ref, v] of Object.entries(judged)) next[ref] = { ...next[ref], ...v };

  const caught = [];
  const toComment = [];
  for (const m of matches) {
    const ref = m.decision.ref;
    const prev = upgrade(next[ref] || {});
    const flag = { ...prev, strength: m.strength, matchedKeywords: m.matchedKeywords, checkedAt: at };
    if (m.verdict !== 'fits' && !prev.caughtAt) {
      flag.caughtAt = at;
      caught.push(m);
    }
    const wanted = isConflict(m) || (m.verdict !== 'fits' && settings.commentOnPossible);
    if (settings.commentOnConflict && wanted && !prev.commentedAt) {
      flag.commentedAt = at;
      toComment.push(m);
    }
    next[ref] = flag;
  }
  return { flags: next, caught, toComment };
}
