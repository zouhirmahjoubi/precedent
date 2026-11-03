import api, { route } from '@forge/api';
import { adfToText } from './adf';

// Reads as the viewing user when there is one, since a site can keep apps out
// of a space while its members read it, and as the app otherwise.
async function read(path) {
  let last;
  for (const as of [() => api.asUser(), () => api.asApp()]) {
    try {
      const res = await as().requestConfluence(path);
      if (res.ok) return res;
      last = new Error(`Confluence answered ${res.status}`);
    } catch (e) {
      last = e;
    }
  }
  throw last;
}

// With withBody, also the page content as ADF and as plain text.
export async function getPage(pageId, { withBody = false } = {}) {
  const path = withBody
    ? route`/wiki/api/v2/pages/${pageId}?body-format=atlas_doc_format`
    : route`/wiki/api/v2/pages/${pageId}`;
  let page;
  try {
    page = await (await read(path)).json();
  } catch (e) {
    throw new Error(`Could not read page ${pageId}. ${e.message}`);
  }
  const base = page._links?.base || '';
  const out = {
    id: page.id,
    title: page.title,
    url: page._links?.webui ? `${base}${page._links.webui}` : undefined,
  };
  if (withBody) {
    const raw = page.body?.atlas_doc_format?.value;
    out.adf = raw ? JSON.parse(raw) : null;
    out.text = adfToText(out.adf).trim();
  }
  return out;
}
