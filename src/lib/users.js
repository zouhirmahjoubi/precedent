import api, { route } from '@forge/api';

const cache = new Map();

// Rovo and MCP clients can't resolve account IDs, so actions return names.
export async function displayName(accountId) {
  if (!accountId) return undefined;
  if (cache.has(accountId)) return cache.get(accountId);
  let name = accountId;
  try {
    const res = await api.asApp().requestJira(route`/rest/api/3/user?accountId=${accountId}`);
    if (res.ok) name = (await res.json()).displayName || accountId;
  } catch {
    // fall back to the raw ID
  }
  cache.set(accountId, name);
  return name;
}
