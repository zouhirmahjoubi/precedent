import { getWorkItem, addComment } from './lib/jira';
import { getFlags, saveFlags, getSettings, bumpCounter } from './lib/decisions';
import { checkWorkItem } from './lib/check';
import { guardStep } from './lib/flags';
import { doc, paragraph, strong, text, mention, link, bulletList } from './lib/adf';

const WATCHED_FIELDS = new Set(['summary', 'description']);

function decisionLine(match) {
  const d = match.decision;
  const line = [strong(`${d.ref} ${d.title}`)];
  if (match.reason) line.push(text(` ${match.reason}`));
  if (d.rationale) line.push(text(` Why: ${d.rationale}`));
  if (d.ownerAccountId) line.push(text(' Owner: '), mention(d.ownerAccountId), text('.'));
  if (!match.reason && match.matchedKeywords.length) line.push(text(` Matched: ${match.matchedKeywords.join(', ')}.`));
  if (d.sourceUrl) line.push(text(' '), link('Where it was decided', d.sourceUrl));
  return line;
}

export function guardComment(matches) {
  const many = matches.length > 1;
  const verb = matches.every((m) => m.verdict === 'conflicts') ? 'goes against' : 'touches';
  return doc(
    paragraph(
      strong('Precedent: '),
      text(many ? `this work ${verb} ${matches.length} active decisions.` : `this work ${verb} an active decision.`)
    ),
    bulletList(matches.map(decisionLine)),
    paragraph(text('Open Precedent on this work item to follow the decision or ask the owner to reopen it.'))
  );
}

// Runs on work item created and updated.
export async function onWorkItemChanged(event) {
  if (event.selfGenerated) return;
  const issueKey = event.issue?.key;
  if (!issueKey) return;

  if (event.eventType === 'avi:jira:updated:issue') {
    const items = event.changelog?.items || [];
    if (!items.some((i) => WATCHED_FIELDS.has(i.field) || WATCHED_FIELDS.has(i.fieldId))) return;
  }

  const [work, settings, flags] = await Promise.all([getWorkItem(issueKey), getSettings(), getFlags(issueKey)]);
  const { matches, judged } = await checkWorkItem(work, flags, settings);
  if (!matches.length && !Object.keys(judged).length) return;

  const step = guardStep(flags, matches, judged, settings, new Date().toISOString());
  for (const m of step.caught) await bumpCounter(m.decision.ref, 'caughtCount');
  await saveFlags(issueKey, step.flags);

  if (step.toComment.length) await addComment(issueKey, guardComment(step.toComment));
}
