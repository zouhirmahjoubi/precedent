// Jira and Confluence store rich text as ADF (Atlassian Document Format).

const BLOCKS = new Set(['paragraph', 'heading', 'listItem', 'blockquote', 'codeBlock', 'tableCell']);

export function adfToText(node) {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (node.type === 'text') return node.text || '';
  if (node.type === 'mention') return node.attrs?.text || '';
  if (node.type === 'hardBreak') return '\n';
  const inner = (node.content || []).map(adfToText).join('');
  return BLOCKS.has(node.type) ? `${inner}\n` : inner;
}

export const text = (value, marks) => (marks ? { type: 'text', text: value, marks } : { type: 'text', text: value });
export const strong = (value) => text(value, [{ type: 'strong' }]);
export const link = (value, href) => text(value, [{ type: 'link', attrs: { href } }]);
export const mention = (accountId) => ({ type: 'mention', attrs: { id: accountId } });
export const paragraph = (...content) => ({ type: 'paragraph', content });
export const bulletList = (items) => ({
  type: 'bulletList',
  content: items.map((content) => ({ type: 'listItem', content: [paragraph(...content)] })),
});
export const doc = (...content) => ({ type: 'doc', version: 1, content });
