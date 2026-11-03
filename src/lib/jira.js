import api, { route } from '@forge/api';
import { adfToText } from './adf';

export async function getWorkItem(issueKey) {
  const res = await api
    .asApp()
    .requestJira(route`/rest/api/3/issue/${issueKey}?fields=summary,description,project,comment`);
  if (!res.ok) throw new Error(`Could not read ${issueKey} (${res.status})`);
  const issue = await res.json();
  return {
    key: issue.key,
    projectKey: issue.fields.project?.key,
    summary: issue.fields.summary || '',
    description: adfToText(issue.fields.description).trim(),
    comments: (issue.fields.comment?.comments || []).map((c) => ({
      author: c.author?.displayName,
      accountId: c.author?.accountId,
      created: c.created,
      body: adfToText(c.body).trim(),
    })),
  };
}

export async function addComment(issueKey, body) {
  const res = await api.asApp().requestJira(route`/rest/api/3/issue/${issueKey}/comment`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ body }),
  });
  if (!res.ok) throw new Error(`Could not comment on ${issueKey} (${res.status})`);
  return res.json();
}

export async function getSiteUrl() {
  const res = await api.asApp().requestJira(route`/rest/api/3/serverInfo`);
  if (!res.ok) return '';
  const info = await res.json();
  return info.baseUrl || '';
}
