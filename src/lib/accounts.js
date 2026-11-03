// Pure helpers for personal data reporting: which account IDs Precedent
// stores, and how to remove a closed account from a record.

function note(seen, accountId, at) {
  if (!accountId) return;
  const prev = seen.get(accountId);
  if (!prev || (at && at > prev)) seen.set(accountId, at || prev || new Date(0).toISOString());
}

// decisions: decision records; flagSets: values stored under flags:<issueKey>
export function collectAccounts(decisions, flagSets = []) {
  const seen = new Map();
  for (const d of decisions) {
    note(seen, d.ownerAccountId, d.updatedAt);
    note(seen, d.createdBy, d.createdAt);
    for (const h of d.history || []) note(seen, h.by, h.at);
  }
  for (const flags of flagSets) {
    for (const f of Object.values(flags || {})) note(seen, f.by, f.at);
  }
  return [...seen].map(([accountId, updatedAt]) => ({ accountId, updatedAt }));
}

// Returns the decision without any reference to closed accounts, or null if nothing changed.
export function scrubDecision(decision, closed) {
  let changed = false;
  const next = { ...decision };
  for (const field of ['ownerAccountId', 'createdBy']) {
    if (closed.has(next[field])) {
      delete next[field];
      changed = true;
    }
  }
  next.history = (decision.history || []).map((h) => {
    if (!closed.has(h.by)) return h;
    changed = true;
    const { by, ...rest } = h;
    return rest;
  });
  return changed ? next : null;
}

export function scrubFlags(flags, closed) {
  let changed = false;
  const next = {};
  for (const [ref, f] of Object.entries(flags || {})) {
    if (closed.has(f.by)) {
      const { by, ...rest } = f;
      next[ref] = rest;
      changed = true;
    } else {
      next[ref] = f;
    }
  }
  return changed ? next : null;
}
