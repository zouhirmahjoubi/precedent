import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addDays,
  dueForReminder,
  reviewProject,
  nextReviewDate,
  record,
  reviewSummary,
  reviewDescription,
  reopenSummary,
  reopenDescription,
  outcomeComment,
} from '../src/lib/review.js';

const today = '2026-11-03';
const base = { status: 'active', decidedOn: '2026-09-04', reviewBy: '2026-11-03' };

test('adds days across months', () => {
  assert.equal(addDays('2026-11-03', 90), '2027-02-01');
  assert.equal(addDays('2026-01-31', 1), '2026-02-01');
});

test('a decision is due on its review date, once per date', () => {
  const decisions = [
    { ...base, ref: 'D-1' },
    { ...base, ref: 'D-2', reviewBy: '2026-10-20' },
    { ...base, ref: 'D-3', reviewBy: '2026-11-04' },
    { ...base, ref: 'D-4', reminderFor: '2026-11-03' },
    { ...base, ref: 'D-5', status: 'expired' },
    { ...base, ref: 'D-6', reviewBy: undefined },
  ];
  assert.deepEqual(
    dueForReminder(decisions, today).map((d) => d.ref),
    ['D-2', 'D-1']
  );
});

test('a kept decision is due again on its new date', () => {
  const kept = { ...base, ref: 'D-4', reminderFor: '2026-11-03', reviewBy: '2027-02-01' };
  assert.deepEqual(dueForReminder([kept], today), []);
  assert.deepEqual(
    dueForReminder([kept], '2027-02-01').map((d) => d.ref),
    ['D-4']
  );
});

test('review work items go to the settings project, the source project, then the decision project', () => {
  const fromJira = { sourceType: 'jira', sourceKey: 'MKT-12', projectKeys: ['OPS'] };
  assert.equal(reviewProject(fromJira, { reviewProjectKey: 'TEAM' }), 'TEAM');
  assert.equal(reviewProject(fromJira, {}), 'MKT');
  assert.equal(reviewProject({ sourceType: 'confluence', sourceKey: '98304', projectKeys: ['OPS'] }, {}), 'OPS');
  assert.equal(reviewProject({ sourceType: 'sample' }, {}), null);
});

test('the next review keeps the last gap, within 30 to 365 days', () => {
  assert.equal(nextReviewDate({ decidedOn: '2026-09-04', reviewBy: '2026-11-03' }, today), addDays(today, 60));
  assert.equal(nextReviewDate({ decidedOn: '2026-10-30', reviewBy: '2026-11-03' }, today), addDays(today, 30));
  assert.equal(nextReviewDate({ decidedOn: '2024-01-01', reviewBy: '2026-11-03' }, today), addDays(today, 365));
  assert.equal(nextReviewDate({}, today), addDays(today, 90));
  assert.equal(
    nextReviewDate({ decidedOn: '2026-01-01', lastReviewedOn: '2026-08-05', reviewBy: '2026-11-03' }, today),
    addDays(today, 90)
  );
});

test('the record reads plainly', () => {
  assert.equal(
    record({ decidedOn: '2026-09-04', caughtCount: 3, followedCount: 1, reopenCount: 1 }),
    'Decided Sep 4, 2026. Since then it flagged new work 3 times, was followed once, and got 1 reopen request.'
  );
  assert.match(record({ decidedOn: '2026-09-04' }), /0 times, was followed 0 times, and got 0 reopen requests\.$/);
});

test('the review work item names the decision and mentions the owner', () => {
  const d = {
    ...base,
    ref: 'D-1',
    title: 'No free shipping on orders under $40',
    rationale: 'Print costs went up.',
    ownerAccountId: 'owner-1',
    sourceUrl: 'https://example.atlassian.net/browse/MKT-1',
  };
  assert.equal(reviewSummary(d), 'Review decision D-1: No free shipping on orders under $40');
  assert.equal(reviewSummary({ ref: 'D-2', title: 'x'.repeat(400) }).length, 250);
  const json = JSON.stringify(reviewDescription(d));
  assert.match(json, /"id":"owner-1"/);
  assert.match(json, /D-1 is due for review/);
  assert.match(json, /Print costs went up/);
  assert.match(json, /"href":"https:\/\/example.atlassian.net\/browse\/MKT-1"/);
});

test('the reopen work item names who asked, what changed and where', () => {
  const d = { ...base, ref: 'D-1', title: 'No free shipping on orders under $40', rationale: 'Print costs went up.', ownerAccountId: 'owner-1' };
  assert.equal(reopenSummary(d), 'Reopen decision D-1: No free shipping on orders under $40');
  const json = JSON.stringify(reopenDescription(d, 'MKT-12', 'acc-9', 'Carrier rates dropped 15%.'));
  assert.match(json, /"id":"acc-9"/);
  assert.match(json, /asks to reopen D-1 for MKT-12/);
  assert.match(json, /"id":"owner-1"/);
  assert.match(json, /What changed/);
  assert.match(json, /Carrier rates dropped 15%/);
  assert.match(json, /posted back on MKT-12/);
  const own = JSON.stringify(reopenDescription({ ...d, ownerAccountId: 'acc-9' }, 'MKT-12', 'acc-9'));
  assert.doesNotMatch(own, /What changed/);
  assert.equal((own.match(/"id":"acc-9"/g) || []).length, 1, 'the owner is not asked to mention themselves');
});

test('the outcome comment says what happened', () => {
  const d = { ref: 'D-1' };
  const say = (outcome) => JSON.stringify(outcomeComment(d, outcome, 'acc-1'));
  assert.match(say({ action: 'keep', nextReviewBy: '2027-02-01' }), /kept D-1\. Next review: Feb 1, 2027\./);
  assert.match(say({ action: 'replace', replacedBy: 'D-7' }), /replaced D-1 with D-7/);
  assert.match(say({ action: 'expire', note: 'Shipping costs dropped.' }), /let D-1 expire.*Shipping costs dropped/);
});
