import kvs, { Sort, WhereConditions } from '@forge/kvs';
import { findMatches } from './matcher';

// Decisions live in the custom entity store, keyed by their ref ("D-12").
const ENTITY = 'decision';
const SEQ_KEY = 'seq:decision';
export const STATUSES = ['active', 'replaced', 'expired'];

const nowIso = () => new Date().toISOString();
const today = () => nowIso().slice(0, 10);

// The entity store rejects empty strings, so drop blank fields before writing.
function clean(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    if (typeof v === 'string' && !v.trim()) continue;
    out[k] = typeof v === 'string' ? v.trim() : v;
  }
  return out;
}

export function parseKeywords(value) {
  const list = Array.isArray(value) ? value : String(value || '').split(/[,;\n]/);
  return [...new Set(list.map((k) => String(k).trim().toLowerCase()).filter(Boolean))].slice(0, 12);
}

async function nextRef() {
  const n = ((await kvs.get(SEQ_KEY)) || 0) + 1;
  await kvs.set(SEQ_KEY, n);
  return { ref: `D-${n}`, number: n };
}

export async function getDecision(ref) {
  if (!ref) return null;
  const value = await kvs.entity(ENTITY).get(String(ref).trim().toUpperCase());
  return value || null;
}

async function queryAll(build, max = 1000) {
  const out = [];
  let cursor;
  do {
    let q = build().limit(100);
    if (cursor) q = q.cursor(cursor);
    const page = await q.getMany();
    out.push(...page.results.map((r) => r.value));
    cursor = page.nextCursor;
  } while (cursor && out.length < max);
  return out;
}

export async function listDecisions({ status, query } = {}) {
  const all = await queryAll(() =>
    status
      ? kvs.entity(ENTITY).query().index('by-status', { partition: [status] }).sort(Sort.DESC)
      : kvs.entity(ENTITY).query().index('by-created').sort(Sort.DESC)
  );
  const q = String(query || '').trim().toLowerCase();
  if (!q) return all;
  return all.filter((d) =>
    [d.ref, d.title, d.rationale, ...(d.keywords || [])].some((f) => String(f || '').toLowerCase().includes(q))
  );
}

export async function listBySource(sourceKey) {
  if (!sourceKey) return [];
  return queryAll(() =>
    kvs.entity(ENTITY).query().index('by-source', { partition: [String(sourceKey)] }).sort(Sort.DESC)
  );
}

export async function listDueForReview(withinDays = 30) {
  const limit = new Date(Date.now() + withinDays * 864e5).toISOString().slice(0, 10);
  const active = await listDecisions({ status: 'active' });
  return active
    .filter((d) => d.reviewBy && d.reviewBy <= limit)
    .sort((a, b) => a.reviewBy.localeCompare(b.reviewBy));
}

export async function createDecision(input, accountId) {
  if (!input?.title?.trim()) throw new Error('A decision needs a title.');
  const { ref, number } = await nextRef();
  const at = nowIso();
  const decision = clean({
    ref,
    number,
    title: input.title,
    rationale: input.rationale,
    status: 'active',
    keywords: parseKeywords(input.keywords),
    projectKeys: parseKeywords(input.projectKeys).map((k) => k.toUpperCase()),
    ownerAccountId: input.ownerAccountId || accountId,
    createdBy: accountId,
    decidedOn: input.decidedOn || today(),
    reviewBy: input.reviewBy,
    sourceType: input.sourceType || 'manual',
    sourceKey: input.sourceKey,
    sourceTitle: input.sourceTitle,
    sourceUrl: input.sourceUrl,
    createdAt: at,
    updatedAt: at,
    caughtCount: 0,
    followedCount: 0,
    reopenCount: 0,
    history: [{ at, by: accountId, action: 'logged' }],
  });
  await kvs.entity(ENTITY).set(ref, decision);
  return decision;
}

const EDITABLE = ['title', 'rationale', 'keywords', 'projectKeys', 'ownerAccountId', 'decidedOn', 'reviewBy'];

export async function updateDecision(ref, patch, accountId) {
  const current = await getDecision(ref);
  if (!current) throw new Error(`No decision ${ref}.`);
  const next = { ...current };
  for (const field of EDITABLE) {
    if (!(field in patch)) continue;
    if (field === 'keywords') next.keywords = parseKeywords(patch.keywords);
    else if (field === 'projectKeys') next.projectKeys = parseKeywords(patch.projectKeys).map((k) => k.toUpperCase());
    else next[field] = patch[field];
  }
  next.updatedAt = nowIso();
  next.history = [...(current.history || []), { at: next.updatedAt, by: accountId, action: 'edited' }].slice(-50);
  const saved = clean(next);
  await kvs.entity(ENTITY).set(current.ref, saved);
  return saved;
}

export async function setStatus(ref, status, { replacedBy, note } = {}, accountId) {
  if (!STATUSES.includes(status)) throw new Error(`Status must be one of: ${STATUSES.join(', ')}.`);
  const current = await getDecision(ref);
  if (!current) throw new Error(`No decision ${ref}.`);
  if (replacedBy && !(await getDecision(replacedBy))) throw new Error(`No decision ${replacedBy}.`);
  const at = nowIso();
  const saved = clean({
    ...current,
    status,
    replacedBy: status === 'replaced' ? replacedBy : undefined,
    updatedAt: at,
    history: [...(current.history || []), { at, by: accountId, action: status, note, replacedBy }].slice(-50),
  });
  await kvs.entity(ENTITY).set(current.ref, saved);
  return saved;
}

