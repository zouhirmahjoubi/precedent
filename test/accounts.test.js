import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectAccounts, scrubDecision, scrubFlags } from '../src/lib/accounts.js';

const decision = {
  ref: 'D-1',
  ownerAccountId: 'owner',
  createdBy: 'creator',
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-05T00:00:00.000Z',
  history: [
    { at: '2026-10-01T00:00:00.000Z', by: 'creator', action: 'logged' },
    { at: '2026-10-09T00:00:00.000Z', by: 'reader', action: 'followed', note: 'MKT-1' },
  ],
};

test('collects every stored account once, with its latest date', () => {
  const accounts = collectAccounts([decision], [{ 'D-1': { by: 'reader', at: '2026-10-20T00:00:00.000Z' } }]);
  const byId = Object.fromEntries(accounts.map((a) => [a.accountId, a.updatedAt]));
  assert.deepEqual(Object.keys(byId).sort(), ['creator', 'owner', 'reader']);
  assert.equal(byId.reader, '2026-10-20T00:00:00.000Z');
  assert.equal(byId.creator, '2026-10-01T00:00:00.000Z');
});

test('removes a closed account from owner, creator and history', () => {
  const next = scrubDecision(decision, new Set(['creator']));
  assert.equal(next.createdBy, undefined);
  assert.equal(next.ownerAccountId, 'owner');
  assert.equal(next.history[0].by, undefined);
  assert.equal(next.history[0].action, 'logged');
  assert.equal(next.history[1].by, 'reader');
});

test('leaves untouched records alone', () => {
  assert.equal(scrubDecision(decision, new Set(['someone-else'])), null);
  assert.equal(scrubFlags({ 'D-1': { by: 'reader' } }, new Set(['someone-else'])), null);
});

test('removes a closed account from work item flags', () => {
  const next = scrubFlags({ 'D-1': { by: 'reader', response: 'follow' } }, new Set(['reader']));
  assert.deepEqual(next, { 'D-1': { response: 'follow' } });
});
