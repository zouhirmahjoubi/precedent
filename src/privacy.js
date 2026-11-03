import { privacy } from '@forge/api';
import { listDecisions, putDecision, listAllFlags, saveFlags } from './lib/decisions';
import { collectAccounts, scrubDecision, scrubFlags } from './lib/accounts';

// Weekly: report the account IDs Precedent stores to Atlassian, and remove
// any account Atlassian says was closed.
export async function reportAccounts() {
  const [decisions, flagRows] = await Promise.all([listDecisions(), listAllFlags()]);
  const accounts = collectAccounts(
    decisions,
    flagRows.map((r) => r.flags)
  );
  const updates = await privacy.reportPersonalData(accounts);
  const closed = new Set(updates.filter((u) => u.status === 'closed').map((u) => u.accountId));
  if (!closed.size) return { reported: accounts.length, erased: 0 };

  for (const d of decisions) {
    const next = scrubDecision(d, closed);
    if (next) await putDecision(next);
  }
  for (const { issueKey, flags } of flagRows) {
    const next = scrubFlags(flags, closed);
    if (next) await saveFlags(issueKey, next);
  }
  return { reported: accounts.length, erased: closed.size };
}