// Kept after a review: a new review date, and the review recorded in its history.
export async function keepDecision(ref, nextReviewBy, note, accountId) {
  const current = await getDecision(ref);
  if (!current) throw new Error(`No decision ${ref}.`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(nextReviewBy || '') || nextReviewBy <= today()) {
    throw new Error('Pick a next review date after today.');
  }
  const at = nowIso();
  const saved = clean({
    ...current,
    reviewBy: nextReviewBy,
    lastReviewedOn: today(),
    updatedAt: at,
    history: [...(current.history || []), { at, by: accountId, action: 'kept', note }].slice(-50),
  });
  await kvs.entity(ENTITY).set(current.ref, saved);
  return saved;
}

// A review work item was opened for the decision's current review date.
export async function markReminded(ref, issueKey) {
  const current = await getDecision(ref);
  if (!current) return null;
  const saved = {
    ...current,
    reminderFor: current.reviewBy,
    reviewIssueKey: issueKey,
    history: [...(current.history || []), { at: nowIso(), action: 'review opened', note: issueKey }].slice(-50),
  };
  await kvs.entity(ENTITY).set(current.ref, saved);
  return saved;
}

// Work items Precedent opened to review a decision: { ref, for, outcome }.
const reviewKey = (issueKey) => `review:${issueKey}`;

export async function getReview(issueKey) {
  return (await kvs.get(reviewKey(issueKey))) || null;
}

export async function saveReview(issueKey, review) {
  await kvs.set(reviewKey(issueKey), review);
}

export async function bumpCounter(ref, field, historyEntry) {
  const current = await getDecision(ref);
  if (!current) return null;
  const saved = { ...current, [field]: (current[field] || 0) + 1 };
  if (historyEntry) saved.history = [...(current.history || []), clean(historyEntry)].slice(-50);
  await kvs.entity(ENTITY).set(current.ref, saved);
  return saved;
}

export async function matchWork(work) {
  const active = await listDecisions({ status: 'active' });
  return findMatches(active, work);
}

export async function putDecision(decision) {
  await kvs.entity(ENTITY).set(decision.ref, clean(decision));
}

// Per work item: which decisions were already flagged, and how people responded.
const flagKey = (issueKey) => `flags:${issueKey}`;

export async function listAllFlags() {
  const out = [];
  let cursor;
  do {
    let q = kvs.query().where('key', WhereConditions.beginsWith('flags:')).limit(100);
    if (cursor) q = q.cursor(cursor);
    const page = await q.getMany();
    out.push(...page.results.map((r) => ({ issueKey: r.key.slice('flags:'.length), flags: r.value })));
    cursor = page.nextCursor;
  } while (cursor);
  return out;
}

export async function getFlags(issueKey) {
  return (await kvs.get(flagKey(issueKey))) || {};
}

export async function saveFlags(issueKey, flags) {
  await kvs.set(flagKey(issueKey), flags);
}

// Merges into what is stored, so a response saved at the same moment is kept.
export async function saveVerdicts(issueKey, judged) {
  const flags = await getFlags(issueKey);
  for (const [ref, v] of Object.entries(judged)) flags[ref] = { ...flags[ref], ...v };
  await saveFlags(issueKey, flags);
}

// Sample decisions from a small phone case store, so a fresh site can try the Guard.
const SAMPLES = [
  {
    title: 'No free shipping on orders under $40',
    rationale: 'Print and postage costs went up in September. Orders under $40 lose money when shipping is free.',
    keywords: 'free shipping, shipping threshold, shipping promo',
    reviewDays: 60,
  },
  {
    title: 'MagSafe cases stay with our current print partner',
    rationale: 'Other suppliers we tested had magnet alignment problems and more returns.',
    keywords: 'magsafe, supplier, print partner',
    reviewDays: 120,
  },
  {
    title: 'First product image is always a lifestyle shot',
    rationale: 'Lifestyle first images got more clicks than plain product shots in our August test.',
    keywords: 'product photo, first image, lifestyle shot, product image',
    reviewDays: 90,
  },
  {
    title: 'Refunds over $100 need a second approver',
    rationale: 'Two chargebacks last quarter came from large refunds approved by one person.',
    keywords: 'refund, chargeback, refund approval',
    reviewDays: 14,
  },
];

export async function addSamples(accountId) {
  const existing = new Set((await listDecisions()).map((d) => d.title));
  const added = [];
  for (const s of SAMPLES) {
    if (existing.has(s.title)) continue;
    const reviewBy = new Date(Date.now() + s.reviewDays * 864e5).toISOString().slice(0, 10);
    added.push(
      await createDecision(
        { ...s, reviewBy, sourceType: 'sample', sourceTitle: 'Sample data' },
        accountId
      )
    );
  }
  return added;
}

const DEFAULT_SETTINGS = {
  commentOnConflict: true,
  commentOnPossible: false,
  useAi: false,
  reviewReminders: true,
  reviewProjectKey: '',
};

export async function getSettings() {
  return { ...DEFAULT_SETTINGS, ...((await kvs.get('settings')) || {}) };
}

export async function saveSettings(settings) {
  const next = {
    commentOnConflict: Boolean(settings.commentOnConflict),
    commentOnPossible: Boolean(settings.commentOnPossible),
    useAi: Boolean(settings.useAi),
    reviewReminders: Boolean(settings.reviewReminders),
    reviewProjectKey: String(settings.reviewProjectKey || '').trim().toUpperCase(),
  };
  if (next.reviewProjectKey && !/^[A-Z][A-Z0-9_]+$/.test(next.reviewProjectKey)) {
    throw new Error('The review project should be a project key, for example OPS.');
  }
  await kvs.set('settings', next);
  return next;
}
