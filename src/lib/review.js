// Pure helpers for review reminders: which decisions are due, where their
// review work item goes, and what it and its outcome comment say.
import { doc, paragraph, strong, text, mention, link } from './adf.js';

const DAY = 864e5;
const DEFAULT_INTERVAL_DAYS = 90;

export const isoDay = (date) => new Date(date).toISOString().slice(0, 10);
export const addDays = (day, n) => isoDay(Date.parse(`${day}T12:00:00Z`) + n * DAY);

export function formatDay(day) {
  if (!day) return '';
  return new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Active decisions whose review date has come and that have no reminder for that date yet.
export function dueForReminder(decisions, today) {
  return decisions
    .filter((d) => d.status === 'active' && d.reviewBy && d.reviewBy <= today && d.reminderFor !== d.reviewBy)
    .sort((a, b) => a.reviewBy.localeCompare(b.reviewBy));
}

// The project set in Precedent settings, else the project of the work item
// the decision came from, else the first project it applies to.
export function reviewProject(decision, settings) {
  if (settings.reviewProjectKey) return settings.reviewProjectKey;
  if (decision.sourceType === 'jira' && decision.sourceKey) return decision.sourceKey.split('-')[0];
  return decision.projectKeys?.[0] || null;
}

// Keeps the gap the team chose last time (decision or last review to review date), within 30 to 365 days.
export function nextReviewDate(decision, today) {
  const from = decision.lastReviewedOn || decision.decidedOn;
  let days = DEFAULT_INTERVAL_DAYS;
  if (from && decision.reviewBy) days = Math.round((Date.parse(decision.reviewBy) - Date.parse(from)) / DAY);
  return addDays(today, Math.min(365, Math.max(30, days || DEFAULT_INTERVAL_DAYS)));
}

const times = (n = 0) => (n === 1 ? 'once' : `${n} times`);

export function record(d) {
  const reopens = d.reopenCount || 0;
  return (
    `Decided ${formatDay(d.decidedOn)}. Since then it flagged new work ${times(d.caughtCount)}, ` +
    `was followed ${times(d.followedCount)}, and got ${reopens} reopen request${reopens === 1 ? '' : 's'}.`
  );
}

export function reviewSummary(d) {
  return `Review decision ${d.ref}: ${d.title}`.slice(0, 250);
}

export function reviewDescription(d) {
  const ask = d.ownerAccountId
    ? [mention(d.ownerAccountId), text(', keep it, replace it, or let it expire.')]
    : [text('Keep it, replace it, or let it expire.')];
  return doc(
    paragraph(strong('Precedent: '), text(`${d.ref} is due for review. `), ...ask),
    paragraph(strong(d.title)),
    ...(d.rationale ? [paragraph(strong('Why: '), text(d.rationale))] : []),
    paragraph(text(record(d))),
    ...(d.sourceUrl ? [paragraph(link(d.sourceTitle ? `Where it was decided: ${d.sourceTitle}` : 'Where it was decided', d.sourceUrl))] : []),
    paragraph(text('Open Precedent on this work item to record the outcome.'))
  );
}

export function outcomeComment(d, { action, nextReviewBy, replacedBy, note }, accountId) {
  const what = {
    keep: `kept ${d.ref}. Next review: ${formatDay(nextReviewBy)}.`,
    replace: `replaced ${d.ref} with ${replacedBy}. ${d.ref} no longer flags new work.`,
    expire: `let ${d.ref} expire. It no longer flags new work.`,
  }[action];
  return doc(
    paragraph(strong('Precedent: '), mention(accountId), text(` ${what}`)),
    ...(note ? [paragraph(strong('Note: '), text(note))] : [])
  );
}
