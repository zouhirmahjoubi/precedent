import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  hasDecisionCue,
  fallbackSuggestion,
  buildExtractPrompt,
  parseExtract,
  draftFromItem,
  unloggedItems,
  buildPageDraftPrompt,
  bylineTitle,
} from '../src/lib/suggest.js';
import { decisionItems } from '../src/lib/adf.js';

// A Confluence meeting notes page with two decisions, one still undecided.
const page = {
  type: 'doc',
  version: 1,
  content: [
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Decisions' }] },
    {
      type: 'decisionList',
      attrs: { localId: 'list-1' },
      content: [
        {
          type: 'decisionItem',
          attrs: { localId: 'd-1', state: 'DECIDED' },
          content: [{ type: 'text', text: 'Gift wrap is free on orders over $60 because the wrap costs us $2.10' }],
        },
        {
          type: 'decisionItem',
          attrs: { localId: 'd-2', state: 'DECIDED' },
          content: [
            { type: 'text', text: 'Holiday returns run to ' },
            { type: 'text', text: 'January 31', marks: [{ type: 'strong' }] },
          ],
        },
        { type: 'decisionItem', attrs: { localId: 'd-3', state: 'UNDECIDED' }, content: [{ type: 'text', text: 'Maybe' }] },
        { type: 'decisionItem', attrs: { localId: 'd-4', state: 'DECIDED' }, content: [] },
      ],
    },
  ],
};

test('finds decided decision items on a page, in order', () => {
  assert.deepEqual(decisionItems(page), [
    { localId: 'd-1', text: 'Gift wrap is free on orders over $60 because the wrap costs us $2.10' },
    { localId: 'd-2', text: 'Holiday returns run to January 31' },
  ]);
  assert.deepEqual(decisionItems(null), []);
});

test('a page decision without AI keeps its words and splits off the reason', () => {
  assert.deepEqual(draftFromItem({ text: 'gift wrap is free on orders over $60 because the wrap costs us $2.10' }), {
    title: 'Gift wrap is free on orders over $60',
    rationale: 'The wrap costs us $2.10.',
    keywords: [],
  });
  assert.equal(draftFromItem({ text: 'Holiday returns run to January 31.' }).title, 'Holiday returns run to January 31');
});

test('skips page decisions already logged, by item ID or by wording', () => {
  const items = decisionItems(page);
  assert.equal(unloggedItems(items, []).length, 2);
  assert.deepEqual(
    unloggedItems(items, [{ sourceItemId: 'd-1', title: 'Free gift wrap over $60' }]).map((i) => i.localId),
    ['d-2']
  );
  assert.deepEqual(
    unloggedItems(items, [{ title: 'Holiday returns run to January 31' }]).map((i) => i.localId),
    ['d-1']
  );
});

test('the byline title counts logged and waiting decisions', () => {
  assert.equal(bylineTitle(0, 0).title, 'Decisions');
  assert.equal(bylineTitle(0, 2).title, '2 decisions to log');
  assert.equal(bylineTitle(1, 0).title, '1 decision logged');
  assert.equal(bylineTitle(2, 1).title, '2 logged, 1 to log');
  assert.equal(bylineTitle(2, 1).tooltip, '2 decisions logged from this page, 1 still to log.');
});

test('the page prompt fences the page and the decision', () => {
  const prompt = buildPageDraftPrompt({ title: 'November pricing sync', text: 'Notes...' }, { text: 'Holiday returns run to January 31' });
  const user = prompt.messages[1].content;
  assert.match(user, /^Page: November pricing sync\n<page>\nNotes\.\.\.\n<\/page>\n<decision>\nHoliday returns run to January 31\n<\/decision>$/);
  assert.equal(prompt.tool_choice.function.name, 'record_decision');
});

test('spots decision phrases and ignores ordinary comments', () => {
  for (const text of [
    'OK, decided: no free shipping under $40.',
    'We agreed to keep the current print partner.',
    'Going forward, the first image is a lifestyle shot.',
    "We won't stop offering gift wrap.",
    "Let's go with the matte finish for all Pixel cases.",
  ]) {
    assert.ok(hasDecisionCue(text), text);
  }
  for (const text of ['Can someone check the shipping costs?', 'Uploaded the new mockups.', 'I think we should decide later.']) {
    assert.ok(!hasDecisionCue(text), text);
  }
});

test('turns the decision sentence into a rule and a reason', () => {
  assert.deepEqual(
    fallbackSuggestion('Thanks all. OK, decided: no free shipping on orders under $40 because print costs went up in September. Closing this.'),
    { title: 'No free shipping on orders under $40', rationale: 'Print costs went up in September.', keywords: [] }
  );
  assert.deepEqual(fallbackSuggestion('We agreed to keep MagSafe cases with our current print partner.'), {
    title: 'We agreed to keep MagSafe cases with our current print partner',
    rationale: '',
    keywords: [],
  });
});

test('gives up on comments without a usable rule', () => {
  assert.equal(fallbackSuggestion('Sounds good to me.'), null);
  assert.equal(fallbackSuggestion('Decided: yes.'), null);
});

const work = {
  key: 'MKT-7',
  summary: 'Holiday shipping promo',
  description: 'Should we offer free shipping in December?',
  comments: [
    { id: '1', author: 'Sam', created: '2026-09-02T10:00:00Z', body: 'Print costs went up 18%.' },
    { id: '2', author: 'Ana', created: '2026-09-03T10:00:00Z', body: 'Decided: no free shipping under $40.' },
  ],
};

test('the prompt fences the thread and marks the latest comment', () => {
  const prompt = buildExtractPrompt(work, work.comments[1]);
  const user = prompt.messages[1].content;
  assert.match(user, /Work item MKT-7: Holiday shipping promo/);
  assert.match(user, /<thread>\n\[Sam, 2026-09-02\]: Print costs went up 18%\.\n<\/thread>/);
  assert.match(user, /<latest>\n\[Ana, 2026-09-03\]: Decided: no free shipping under \$40\.\n<\/latest>/);
  assert.equal(prompt.tool_choice.function.name, 'record_decision');
});

const reply = (args) => ({ choices: [{ message: { role: 'assistant', content: '', tool_calls: [{ function: { arguments: args } }] } }] });

test('reads the decision the model found', () => {
  const found = parseExtract(
    reply({
      found: true,
      title: 'No free shipping on orders under $40.',
      rationale: 'Print costs went up 18%.',
      keywords: ['Free shipping', 'shipping threshold', 'free shipping'],
    })
  );
  assert.deepEqual(found, {
    title: 'No free shipping on orders under $40',
    rationale: 'Print costs went up 18%.',
    keywords: ['free shipping', 'shipping threshold'],
  });
  assert.deepEqual(parseExtract(reply(JSON.stringify({ found: true, title: 'Use matte finish', keywords: 'matte, finish' }))).keywords, [
    'matte',
    'finish',
  ]);
  assert.deepEqual(parseExtract(reply({ found: true, title: 'x', keywords: '["holiday returns", "return window"]' })).keywords, [
    'holiday returns',
    'return window',
  ]);
});

test('returns nothing when the model found no decision or replied badly', () => {
  assert.equal(parseExtract(reply({ found: false })), null);
  assert.equal(parseExtract(reply({ found: true, title: '  ' })), null);
  assert.equal(parseExtract({ choices: [{ message: { content: 'not json' } }] }), null);
  assert.equal(parseExtract(undefined), null);
});
