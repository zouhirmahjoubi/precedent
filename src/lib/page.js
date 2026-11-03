import { getPage } from './confluence';
import { listBySource, getPageState } from './decisions';
import { decisionItems } from './adf';
import { unloggedItems } from './suggest';

// Decisions logged from a Confluence page, the page's own decision items
// (typed with /decision) that nobody has logged yet, and the ones the team
// chose to skip. Only pages are read, so a blog post or a space lists its
// logged decisions and no items.
export async function pageDecisions(contentId) {
  const id = String(contentId || '');
  if (!id) return { logged: [], items: [], skipped: [] };
  const [page, logged, state] = await Promise.all([
    getPage(id, { withBody: true }).catch((e) => {
      console.warn(`Precedent: ${e.message}`);
      return null;
    }),
    listBySource(id),
    getPageState(id),
  ]);
  const open = page ? unloggedItems(decisionItems(page.adf), logged) : [];
  const skippedIds = new Set(state.skipped || []);
  return {
    logged,
    items: open.filter((i) => !skippedIds.has(i.localId)),
    skipped: open.filter((i) => skippedIds.has(i.localId)),
  };
}
