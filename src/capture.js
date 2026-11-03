import { getWorkItem, addComment } from './lib/jira';
import { listDecisions, getSettings, getReview, getSuggestion, saveSuggestion } from './lib/decisions';
import { hasDecisionCue, fallbackSuggestion } from './lib/suggest';
import { extractDecision } from './lib/judge';
import { findMatches } from './lib/matcher';
import { doc, paragraph, strong, text } from './lib/adf';

function nudge(found) {
  return doc(
    paragraph(
      strong('Precedent: '),
      text(
        `this looks like a decision: "${found.title}". Open Precedent on this work item to log it, so new work is checked against it.`
      )
    )
  );
}

// Runs when a comment is added or edited. Most comments stop at the phrase check.
export async function onComment(event) {
  if (event.selfGenerated) return;
  const issueKey = event.issue?.key;
  const commentId = event.comment?.id && String(event.comment.id);
  if (!issueKey || !commentId) return;

  const settings = await getSettings();
  if (!settings.suggestFromComments) return;
  // Review work items have their own Keep, Replace and Let it expire buttons.
  if (await getReview(issueKey)) return;

  const work = await getWorkItem(issueKey);
  const comment = work.comments.find((c) => String(c.id) === commentId);
  if (!comment || /^Precedent:/.test(comment.body) || !hasDecisionCue(comment.body)) return;

  const current = await getSuggestion(issueKey);
  if (current?.commentId === commentId && current.status !== 'pending') return;

  const found = settings.useAi ? await extractDecision(work, comment) : fallbackSuggestion(comment.body);
  if (!found) return;

  // Already logged? Point at the existing decision instead of nudging.
  const active = await listDecisions({ status: 'active' });
  const similar = findMatches(active, {
    projectKey: work.projectKey,
    summary: `${found.title}\n${found.rationale || ''}\n${(found.keywords || []).join(', ')}`,
  }).find((m) => m.strength === 'strong');

  const nudged = Boolean(current?.nudged);
  await saveSuggestion(issueKey, {
    commentId,
    ...found,
    similar: similar ? { ref: similar.decision.ref, title: similar.decision.title } : undefined,
    status: 'pending',
    at: new Date().toISOString(),
    nudged: nudged || !similar,
  });
  if (!nudged && !similar) await addComment(issueKey, nudge(found));
}
