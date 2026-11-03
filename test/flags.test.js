import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guardStep } from '../src/lib/flags.js';

const settings = { commentOnConflict: true, commentOnPossible: false };
const decision = { ref: 'D-1', title: 'No free shipping on orders under $40' };
const match = (extra) => ({ decision, strength: 'strong', matchedKeywords: ['free shipping'], ...extra });
const refs = (list) => list.map((m) => m.decision.ref);

test('keyword mode: counts and comments on a strong match once', () => {
  const first = guardStep({}, [match()], {}, settings, 't1');
  assert.deepEqual(refs(first.caught), ['D-1']);
  assert.deepEqual(refs(first.toComment), ['D-1']);
  assert.equal(first.flags['D-1'].caughtAt, 't1');

  const again = guardStep(first.flags, [match()], {}, settings, 't2');
  assert.deepEqual(again.caught, []);
  assert.deepEqual(again.toComment, []);
  assert.equal(again.flags['D-1'].checkedAt, 't2');
});

test('keyword mode: a weaker match is counted but stays quiet', () => {
  const step = guardStep({}, [match({ strength: 'possible' })], {}, settings, 't1');
  assert.deepEqual(refs(step.caught), ['D-1']);
  assert.deepEqual(step.toComment, []);
  const loud = guardStep({}, [match({ strength: 'possible' })], {}, { ...settings, commentOnPossible: true }, 't1');
  assert.deepEqual(refs(loud.toComment), ['D-1']);
});

test('AI mode: work that fits is left alone, then flagged once it is edited to break the rule', () => {
  const verdict = { verdict: 'fits', reason: 'Over $50 only.', verdictKey: 'k1' };
  const fits = guardStep({}, [match(verdict)], { 'D-1': verdict }, settings, 't1');
  assert.deepEqual(fits.caught, []);
  assert.deepEqual(fits.toComment, []);
  assert.equal(fits.flags['D-1'].verdict, 'fits');

  const conflict = { verdict: 'conflicts', reason: 'Everything includes small orders.', verdictKey: 'k2' };
  const edited = guardStep(fits.flags, [match(conflict)], { 'D-1': conflict }, settings, 't2');
  assert.deepEqual(refs(edited.caught), ['D-1']);
  assert.deepEqual(refs(edited.toComment), ['D-1']);
  assert.equal(edited.flags['D-1'].verdictKey, 'k2');
});

test('AI mode: an unclear match is counted quietly, and still gets its comment when it turns into a conflict', () => {
  const unclear = { verdict: 'unclear', reason: 'No amount given.', verdictKey: 'k1' };
  const first = guardStep({}, [match(unclear)], { 'D-1': unclear }, settings, 't1');
  assert.deepEqual(refs(first.caught), ['D-1']);
  assert.deepEqual(first.toComment, []);

  const conflict = { verdict: 'conflicts', reason: 'Free shipping on everything.', verdictKey: 'k2' };
  const second = guardStep(first.flags, [match(conflict)], { 'D-1': conflict }, settings, 't2');
  assert.deepEqual(second.caught, [], 'not counted twice');
  assert.deepEqual(refs(second.toComment), ['D-1']);
});

test('stores verdicts for decisions the AI called unrelated, so they are not judged again', () => {
  const step = guardStep({}, [], { 'D-3': { verdict: 'unrelated', reason: 'x', verdictKey: 'k' } }, settings, 't1');
  assert.equal(step.flags['D-3'].verdict, 'unrelated');
});

test('flags from before verdicts are not counted or commented again', () => {
  const legacy = { 'D-1': { strength: 'strong', matchedKeywords: ['free shipping'], at: 't0' } };
  const step = guardStep(legacy, [match()], {}, settings, 't1');
  assert.deepEqual(step.caught, []);
  assert.deepEqual(step.toComment, []);
  assert.equal(step.flags['D-1'].caughtAt, 't0');
});

test('keeps how people responded, and stays quiet when comments are off', () => {
  const flags = { 'D-1': { response: 'follow', by: 'acc-1', at: 't0' } };
  const step = guardStep(flags, [match()], {}, { ...settings, commentOnConflict: false }, 't1');
  assert.equal(step.flags['D-1'].response, 'follow');
  assert.deepEqual(refs(step.caught), ['D-1']);
  assert.deepEqual(step.toComment, []);
});
