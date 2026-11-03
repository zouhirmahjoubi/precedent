import { pageDecisions } from './lib/page';
import { bylineTitle } from './lib/suggest';

// Sets the byline item's title under a page heading: how many of the page's
// decisions are logged, and how many are still waiting to be logged.
export async function bylineProps(payload) {
  try {
    const { logged, items } = await pageDecisions(payload?.extension?.content?.id);
    return bylineTitle(logged.length, items.length);
  } catch (e) {
    console.warn(`Precedent: could not set the byline title. ${e.message}`);
    return {};
  }
}
