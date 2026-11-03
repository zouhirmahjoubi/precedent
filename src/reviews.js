import {
  listDecisions,
  getSettings,
  markReminded,
  keepDecision,
  setStatus,
  getReview,
  saveReview,
} from './lib/decisions';
import { createWorkItem, closeWorkItem, addComment } from './lib/jira';
import {
  dueForReminder,
  reviewProject,
  reviewSummary,
  reviewDescription,
  reopenSummary,
  reopenDescription,
  outcomeComment,
  isoDay,
} from './lib/review';

const MAX_PER_RUN = 20;

// The review work item still waiting for the owner's answer, if any.
async function pendingReviewOf(decision) {
  if (!decision.reviewIssueKey) return null;
  const review = await getReview(decision.reviewIssueKey);
  return review && !review.outcome ? decision.reviewIssueKey : null;
}

// Daily, and from the Run now button in settings: open a review work item,
// assigned to the owner, for each decision whose review date has come.
export async function runReviewReminders() {
  const settings = await getSettings();
  if (!settings.reviewReminders) return { off: true, opened: [], skipped: [] };

  const due = dueForReminder(await listDecisions({ status: 'active' }), isoDay(Date.now()));
  const opened = [];
  const skipped = [];
  for (const d of due.slice(0, MAX_PER_RUN)) {
    const projectKey = reviewProject(d, settings);
    if (!projectKey) {
      skipped.push({ ref: d.ref, reason: 'no project' });
      continue;
    }
    const pending = await pendingReviewOf(d);
    if (pending) {
      skipped.push({ ref: d.ref, reason: `a review is already open in ${pending}` });
      continue;
    }
    try {
      const issueKey = await createWorkItem({
        projectKey,
        summary: reviewSummary(d),
        description: reviewDescription(d),
        assigneeAccountId: d.ownerAccountId,
      });
      await saveReview(issueKey, { ref: d.ref, for: d.reviewBy });
      await markReminded(d.ref, issueKey);
      opened.push({ ref: d.ref, issueKey });
    } catch (e) {
      console.warn(`Precedent: could not open a review for ${d.ref}. ${e.message}`);
      skipped.push({ ref: d.ref, reason: e.message });
    }
  }
  return { opened, skipped };
}

export async function sendReviewReminders() {
  await runReviewReminders();
}

// Someone asked to reopen a decision from a work item: open a review for the
// owner, unless one is already waiting. Returns the review work item's key.
export async function openReopenReview(decision, fromKey, accountId, note) {
  const pending = await pendingReviewOf(decision);
  if (pending) return pending;
  const settings = await getSettings();
  const projectKey = reviewProject(decision, settings) || fromKey.split('-')[0];
  const issueKey = await createWorkItem({
    projectKey,
    summary: reopenSummary(decision),
    description: reopenDescription(decision, fromKey, accountId, note),
    assigneeAccountId: decision.ownerAccountId,
  });
  await saveReview(issueKey, { ref: decision.ref, kind: 'reopen', from: fromKey, note: note || undefined });
  await markReminded(decision.ref, issueKey);
  return issueKey;
}

// The owner's answer on a review work item: keep, replace or expire.
export async function recordReview(issueKey, { action, nextReviewBy, replacedBy, note }, accountId) {
  const review = await getReview(issueKey);
  if (!review) throw new Error('This work item is not a decision review.');
  if (review.outcome) throw new Error('This review already has an outcome.');
  const cleanNote = String(note || '').trim() || undefined;

  if (action === 'replace' && (!replacedBy || replacedBy === review.ref)) {
    throw new Error('Pick the decision that replaces this one.');
  }

  let decision;
  if (action === 'keep') decision = await keepDecision(review.ref, nextReviewBy, cleanNote, accountId);
  else if (action === 'replace') decision = await setStatus(review.ref, 'replaced', { replacedBy, note: cleanNote }, accountId);
  else if (action === 'expire') decision = await setStatus(review.ref, 'expired', { note: cleanNote }, accountId);
  else throw new Error('Unknown review outcome.');

  const outcome = {
    action,
    at: new Date().toISOString(),
    nextReviewBy: action === 'keep' ? decision.reviewBy : undefined,
    replacedBy: decision.replacedBy,
  };
  const comment = outcomeComment(decision, { ...outcome, note: cleanNote }, accountId);
  await addComment(issueKey, comment);
  // A reopen request gets its answer where it was asked.
  if (review.from) {
    await addComment(review.from, comment).catch((e) =>
      console.warn(`Precedent: could not post the outcome on ${review.from}. ${e.message}`)
    );
  }
  outcome.closed = await closeWorkItem(issueKey).catch(() => false);
  await saveReview(issueKey, { ...review, outcome });
  return { ...review, outcome };
}
