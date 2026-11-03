// Scores a piece of work (summary + description) against decisions.
// Deterministic on purpose: it is the cheap first pass on every edit, and
// the matched terms double as the explanation when no AI verdict is used.

const STOPWORDS = new Set(
  (
    'a an and are as at be but by can do does for from has have how i if in into is it its ' +
    'let new no not of on or our out over so than that the their them then there these they ' +
    'this to too under up us was we were what when where which who why will with you your ' +
    'all any each every more most other some such only own same just also very should would ' +
    'could must need needs make made get got add use used using via per about after before ' +
    'task todo item work page team plan ticket issue story'
  ).split(' ')
);

export function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9$%\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Light suffix stripping so "shipping", "shipped" and "ships" meet at "ship".
export function stem(word) {
  let w = word;
  if (w.length <= 3 || /\d/.test(w)) return w;
  if (w.endsWith('ies') && w.length > 4) w = w.slice(0, -3) + 'y';
  else if (/(ch|sh|x|ss)es$/.test(w)) w = w.slice(0, -2);
  else if (w.endsWith('s') && !w.endsWith('ss')) w = w.slice(0, -1);
  if (w.endsWith('ing') && w.length > 5) w = w.slice(0, -3);
  else if (w.endsWith('ed') && w.length > 4) w = w.slice(0, -2);
  if (/([b-df-hj-np-tv-z])\1$/.test(w) && !w.endsWith('ss')) w = w.slice(0, -1);
  if (w.endsWith('e') && w.length > 3) w = w.slice(0, -1);
  return w;
}

// Returns [{ stem, word }] for every meaningful word, in order.
export function tokenize(text) {
  return normalize(text)
    .split(' ')
    .filter((w) => w && !STOPWORDS.has(w) && (w.length > 2 || /\d/.test(w)))
    .map((word) => ({ stem: stem(word), word }));
}

function phraseFound(phraseStems, textStems) {
  if (!phraseStems.length) return false;
  const window = phraseStems.length + 2;
  for (let i = 0; i < textStems.length; i++) {
    if (!phraseStems.includes(textStems[i])) continue;
    const slice = textStems.slice(i, i + window);
    if (phraseStems.every((s) => slice.includes(s))) return true;
  }
  return false;
}

export function scoreDecision(decision, text) {
  const textTokens = tokenize(text);
  const textStems = textTokens.map((t) => t.stem);
  const textSet = new Set(textStems);

  const matchedKeywords = [];
  for (const keyword of decision.keywords || []) {
    const stems = tokenize(keyword).map((t) => t.stem);
    if (phraseFound(stems, textStems)) matchedKeywords.push(keyword);
  }

  const decisionStems = new Set(
    [decision.title, ...(decision.keywords || [])].flatMap((t) => tokenize(t).map((x) => x.stem))
  );
  const overlap = [];
  for (const t of textTokens) {
    if (decisionStems.has(t.stem) && !overlap.some((o) => o.stem === t.stem)) overlap.push(t);
  }

  const score = matchedKeywords.length * 3 + overlap.length;
  let strength = 'none';
  if (matchedKeywords.length && score >= 4) strength = 'strong';
  else if (matchedKeywords.length || overlap.length >= 3) strength = 'possible';

  return {
    strength,
    score,
    matchedKeywords,
    matchedWords: overlap.map((o) => o.word),
    touches: textSet.size > 0 && strength !== 'none',
  };
}

// work: { key, projectKey, summary, description }
export function findMatches(decisions, work) {
  const text = `${work.summary || ''}\n${work.description || ''}`;
  return decisions
    .filter((d) => d.status === 'active')
    .filter((d) => !d.sourceKey || d.sourceKey !== work.key)
    .filter((d) => !d.projectKeys?.length || d.projectKeys.includes(work.projectKey))
    .map((d) => ({ decision: d, ...scoreDecision(d, text) }))
    .filter((m) => m.strength !== 'none')
    .sort((a, b) => b.score - a.score);
}

// With an AI verdict, only "conflicts" counts. Without one, the keyword strength decides.
export function isConflict(match) {
  return match.verdict ? match.verdict === 'conflicts' : match.strength === 'strong';
}

const RANK = { conflicts: 0, unclear: 2, fits: 4 };
const rank = (m) => (m.verdict ? RANK[m.verdict] : m.strength === 'strong' ? 1 : 3);

// verdicts: { [ref]: { verdict, reason } }. Unrelated matches are dropped, conflicts sort first.
export function applyVerdicts(matches, verdicts) {
  return matches
    .map((m) => {
      const v = verdicts[m.decision.ref];
      return v ? { ...m, verdict: v.verdict, reason: v.reason } : m;
    })
    .filter((m) => m.verdict !== 'unrelated')
    .sort((a, b) => rank(a) - rank(b) || b.score - a.score);
}
