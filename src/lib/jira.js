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

const JSON_HEADERS = { Accept: 'application/json', 'Content-Type': 'application/json' };

// A plain Task when the project has one, otherwise its first standard work type.
async function workTypeId(projectKey) {
  const res = await api.asApp().requestJira(route`/rest/api/3/issue/createmeta/${projectKey}/issuetypes`);
  if (!res.ok) throw new Error(`Could not read the work types in ${projectKey} (${res.status}).`);
  const json = await res.json();
  const types = (json.issueTypes || json.values || []).filter((t) => !t.subtask);
  const pick = types.find((t) => t.name === 'Task') || types[0];
  if (!pick) throw new Error(`${projectKey} has no work type Precedent can use.`);
  return pick.id;
}

export async function createWorkItem({ projectKey, summary, description, assigneeAccountId }) {
  const fields = { project: { key: projectKey }, issuetype: { id: await workTypeId(projectKey) }, summary, description };
  const post = (body) =>
    api.asApp().requestJira(route`/rest/api/3/issue`, { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ fields: body }) });
  let res = await post(assigneeAccountId ? { ...fields, assignee: { accountId: assigneeAccountId } } : fields);
  // The owner may not be assignable in this project. The mention in the description still reaches them.
  if (!res.ok && assigneeAccountId) res = await post(fields);
  if (!res.ok) throw new Error(`Could not create a work item in ${projectKey} (${res.status}).`);
  return (await res.json()).key;
}

// Moves the work item to the first status in the Done category. Workflows differ, so this is best effort.
export async function closeWorkItem(issueKey) {
  const res = await api.asApp().requestJira(route`/rest/api/3/issue/${issueKey}/transitions`);
  if (!res.ok) return false;
  const { transitions = [] } = await res.json();
  const done = transitions.find((t) => t.to?.statusCategory?.key === 'done');
  if (!done) return false;
  const moved = await api.asApp().requestJira(route`/rest/api/3/issue/${issueKey}/transitions`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ transition: { id: done.id } }),
  });
  return moved.ok;
}
