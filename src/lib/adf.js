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

// Confluence's built-in decision elements (typed with /decision), in page order.
export function decisionItems(node, out = []) {
  if (!node || typeof node !== 'object') return out;
  if (node.type === 'decisionItem') {
    const value = adfToText(node).trim();
    if (value && (!node.attrs?.state || node.attrs.state === 'DECIDED')) {
      out.push({ localId: node.attrs?.localId, text: value });
    }
    return out;
  }
  for (const child of node.content || []) decisionItems(child, out);
  return out;
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
