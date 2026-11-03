// Rovo actions. The same actions back the Precedent agent, its skills,
// and the rovo:mcp tools that outside agents (Claude, Cursor) call.
import {
  listDecisions,
  listDueForReview,
  getDecision,
  createDecision,
  setStatus,
  matchWork,
} from './lib/decisions';
import { findMatches } from './lib/matcher';
import { getWorkItem, getSiteUrl } from './lib/jira';
import { displayName } from './lib/users';

// Never trust an account ID passed as an input: the model can make one up.
function callerId(context) {
  return context?.principal?.accountId || context?.accountId;
}

async function brief(d) {
  return {
    ref: d.ref,
    title: d.title,
    why: d.rationale,
    status: d.status,
    owner: await displayName(d.ownerAccountId),
    decidedOn: d.decidedOn,
    daysSinceDecided: d.decidedOn ? Math.floor((Date.now() - Date.parse(d.decidedOn)) / 864e5) : undefined,
    reviewBy: d.reviewBy,
    keywords: d.keywords,
    projects: d.projectKeys?.length ? d.projectKeys : 'all',
    source: d.sourceUrl || d.sourceKey,
    replacedBy: d.replacedBy,
    timesCaught: d.caughtCount || 0,
    timesFollowed: d.followedCount || 0,
    reopenRequests: d.reopenCount || 0,
  };
}

const briefs = (list) => Promise.all(list.map(brief));

function fail(message) {
  return { error: message };
}

export async function findDecisions(payload) {
  const status = payload.status ? String(payload.status).toLowerCase() : 'active';
  const list = await listDecisions({ status: status === 'all' ? undefined : status, query: payload.query });
  if (!list.length) return { decisions: [], note: 'No logged decisions match. Do not guess one.' };
  return { decisions: await briefs(list.slice(0, 20)), total: list.length };
}

export async function getDecisionAction(payload) {
  const d = await getDecision(payload.ref);
  if (!d) return fail(`No decision ${payload.ref}.`);
  return { decision: await brief(d), history: d.history };
}

export async function checkWork(payload) {
  let work;
  if (payload.issueKey) {
    work = await getWorkItem(String(payload.issueKey).toUpperCase());
  } else if (payload.text) {
    work = { summary: String(payload.text) };
  } else {
    return fail('Pass a Jira work item key or the text of the plan to check.');
  }
  const matches = payload.issueKey ? await matchWork(work) : findMatches(await listDecisions({ status: 'active' }), work);
  if (!matches.length) return { checked: work.key || 'text', matches: [], note: 'No active decision touches this work.' };
  return {
    checked: work.key || 'text',
    matches: await Promise.all(
      matches.map(async (m) => ({
        strength: m.strength,
        matched: m.matchedKeywords.length ? m.matchedKeywords : m.matchedWords,
        decision: await brief(m.decision),
      }))
    ),
  };
}

export async function logDecision(payload, context) {
  const accountId = callerId(context);
  if (!payload.title || !payload.rationale) return fail('A decision needs a title and a reason.');
  let source = { sourceType: 'rovo' };
  if (payload.sourceIssueKey) {
    const key = String(payload.sourceIssueKey).toUpperCase();
    const [work, siteUrl] = await Promise.all([getWorkItem(key), getSiteUrl()]);
    source = { sourceType: 'jira', sourceKey: work.key, sourceTitle: work.summary, sourceUrl: `${siteUrl}/browse/${work.key}` };
  }
  const d = await createDecision(
    {
      title: payload.title,
      rationale: payload.rationale,
      keywords: payload.keywords,
      projectKeys: payload.projectKeys,
      reviewBy: payload.reviewBy,
      ...source,
    },
    accountId
  );
  return { logged: await brief(d) };
}

export async function changeDecisionStatus(payload, context) {
  const accountId = callerId(context);
  const d = await getDecision(payload.ref);
  if (!d) return fail(`No decision ${payload.ref}.`);
  if (d.ownerAccountId !== accountId && d.createdBy !== accountId) {
    return fail(`Only the owner (${await displayName(d.ownerAccountId)}) can change ${d.ref}.`);
  }
  try {
    const saved = await setStatus(d.ref, String(payload.status).toLowerCase(), payload, accountId);
    return { updated: await brief(saved) };
  } catch (e) {
    return fail(e.message);
  }
}

export async function listDueReviews(payload) {
  const days = Number(payload.withinDays) > 0 ? Number(payload.withinDays) : 30;
  const due = await listDueForReview(days);
  return { withinDays: days, decisions: await briefs(due) };
}

export async function getWorkItemDiscussion(payload) {
  if (!payload.issueKey) return fail('Pass a Jira work item key.');
  const work = await getWorkItem(String(payload.issueKey).toUpperCase());
  return {
    key: work.key,
    summary: work.summary,
    description: work.description,
    comments: work.comments.slice(-40),
  };
}
