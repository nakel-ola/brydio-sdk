import { createHash } from 'node:crypto';

import type { ElementName } from '../../packages/ui/src/catalogue.ts';

export interface ExampleNode {
  id: string;
  type: ElementName;
  props: Record<string, unknown>;
  children?: string[];
}

export interface ElementExample {
  about: string;
  root: string;
  nodes: ExampleNode[];
}

const one = (about: string, node: ExampleNode, more: ExampleNode[] = []): ElementExample => ({
  about,
  root: node.id,
  nodes: [node, ...more],
});

const ISSUES = ['Crash on save', 'Search ignores accents', 'Dark mode flickers'];

export const EXAMPLES = {
  'bry-stack': one('A row or column with a gap.', { id: 'stack', type: 'bry-stack', props: { direction: 'row', gap: '2', align: 'center' }, children: ['todo', 'doing', 'done'] }, [
    { id: 'todo', type: 'bry-badge', props: { text: 'To do' } },
    { id: 'doing', type: 'bry-badge', props: { text: 'Doing', tone: 'brand' } },
    { id: 'done', type: 'bry-badge', props: { text: 'Done', tone: 'success' } },
  ]),
  'bry-heading': one('A heading in the document outline.', { id: 'heading', type: 'bry-heading', props: { level: 2, text: 'Issues' } }),
  'bry-text': one('Body text with a muted detail.', { id: 'text-stack', type: 'bry-stack', props: { gap: '1' }, children: ['body', 'detail'] }, [
    { id: 'body', type: 'bry-text', props: { text: 'Three issues are open this week.' } },
    { id: 'detail', type: 'bry-text', props: { text: 'Updated a minute ago', tone: 'muted', size: 'sm' } },
  ]),
  'bry-button': one('An action button.', { id: 'button', type: 'bry-button', props: { label: 'New issue', variant: 'primary', icon: 'add' } }),
  'bry-card': one('A titled card with content.', { id: 'card', type: 'bry-card', props: { title: ISSUES[0], padding: '3', pressable: true }, children: ['card-text'] }, [
    { id: 'card-text', type: 'bry-text', props: { text: 'Opened by Ada', tone: 'muted', size: 'sm' } },
  ]),
  'bry-input': one('A one-line input.', { id: 'input', type: 'bry-input', props: { label: 'Title', value: ISSUES[0] } }),
  'bry-textarea': one('A multi-line input.', { id: 'textarea', type: 'bry-textarea', props: { label: 'Body', placeholder: 'Steps to reproduce' } }),
  'bry-select': one('A short list of choices.', { id: 'select', type: 'bry-select', props: { label: 'Status', value: 'doing', options: [{ value: 'todo', label: 'To do' }, { value: 'doing', label: 'Doing' }, { value: 'done', label: 'Done' }] } }),
  'bry-label': one('A field label and its control.', { id: 'label', type: 'bry-label', props: { text: 'Title', required: true }, children: ['label-input'] }, [
    { id: 'label-input', type: 'bry-input', props: { placeholder: 'What went wrong?' } },
  ]),
  'bry-grid': one('Equal columns that respond to available width.', { id: 'grid', type: 'bry-grid', props: { columns: '3', gap: '3' }, children: ['grid-1', 'grid-2', 'grid-3'] }, [
    ...['To do', 'Doing', 'Done'].map((title, index) => ({ id: `grid-${index + 1}`, type: 'bry-card' as const, props: { title, padding: '3' } })),
  ]),
  'bry-badge': one('A compact status.', { id: 'badge', type: 'bry-badge', props: { text: 'In progress', tone: 'brand' } }),
  'bry-avatar': one('A person represented by initials.', { id: 'avatar', type: 'bry-avatar', props: { name: 'Ada Lovelace', size: 'lg' } }),
  'bry-list-row': one('A row in a list.', { id: 'list-row', type: 'bry-list-row', props: { title: ISSUES[0], description: 'Opened by Ada', meta: '2d', pressable: true, selected: true }, children: ['row-badge'] }, [
    { id: 'row-badge', type: 'bry-badge', props: { text: 'Bug', tone: 'danger' } },
  ]),
  'bry-empty-state': one('A view with nothing to show yet.', { id: 'empty-state', type: 'bry-empty-state', props: { title: 'No issues yet', text: 'Issues you make show up here.', action: 'New issue' } }),
  'bry-skeleton': one('A loading placeholder.', { id: 'skeleton', type: 'bry-skeleton', props: { shape: 'row', count: 3 } }),
  'bry-table': one('Rows and sortable columns.', { id: 'table', type: 'bry-table', props: { label: 'Issues', columns: [{ key: 'title', heading: 'Title', sortable: true }, { key: 'status', heading: 'Status' }], rows: [{ id: '1', cells: [ISSUES[0], 'To do'] }, { id: '2', cells: [ISSUES[1], 'Doing'] }], selectable: true, selected: '2' } }),
  'bry-virtual-list': one('A long list drawn in a window.', { id: 'virtual-list', type: 'bry-virtual-list', props: { label: 'All issues', count: 3, start: 0, rowSize: 'md' }, children: ['virtual-1', 'virtual-2', 'virtual-3'] }, [
    ...ISSUES.map((title, index) => ({ id: `virtual-${index + 1}`, type: 'bry-list-row' as const, props: { title } })),
  ]),
  'bry-dialog': one('A question requiring an answer.', { id: 'dialog', type: 'bry-dialog', props: { open: false, title: 'Delete this issue?', description: 'Its comments go with it.', actions: [{ id: 'delete', label: 'Delete', tone: 'danger' }] } }),
  'bry-menu': one('A short list of actions.', { id: 'menu', type: 'bry-menu', props: { items: [{ id: 'archive', label: 'Archive', icon: 'archive' }, { id: 'delete', label: 'Delete', tone: 'danger', separator: true }] }, children: ['menu-button'] }, [
    { id: 'menu-button', type: 'bry-button', props: { label: 'More', variant: 'secondary', size: 'sm' } },
  ]),
  'bry-date': one('A date from a calendar.', { id: 'date', type: 'bry-date', props: { label: 'Due', value: '2026-09-30' } }),
  'bry-split': one('Two panes side by side.', { id: 'split', type: 'bry-split', props: { ratio: 40, label: 'Issues and detail' }, children: ['split-left', 'split-right'] }, [
    { id: 'split-left', type: 'bry-text', props: { text: 'The list' } },
    { id: 'split-right', type: 'bry-text', props: { text: 'The issue', tone: 'muted' } },
  ]),
  'bry-checkbox': one('A checked or unchecked value.', { id: 'checkbox', type: 'bry-checkbox', props: { label: 'Notify the reporter', checked: true } }),
  'bry-switch': one('A setting that is on or off.', { id: 'switch', type: 'bry-switch', props: { label: 'Closed issues', checked: false } }),
  'bry-board': one('Columns containing cards.', { id: 'board', type: 'bry-board', props: { label: 'Issues', cardSize: 'sm' }, children: ['todo-column', 'doing-column'] }, [
    { id: 'todo-column', type: 'bry-board-column', props: { title: 'To do' }, children: ['board-card'] },
    { id: 'doing-column', type: 'bry-board-column', props: { title: 'Doing', limit: 3 } },
    { id: 'board-card', type: 'bry-card', props: { title: ISSUES[0], padding: '3' } },
  ]),
  'bry-board-column': one('One board column.', { id: 'board-column', type: 'bry-board-column', props: { title: 'Doing', limit: 5 }, children: ['column-card'] }, [
    { id: 'column-card', type: 'bry-card', props: { title: ISSUES[1], padding: '3' } },
  ]),
  'bry-markdown': one('Formatted message text.', { id: 'markdown', type: 'bry-markdown', props: { text: '## Steps\n\n1. Open **Settings**\n2. Press `Save`' } }),
  'bry-diff': one('A pull request change.', { id: 'diff', type: 'bry-diff', props: { label: 'Changes', files: [{ path: 'src/auth.ts', status: 'modified', patch: '@@ -10,3 +10,4 @@\n   const user = await find(email);\n-  if (!user) return null;\n+  if (!user) throw new NotFound();\n   return user;\n' }] } }),
  'bry-file-grid': one('Files presented as tiles.', { id: 'file-grid', type: 'bry-file-grid', props: { label: 'Design files', count: 2, start: 0, tileSize: 'sm', files: [{ id: 'brief', name: 'Brief.docx', kind: 'document', size: 48200, modified: '2026-09-10T09:00:00Z' }, { id: 'budget', name: 'Budget.xlsx', kind: 'spreadsheet', size: 18400 }] } }),
} satisfies Record<ElementName, ElementExample>;

function jsxValue(value: unknown): string {
  return `{${JSON.stringify(value)}}`;
}

export function jsxFor(example: ElementExample): string {
  const nodes = new Map(example.nodes.map(node => [node.id, node]));

  const render = (id: string, indent = ''): string => {
    const node = nodes.get(id);
    if (!node) return '';

    const props = Object.entries(node.props)
      .map(([name, value]) => ` ${name}=${jsxValue(value)}`)
      .join('');
    const children = node.children?.map(child => render(child, `${indent}  `)).filter(Boolean) ?? [];

    return children.length
      ? `${indent}<${node.type}${props}>\n${children.join('\n')}\n${indent}</${node.type}>`
      : `${indent}<${node.type}${props} />`;
  };

  return render(example.root);
}

export function exampleFingerprint(name: ElementName): string {
  return createHash('sha256').update(JSON.stringify(EXAMPLES[name])).digest('hex');
}
