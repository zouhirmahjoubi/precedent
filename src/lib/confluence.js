import api, { route } from '@forge/api';

export async function getPage(pageId) {
  const res = await api.asApp().requestConfluence(route`/wiki/api/v2/pages/${pageId}`);
  if (!res.ok) throw new Error(`Could not read page ${pageId} (${res.status})`);
  const page = await res.json();
  const base = page._links?.base || '';
  return {
    id: page.id,
    title: page.title,
    url: page._links?.webui ? `${base}${page._links.webui}` : undefined,
  };
}
