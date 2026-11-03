import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stem, tokenize, scoreDecision, findMatches } from '../src/lib/matcher.js';

const shipping = {
  id: 'D-1',
  status: 'active',
  title: 'No free shipping on orders under $40',
  keywords: ['free shipping', 'shipping threshold'],
};
const supplier = {
  id: 'D-2',
  status: 'active',
  title: 'MagSafe cases stay with our current print partner',
  keywords: ['magsafe', 'supplier', 'print partner'],
};
const photos = {
  id: 'D-3',
  status: 'active',
  title: 'First product image is always a lifestyle shot',
  keywords: ['product photo', 'first image', 'lifestyle shot'],
};
const all = [shipping, supplier, photos];

test('stem joins common word forms', () => {
  assert.equal(stem('shipping'), stem('ship'));
  assert.equal(stem('shipped'), stem('ships'));
  assert.equal(stem('pricing'), stem('price'));
  assert.equal(stem('photos'), stem('photo'));
  assert.equal(stem('$40'), '$40');
});

test('tokenize drops stopwords and short words', () => {
  assert.deepEqual(
    tokenize('Add free shipping on everything').map((t) => t.word),
    ['free', 'shipping', 'everything']
  );
});

test('flags the Black Friday promo against the shipping decision', () => {
  const r = scoreDecision(shipping, 'Black Friday: free shipping on everything');
  assert.equal(r.strength, 'strong');
  assert.deepEqual(r.matchedKeywords, ['free shipping']);
});

test('matches a phrase written in a different order', () => {
  const r = scoreDecision(shipping, 'Make shipping free for the weekend sale');
  assert.equal(r.strength, 'strong');
});

test('does not flag unrelated work that shares one word', () => {
  assert.equal(scoreDecision(shipping, 'Ship the new homepage hero').strength, 'none');
  assert.equal(scoreDecision(shipping, 'Fix typo on About page').strength, 'none');
});

test('finds the supplier decision and ranks it first', () => {
  const matches = findMatches(all, {
    key: 'OPS-7',
    projectKey: 'OPS',
    summary: 'Move MagSafe cases to a cheaper supplier',
    description: 'Gelato quoted lower base prices.',
  });
  assert.equal(matches[0].decision.id, 'D-2');
  assert.equal(matches.length, 1);
});

test('skips replaced decisions, the source item and other projects', () => {
  const work = { key: 'MKT-1', projectKey: 'MKT', summary: 'Free shipping weekend' };
  assert.equal(findMatches([{ ...shipping, status: 'replaced' }], work).length, 0);
  assert.equal(findMatches([{ ...shipping, sourceKey: 'MKT-1' }], work).length, 0);
  assert.equal(findMatches([{ ...shipping, projectKeys: ['OPS'] }], work).length, 0);
  assert.equal(findMatches([{ ...shipping, projectKeys: ['MKT'] }], work).length, 1);
});

test('reads the description, not just the summary', () => {
  const matches = findMatches(all, {
    key: 'MKT-9',
    projectKey: 'MKT',
    summary: 'Christmas collection launch',
    description: 'New product photos for every case, first image on white background.',
  });
  assert.equal(matches[0].decision.id, 'D-3');
});
