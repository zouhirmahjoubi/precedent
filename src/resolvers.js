import Resolver from '@forge/resolver';
import {
  listDecisions,
  listBySource,
  listDueForReview,
  getDecision,
  createDecision,
  updateDecision,
  setStatus,
  bumpCounter,
  getFlags,
  saveFlags,
  saveVerdicts,
  getReview,
  getSettings,
  saveSettings,
  addSamples,
} from './lib/decisions';
import { getWorkItem, addComment, getSiteUrl } from './lib/jira';
import { getPage } from './lib/confluence';
import { checkWorkItem } from './lib/check';
import { nextReviewDate, isoDay } from './lib/review';
import { runReviewReminders, recordReview } from './reviews';
import { doc, paragraph, strong, text, mention } from './lib/adf';

const resolver = new Resolver();
const ADMIN_MODULE = 'precedent-settings';

function assertCanChange(decision, context) {
  const { accountId, moduleKey } = context;
  if (moduleKey === ADMIN_MODULE) return;
  if (decision.ownerAccountId === accountId || decision.createdBy === accountId) return;
  throw new Error('Only the decision owner can change it. Ask them to reopen it instead.');
}

resolver.define('listDecisions', ({ payload }) => listDecisions(payload));

resolver.define('getOverview', async () => {
  const [all, due] = await Promise.all([listDecisions(), listDueForReview(30)]);
  const active = all.filter((d) => d.status === 'active');
  return {
    decisions: all,
    due: due.map((d) => d.ref),
    stats: {
      active: active.length,
      due: due.length,
      caught: all.reduce((n, d) => n + (d.caughtCount || 0), 0),
      followed: all.reduce((n, d) => n + (d.followedCount || 0), 0),
    },
  };
});

resolver.define('getDecision', ({ payload }) => getDecision(payload.ref));

resolver.define('saveDecision', async ({ payload, context }) => {
  const { ref, ...fields } = payload;
  if (!ref) return createDecision(fields, context.accountId);
  const current = await getDecision(ref);
  if (!current) throw new Error(`No decision ${ref}.`);
  assertCanChange(current, context);
  return updateDecision(ref, fields, context.accountId);
});

resolver.define('setStatus', async ({ payload, context }) => {
  const current = await getDecision(payload.ref);
  if (!current) throw new Error(`No decision ${payload.ref}.`);
  assertCanChange(current, context);
  return setStatus(payload.ref, payload.status, payload, context.accountId);
});

// Work item view: decisions this work touches, and decisions logged from it.
// A review work item shows the decision under review instead of matches.
resolver.define('getWorkItemView', async ({ context }) => {
  const issueKey = context.extension.issue.key;
  const review = await getReview(issueKey);
  if (review) {
    const [decision, fromHere] = await Promise.all([getDecision(review.ref), listBySource(issueKey)]);
    return {
      review: { ...review, decision, suggestedNext: decision && nextReviewDate(decision, isoDay(Date.now())) },
      matches: [],
      fromHere,
    };
  }
  const [work, settings, flags, fromHere] = await Promise.all([
    getWorkItem(issueKey),
    getSettings(),
    getFlags(issueKey),
    listBySource(issueKey),
  ]);
  const { matches, judged } = await checkWorkItem(work, flags, settings);
  if (Object.keys(judged).length) await saveVerdicts(issueKey, judged);
  return {
    work: { key: work.key, summary: work.summary, projectKey: work.projectKey },
    matches: matches.map((m) => ({
      decision: m.decision,
      strength: m.strength,
      matchedKeywords: m.matchedKeywords,
      matchedWords: m.matchedWords,
      verdict: m.verdict,
      reason: m.reason,
      response: flags[m.decision.ref]?.response,
    })),
    fromHere,
  };
});

function reopenComment(decision, accountId, note) {
  const owner = decision.ownerAccountId;
  const asks =
    !owner || owner === accountId
      ? [mention(accountId), text(' asks to reopen ')]
      : [mention(accountId), text(' asks '), mention(owner), text(' to reopen ')];
  return doc(
    paragraph(strong('Precedent: '), ...asks, text(`${decision.ref} "${decision.title}" for this work.`)),
    ...(note ? [paragraph(strong('What changed: '), text(note))] : [])
  );
}

resolver.define('respond', async ({ payload, context }) => {
  const issueKey = context.extension.issue.key;
  const { ref, response, note } = payload;
  if (!['follow', 'reopen', 'unrelated', 'undo'].includes(response)) throw new Error('Unknown response.');
  const decision = await getDecision(ref);
  if (!decision) throw new Error(`No decision ${ref}.`);

  const at = new Date().toISOString();
  const flags = await getFlags(issueKey);
  flags[ref] = { ...(flags[ref] || {}), response: response === 'undo' ? undefined : response, by: context.accountId, at };
  await saveFlags(issueKey, flags);

  if (response === 'follow') {
    await bumpCounter(ref, 'followedCount', { at, by: context.accountId, action: 'followed', note: issueKey });
  }
  if (response === 'reopen') {
    await bumpCounter(ref, 'reopenCount', {
      at,
      by: context.accountId,
      action: 'reopen requested',
      note: note ? `${issueKey}: ${note}` : issueKey,
    });
    await addComment(issueKey, reopenComment(decision, context.accountId, note));
  }
  return flags[ref];
});

resolver.define('review', async ({ payload, context }) => {
  const issueKey = context.extension.issue.key;
  const review = await getReview(issueKey);
  if (!review) throw new Error('This work item is not a decision review.');
  const decision = await getDecision(review.ref);
  if (!decision) throw new Error(`No decision ${review.ref}.`);
  assertCanChange(decision, context);
  return recordReview(issueKey, payload, context.accountId);
});

resolver.define('getSourceContext', async ({ context }) => {
  const ext = context.extension || {};
  if (ext.issue?.key) {
    const [work, siteUrl] = await Promise.all([getWorkItem(ext.issue.key), getSiteUrl()]);
    return {
      sourceType: 'jira',
      sourceKey: work.key,
      sourceTitle: work.summary,
      sourceUrl: siteUrl ? `${siteUrl}/browse/${work.key}` : undefined,
      projectKey: work.projectKey,
    };
  }
  const pageId = ext.content?.id;
  if (pageId) {
    const page = await getPage(pageId);
    return { sourceType: 'confluence', sourceKey: String(page.id), sourceTitle: page.title, sourceUrl: page.url };
  }
  return { sourceType: 'manual' };
});

resolver.define('listForPage', async ({ context }) => {
  const pageId = context.extension?.content?.id;
  return listBySource(pageId);
});

resolver.define('getSettings', () => getSettings());

resolver.define('addSamples', async ({ context }) => {
  if (context.moduleKey !== ADMIN_MODULE) throw new Error('Samples can only be added from the admin page.');
  return (await addSamples(context.accountId)).map((d) => d.ref);
});

resolver.define('runReviews', ({ context }) => {
  if (context.moduleKey !== ADMIN_MODULE) throw new Error('Reviews can only be run from the admin page.');
  return runReviewReminders();
});

resolver.define('saveSettings', ({ payload, context }) => {
  if (context.moduleKey !== ADMIN_MODULE) throw new Error('Settings can only be changed from the admin page.');
  return saveSettings(payload);
});

export const handler = resolver.getDefinitions();
