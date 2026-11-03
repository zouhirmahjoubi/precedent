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
  getSuggestion,
  saveSuggestion,
  setItemSkipped,
  getSettings,
  saveSettings,
  addSamples,
} from './lib/decisions';
import { getWorkItem, addComment, getSiteUrl } from './lib/jira';
import { getPage } from './lib/confluence';
import { checkWorkItem } from './lib/check';
import { nextReviewDate, isoDay } from './lib/review';
import { runReviewReminders, recordReview, openReopenReview } from './reviews';
import { draftFromItem } from './lib/suggest';
import { pageDecisions } from './lib/page';
import { draftPageDecision } from './lib/judge';
import { doc, paragraph, strong, text, mention, decisionItems } from './lib/adf';

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
  const { ref, fromSuggestion, ...fields } = payload;
  if (!ref) {
    const created = await createDecision(fields, context.accountId);
    // Logged from a suggestion card: mark that suggestion done.
    const issueKey = context.extension?.issue?.key;
    if (fromSuggestion && issueKey) {
      const suggestion = await getSuggestion(issueKey);
      if (suggestion?.commentId === fromSuggestion) {
        await saveSuggestion(issueKey, { ...suggestion, status: 'logged', ref: created.ref });
      }
    }
    return created;
  }
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
  const [work, settings, flags, fromHere, suggestion, siteUrl] = await Promise.all([
    getWorkItem(issueKey),
    getSettings(),
    getFlags(issueKey),
    listBySource(issueKey),
    getSuggestion(issueKey),
    getSiteUrl(),
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
      reviewIssueKey: flags[m.decision.ref]?.reviewIssueKey,
    })),
    fromHere,
    suggestion: suggestion?.status === 'pending' ? suggestion : null,
    siteUrl,
  };
});

resolver.define('dismissSuggestion', async ({ context }) => {
  const issueKey = context.extension.issue.key;
  const suggestion = await getSuggestion(issueKey);
  if (suggestion) await saveSuggestion(issueKey, { ...suggestion, status: 'dismissed' });
});

function reopenComment(decision, accountId, note, reviewKey) {
  const owner = decision.ownerAccountId;
  const asks =
    !owner || owner === accountId
      ? [mention(accountId), text(' asks to reopen ')]
      : [mention(accountId), text(' asks '), mention(owner), text(' to reopen ')];
  return doc(
    paragraph(strong('Precedent: '), ...asks, text(`${decision.ref} "${decision.title}" for this work.`)),
    ...(note ? [paragraph(strong('What changed: '), text(note))] : []),
    ...(reviewKey
      ? [paragraph(text(`Precedent opened ${reviewKey} for the owner to decide. The answer will be posted here.`))]
      : [])
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
    const counted = await bumpCounter(ref, 'reopenCount', {
      at,
      by: context.accountId,
      action: 'reopen requested',
      note: note ? `${issueKey}: ${note}` : issueKey,
    });
    let reviewKey = null;
    try {
      reviewKey = await openReopenReview(counted || decision, issueKey, context.accountId, note);
    } catch (e) {
      console.warn(`Precedent: could not open a review for ${ref}. ${e.message}`);
    }
    if (reviewKey) {
      flags[ref].reviewIssueKey = reviewKey;
      await saveFlags(issueKey, flags);
    }
    await addComment(issueKey, reopenComment(decision, context.accountId, note, reviewKey));
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

// Decisions logged from this Confluence page, and the page's own decision
// items (typed with /decision) that nobody has logged yet.
resolver.define('getPageDecisions', ({ context }) => pageDecisions(context.extension?.content?.id));

// Skip a decision item on the page, or bring it back.
resolver.define('skipPageItem', ({ payload, context }) =>
  setItemSkipped(String(context.extension.content.id), String(payload.localId), payload.skip !== false)
);

// The log form's starting values for one decision item. With AI on, the model
// writes the rule, reason and keywords from the page; otherwise the item's own words.
resolver.define('draftPageDecision', async ({ payload, context }) => {
  const pageId = context.extension?.content?.id;
  const [page, settings] = await Promise.all([getPage(pageId, { withBody: true }), getSettings()]);
  const item = decisionItems(page.adf).find((i) => i.localId === payload.localId);
  if (!item) throw new Error('That decision is no longer on the page.');
  const plain = draftFromItem(item);
  const drafted = settings.useAi ? await draftPageDecision(page, item) : null;
  return {
    title: drafted?.title || plain.title,
    rationale: drafted?.rationale || plain.rationale,
    keywords: drafted?.keywords?.length ? drafted.keywords : plain.keywords,
    sourceItemId: item.localId,
  };
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
