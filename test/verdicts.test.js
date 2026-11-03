import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPrompt, parseVerdicts, verdictKey, MODEL } from '../src/lib/verdicts.js';
import { findMatches, applyVerdicts, isConflict } from '../src/lib/matcher.js';

const shipping = {
  ref: 'D-1',
  status: 'active',
  title: 'No free shipping on orders under $40',
  rationale: 'Print costs went up.',
  keywords: ['free shipping', 'shipping threshold'],
  updatedAt: '2026-10-01T00:00:00.000Z',
};
const photos = {
  ref: 'D-3',
  status: 'active',
  title: 'First product image is always a lifestyle shot',
  keywords: ['product photo', 'first image', 'lifestyle shot'],
};

const toolResponse = (args) => ({
  choices: [
    {
      finish_reason: 'tool_use',
      message: { role: 'assistant', content: '', tool_calls: [{ id: '1', type: 'function', index: 0, function: { name: 'record_verdicts', arguments: args } }] },
    },
  ],
});

test('prompt lists each decision and fences the work item text', () => {
  const prompt = buildPrompt({ key: 'MKT-1', summary: 'Black Friday: free shipping on everything' }, [shipping, photos]);
  assert.equal(prompt.model, MODEL);
  assert.equal(prompt.temperature, undefined, 'newer models reject temperature');
  const user = prompt.messages[1].content;
  assert.match(user, /- D-1: No free shipping on orders under \$40\n {2}Why: Print costs went up\./);
  assert.match(user, /- D-3: First product image/);
  assert.match(user, /<work>\nBlack Friday: free shipping on everything\n<\/work>/);
  assert.equal(prompt.tool_choice.function.name, 'record_verdicts');
});

test('reads verdicts from a tool call, as an object or a JSON string', () => {
  const args = { verdicts: [{ ref: 'd-1', verdict: 'Conflicts', reason: 'Everything includes orders under $40.' }] };
  const expected = { 'D-1': { verdict: 'conflicts', reason: 'Everything includes orders under $40.' } };
  assert.deepEqual(parseVerdicts(toolResponse(args), ['D-1']), expected);
  assert.deepEqual(parseVerdicts(toolResponse(JSON.stringify(args)), ['D-1']), expected);
});

test('falls back to JSON in the message text', () => {
  const response = {
    choices: [{ message: { role: 'assistant', content: [{ type: 'text', text: 'Here: {"verdicts":[{"ref":"D-1","verdict":"fits","reason":"Over $40 only."}]}' }] } }],
  };
  assert.deepEqual(parseVerdicts(response, ['D-1']), { 'D-1': { verdict: 'fits', reason: 'Over $40 only.' } });
});

test('drops refs it did not ask about, unknown verdicts and broken replies', () => {
  const args = {
    verdicts: [
      { ref: 'D-9', verdict: 'conflicts', reason: 'Made up.' },
      { ref: 'D-1', verdict: 'maybe', reason: 'Not a verdict.' },
    ],
  };
  assert.deepEqual(parseVerdicts(toolResponse(args), ['D-1']), {});
  assert.deepEqual(parseVerdicts({ choices: [{ message: { content: 'no json here' } }] }, ['D-1']), {});
  assert.deepEqual(parseVerdicts(undefined, ['D-1']), {});
});

test('verdict key changes when the work text or the decision changes', () => {
  const work = { summary: 'Free shipping over $50' };
  const key = verdictKey(work, shipping);
  assert.equal(key, verdictKey({ ...work }, { ...shipping }));
  assert.notEqual(key, verdictKey({ summary: 'Free shipping on everything' }, shipping));
  assert.notEqual(key, verdictKey(work, { ...shipping, title: 'No free shipping on orders under $30' }));
  assert.notEqual(key, verdictKey(work, { ...shipping, rationale: 'Costs changed.' }));
  assert.equal(key, verdictKey(work, { ...shipping, updatedAt: '2026-11-01T00:00:00.000Z', reviewBy: '2027-01-01' }));
});

test('a fitting promo is no longer a conflict, and unrelated matches disappear', () => {
  const work = { summary: 'Black Friday: free shipping on orders over $50, new product photo' };
  const matches = findMatches([shipping, photos], work);
  assert.equal(matches.length, 2);
  assert.ok(isConflict(matches[0]), 'keywords alone call it a likely conflict');

  const judged = applyVerdicts(matches, {
    'D-1': { verdict: 'fits', reason: 'Only orders over $50 ship free.' },
    'D-3': { verdict: 'unrelated', reason: 'Not about the first image.' },
  });
  assert.equal(judged.length, 1);
  assert.equal(judged[0].verdict, 'fits');
  assert.equal(judged[0].reason, 'Only orders over $50 ship free.');
  assert.equal(isConflict(judged[0]), false);
});

test('conflicts sort ahead of everything else', () => {
  const work = { summary: 'Free shipping on everything, product photo refresh' };
  const judged = applyVerdicts(findMatches([shipping, photos], work), {
    'D-1': { verdict: 'fits', reason: 'x' },
    'D-3': { verdict: 'conflicts', reason: 'y' },
  });
  assert.deepEqual(
    judged.map((m) => m.decision.ref),
    ['D-3', 'D-1']
  );
});
