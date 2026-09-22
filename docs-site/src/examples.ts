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
  // ADR-A23 (catalogue-b)
  'bry-button-group': one('Buttons that belong together, drawn joined.', { id: 'button-group', type: 'bry-button-group', props: { label: 'Issue actions' }, children: ['group-open', 'group-close'] }, [
    { id: 'group-open', type: 'bry-button', props: { label: 'Reopen', variant: 'secondary', size: 'sm' } },
    { id: 'group-close', type: 'bry-button', props: { label: 'Close', variant: 'secondary', size: 'sm' } },
  ]),
  'bry-calendar': one('A month always open: one day, many, or a range.', { id: 'calendar', type: 'bry-calendar', props: { label: 'Leave', mode: 'range', values: ['2026-09-14', '2026-09-18'], month: '2026-09-01' } }),
  'bry-combobox': one('One choice from a long list, with a search.', { id: 'combobox', type: 'bry-combobox', props: { label: 'Assignee', placeholder: 'Pick a person', search: 'Search people', empty: 'Nobody matches.', value: 'ada', options: [{ value: 'ada', label: 'Ada Lovelace' }, { value: 'grace', label: 'Grace Hopper' }, { value: 'katherine', label: 'Katherine Johnson' }] } }),
  'bry-command': one('A search box over things to do.', { id: 'command', type: 'bry-command', props: { label: 'Commands', placeholder: 'Type a command', empty: 'No commands match.', items: [{ id: 'new', label: 'New issue', group: 'Issues', icon: 'add' }, { id: 'assign', label: 'Assign to me', group: 'Issues', icon: 'members' }, { id: 'archive', label: 'Archive closed issues', group: 'Tidy', icon: 'archive', hint: '12' }] } }),
  'bry-context-menu': one('Actions a right-click opens on its child.', { id: 'context-menu', type: 'bry-context-menu', props: { items: [{ id: 'copy', label: 'Copy link', icon: 'copy' }, { id: 'delete', label: 'Delete', tone: 'danger', separator: true }] }, children: ['context-card'] }, [
    { id: 'context-card', type: 'bry-card', props: { title: ISSUES[0], padding: '3' } },
  ]),
  'bry-data-table': one('A table the person sorts, filters, pages and chooses in.', { id: 'data-table', type: 'bry-data-table', props: { label: 'Issues', placeholder: 'Filter issues', perPage: 2, selectable: true, columns: [{ key: 'title', heading: 'Title', sortable: true, hideable: false }, { key: 'status', heading: 'Status', sortable: true }, { key: 'age', heading: 'Age', align: 'end' }], rows: [{ id: '1', cells: [ISSUES[0], 'To do', '2d'] }, { id: '2', cells: [ISSUES[1], 'Doing', '5d'] }, { id: '3', cells: [ISSUES[2], 'Done', '9d'] }] } }),
  'bry-field': one('A control with its name, description and error.', { id: 'field', type: 'bry-field', props: { label: 'Title', description: 'A short line people will search for.', required: true }, children: ['field-input'] }, [
    { id: 'field-input', type: 'bry-input', props: { placeholder: 'What went wrong?' } },
  ]),
  'bry-input-group': one('A field with an icon, a prefix, a suffix or a button.', { id: 'input-group', type: 'bry-input-group', props: { label: 'Site', prefix: 'https://', suffix: '.com', action: 'Check' } }),
  'bry-input-otp': one('A one-time code in a row of boxes.', { id: 'input-otp', type: 'bry-input-otp', props: { label: 'Code', length: 6, value: '123' } }),
  'bry-menubar': one('Menus over one part of the screen.', { id: 'menubar', type: 'bry-menubar', props: { label: 'Editor', menus: [{ id: 'file', label: 'File', items: [{ id: 'new', label: 'New note', icon: 'add' }, { id: 'archive', label: 'Archive', icon: 'archive' }] }, { id: 'edit', label: 'Edit', items: [{ id: 'copy', label: 'Copy', icon: 'copy' }] }] } }),
  'bry-native-select': one("One choice from the system's own list.", { id: 'native-select', type: 'bry-native-select', props: { label: 'Priority', value: 'high', options: [{ value: 'low', label: 'Low' }, { value: 'high', label: 'High' }, { value: 'urgent', label: 'Urgent' }] } }),
  'bry-section-menu': one('The sections of this screen, some with entries.', { id: 'section-menu', type: 'bry-section-menu', props: { label: 'Report sections', current: 'summary', sections: [{ id: 'summary', label: 'Summary' }, { id: 'teams', label: 'Teams', entries: [{ id: 'design', label: 'Design', description: 'Four people, nine issues' }, { id: 'platform', label: 'Platform', description: 'Six people, twelve issues' }] }] } }),
  'bry-pagination': one('Which page shows, and a way to the others.', { id: 'pagination', type: 'bry-pagination', props: { label: 'Issue pages', page: 3, count: 9 } }),
  'bry-questionnaire': one('Questions one at a time, sent together.', { id: 'questionnaire', type: 'bry-questionnaire', props: { title: 'How did the release go?', action: 'Send', questions: [{ id: 'mood', kind: 'rating', prompt: 'How smooth was it?', scale: 5, required: true }, { id: 'areas', kind: 'multiple', prompt: 'What slowed you down?', choices: [{ value: 'review', label: 'Review' }, { value: 'tests', label: 'Tests' }] }, { id: 'notes', kind: 'text', prompt: 'Anything else?', placeholder: 'Optional' }] } }),
  'bry-radio-group': one('One choice with every choice in view.', { id: 'radio-group', type: 'bry-radio-group', props: { label: 'Notify', value: 'mentions', options: [{ value: 'all', label: 'Everything' }, { value: 'mentions', label: 'Mentions only' }, { value: 'none', label: 'Nothing' }] } }),
  'bry-slider': one('A number along a line.', { id: 'slider', type: 'bry-slider', props: { label: 'Estimate, in hours', value: 6, min: 0, max: 40, step: 1 } }),
  'bry-toggle': one('A button that stays pressed.', { id: 'toggle', type: 'bry-toggle', props: { label: 'Show closed', pressed: true, icon: 'check' } }),
  'bry-toggle-group': one('Toggles side by side, one or many pressed.', { id: 'toggle-group', type: 'bry-toggle-group', props: { label: 'View', type: 'single', values: ['board'], items: [{ value: 'board', label: 'Board' }, { value: 'list', label: 'List' }, { value: 'calendar', label: 'Calendar', icon: 'calendar' }] } }),
  // ADR-A23 (catalogue-a)
  'bry-accordion': one("Sections that open and close under their headings.", {"id":"accordion","type":"bry-accordion","props":{"sections":[{"id":"steps","title":"Steps to reproduce"},{"id":"logs","title":"Logs"}],"expanded":["steps"]},"children":["accordion-steps","accordion-logs"]}, [{"id":"accordion-steps","type":"bry-text","props":{"text":"Open Settings, then press Save twice."}},{"id":"accordion-logs","type":"bry-text","props":{"text":"No logs attached.","tone":"muted"}}]),
  'bry-alert': one("A note that stays on the screen, in one of five tones with the tone's icon; children (a button that fixes it) sit under the words.", {"id":"alerts","type":"bry-stack","props":{"gap":"2"},"children":["alert-info","alert-warn"]}, [{"id":"alert-info","type":"bry-alert","props":{"title":"Sync is on","description":"Issues update as teammates change them."}},{"id":"alert-warn","type":"bry-alert","props":{"title":"Two issues have no owner","tone":"warn"}}]),
  'bry-alert-dialog': one('A yes-or-no that must be answered: Cancel and one action, and the backdrop does not close it.', { id: 'alert-dialog', type: 'bry-alert-dialog', props: { open: false, title: 'Delete this issue?', description: 'Its comments go with it.', action: 'Delete', tone: 'danger' } }),
  'bry-aspect-ratio': one("Holds its children to one named shape (16:9, 1:1, …) whatever the width.", {"id":"ratio","type":"bry-aspect-ratio","props":{"ratio":"16:9"},"children":["ratio-card"]}, [{"id":"ratio-card","type":"bry-card","props":{"title":"Preview","padding":"4"}}]),
  'bry-attachment': one("A file with a message, as a chip: its kind's icon, name and size (`bytes`).", {"id":"attachments","type":"bry-stack","props":{"direction":"row","gap":"2","wrap":true},"children":["att-1","att-2"]}, [{"id":"att-1","type":"bry-attachment","props":{"name":"Brief.docx","kind":"document","bytes":48200,"pressable":true}},{"id":"att-2","type":"bry-attachment","props":{"name":"crash.log","kind":"code","bytes":912,"removable":true}}]),
  'bry-breadcrumb': one("Where this screen is, from the top; pressing an earlier step raises `select` with its id.", {"id":"breadcrumb","type":"bry-breadcrumb","props":{"items":[{"id":"all","label":"All issues"},{"id":"web","label":"Web"},{"id":"iss_1","label":"Crash on save"}]}}),
  'bry-bubble': one("One said thing in Brydio's chat bubble: `from: self` is the person's own, at the end; `other` is anyone else's.", {"id":"bubbles","type":"bry-stack","props":{"gap":"2"},"children":["bubble-1","bubble-2"]}, [{"id":"bubble-1","type":"bry-bubble","props":{"text":"Is the crash on save fixed?"}},{"id":"bubble-2","type":"bry-bubble","props":{"text":"Yes, it shipped this morning.","from":"self"}}]),
  'bry-carousel': one("Its children as slides, one at a time, with Previous and Next; `index` is the slide shown and moving raises `change`.", {"id":"carousel","type":"bry-carousel","props":{"label":"Screenshots","index":0},"children":["slide-1","slide-2","slide-3"]}, [{"id":"slide-1","type":"bry-card","props":{"title":"Before","padding":"4"}},{"id":"slide-2","type":"bry-card","props":{"title":"During","padding":"4"}},{"id":"slide-3","type":"bry-card","props":{"title":"After","padding":"4"}}]),
  'bry-chart': one("Numbers as a bar, line, area or pie chart, in the kit's chart colours (never chosen by the app).", {"id":"chart","type":"bry-chart","props":{"kind":"bar","label":"Issues opened and closed by week","categories":["W36","W37","W38","W39"],"series":[{"name":"Opened","values":[12,9,14,7]},{"name":"Closed","values":[8,11,10,12]}]}}),
  'bry-collapsible': one("One section shown or hidden under a button bearing its title; pressing it raises `change` with `{ open }`.", {"id":"collapsible","type":"bry-collapsible","props":{"title":"Details","open":true},"children":["collapsible-text"]}, [{"id":"collapsible-text","type":"bry-text","props":{"text":"Reported on 12 September by Ada."}}]),
  'bry-direction': one("Its children read left to right or right to left, whatever the page reads.", {"id":"direction","type":"bry-direction","props":{"dir":"rtl"},"children":["direction-row"]}, [{"id":"direction-row","type":"bry-stack","props":{"direction":"row","gap":"2"},"children":["direction-a","direction-b"]},{"id":"direction-a","type":"bry-badge","props":{"text":"First"}},{"id":"direction-b","type":"bry-badge","props":{"text":"Second","tone":"brand"}}]),
  'bry-drawer': one('A panel that rises from the bottom for a short task.', { id: 'drawer', type: 'bry-drawer', props: { open: false, title: 'Quick filters' }, children: ['drawer-switch'] }, [{ id: 'drawer-switch', type: 'bry-switch', props: { label: 'Only mine' } }]),
  'bry-hover-card': one("A preview shown while the pointer rests on, or the focus is in, its first child; the rest of its children are the preview.", {"id":"hover","type":"bry-hover-card","props":{},"children":["hover-anchor","hover-text"]}, [{"id":"hover-anchor","type":"bry-button","props":{"label":"Ada Lovelace","variant":"ghost","size":"sm"}},{"id":"hover-text","type":"bry-text","props":{"text":"Owns 4 open issues."}}]),
  'bry-item': one("One thing that stands on its own (a setting, a linked account, a file to act on): an icon, a title and a line, with its children as actions at the end.", {"id":"items","type":"bry-stack","props":{"gap":"2"},"children":["item-1","item-2"]}, [{"id":"item-1","type":"bry-item","props":{"title":"Email updates","description":"A summary every morning.","icon":"mail","variant":"outline"},"children":["item-1-switch"]},{"id":"item-1-switch","type":"bry-switch","props":{"label":"Email updates","checked":true}},{"id":"item-2","type":"bry-item","props":{"loading":true}}]),
  'bry-kbd': one("A key or shortcut as a keycap: `mod+k` is ⌘K on a Mac and Ctrl+K elsewhere.", {"id":"kbd-row","type":"bry-stack","props":{"direction":"row","gap":"2","align":"center"},"children":["kbd-text","kbd"]}, [{"id":"kbd-text","type":"bry-text","props":{"text":"Search","size":"sm","tone":"muted"}},{"id":"kbd","type":"bry-kbd","props":{"text":"mod+k"}}]),
  'bry-marker': one("A mark across a thread or timeline, like \"Today\" or \"New messages\".", {"id":"marker","type":"bry-marker","props":{"text":"New messages","tone":"brand"}}),
  'bry-message': one("One message in a thread: who, their initials, when (`meta`), and its children; `from: self` sits at the end.", {"id":"message","type":"bry-message","props":{"name":"Grace Hopper","meta":"09:41"},"children":["message-bubble"]}, [{"id":"message-bubble","type":"bry-bubble","props":{"text":"Found it: the save runs twice."}}]),
  'bry-message-scroller': one("A thread's messages, oldest first, kept scrolled to the newest while the person is at the bottom; `more` asks for older ones at the top.", {"id":"scroller","type":"bry-message-scroller","props":{"label":"Thread"},"children":["scroller-today","scroller-1","scroller-2"]}, [{"id":"scroller-today","type":"bry-marker","props":{"text":"Today"}},{"id":"scroller-1","type":"bry-message","props":{"name":"Ada Lovelace","meta":"09:40"},"children":["scroller-1-bubble"]},{"id":"scroller-1-bubble","type":"bry-bubble","props":{"text":"Can you look at the crash?"}},{"id":"scroller-2","type":"bry-message","props":{"name":"You","meta":"09:41","from":"self"},"children":["scroller-2-bubble"]},{"id":"scroller-2-bubble","type":"bry-bubble","props":{"text":"On it.","from":"self"}}]),
  'bry-popover': one("A small panel opened from its first child; the rest of its children are the panel.", {"id":"popover","type":"bry-popover","props":{"title":"Snooze"},"children":["popover-anchor","popover-date"]}, [{"id":"popover-anchor","type":"bry-button","props":{"label":"Snooze","variant":"secondary","size":"sm"}},{"id":"popover-date","type":"bry-date","props":{"label":"Until"}}]),
  'bry-progress': one("How far along something is, as a percentage bar; without `value` it says only that it is under way.", {"id":"progress","type":"bry-progress","props":{"label":"Import","value":60}}),
  'bry-scroll-area': one("Its children in a region that scrolls on its own, up to a named `size`, with the shell's thin scrollbar.", {"id":"scroll","type":"bry-scroll-area","props":{"label":"Activity","size":"sm"},"children":["scroll-1","scroll-2","scroll-3"]}, [{"id":"scroll-1","type":"bry-list-row","props":{"title":"Crash on save"}},{"id":"scroll-2","type":"bry-list-row","props":{"title":"Search ignores accents"}},{"id":"scroll-3","type":"bry-list-row","props":{"title":"Dark mode flickers"}}]),
  'bry-separator': one("A hairline between groups, across or down.", {"id":"separated","type":"bry-stack","props":{"gap":"3"},"children":["sep-a","sep","sep-b"]}, [{"id":"sep-a","type":"bry-text","props":{"text":"Open"}},{"id":"sep","type":"bry-separator","props":{}},{"id":"sep-b","type":"bry-text","props":{"text":"Closed","tone":"muted"}}]),
  'bry-sheet': one('A panel that slides in from the side for detail or a longer form.', { id: 'sheet', type: 'bry-sheet', props: { open: false, title: 'Crash on save', description: 'Opened by Ada' }, children: ['sheet-text'] }, [{ id: 'sheet-text', type: 'bry-text', props: { text: 'Saving twice loses the second edit.' } }]),
  'bry-spinner': one("Something is under way, as a small spinner; for a region still loading use its own `loading`.", {"id":"spinner-row","type":"bry-stack","props":{"direction":"row","gap":"2","align":"center"},"children":["spinner","spinner-text"]}, [{"id":"spinner","type":"bry-spinner","props":{"label":"Syncing"}},{"id":"spinner-text","type":"bry-text","props":{"text":"Syncing…","size":"sm","tone":"muted"}}]),
  'bry-tabs': one("Views of one thing, one at a time: `tabs` names them and the n-th child is the n-th tab's panel; choosing one raises `change` with its id.", {"id":"tabs","type":"bry-tabs","props":{"label":"Issue","tabs":[{"id":"details","label":"Details"},{"id":"activity","label":"Activity"}],"value":"details"},"children":["tab-details","tab-activity"]}, [{"id":"tab-details","type":"bry-text","props":{"text":"Saving twice loses the second edit."}},{"id":"tab-activity","type":"bry-text","props":{"text":"Ada opened this.","tone":"muted"}}]),
  'bry-tooltip': one("A short hint over its child on hover and focus.", {"id":"tooltip","type":"bry-tooltip","props":{"text":"Archive this issue"},"children":["tooltip-button"]}, [{"id":"tooltip-button","type":"bry-button","props":{"label":"Archive","variant":"ghost","icon":"archive","hideLabel":true}}]),
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
