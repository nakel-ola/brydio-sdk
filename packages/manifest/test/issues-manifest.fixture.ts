/**
 * The server's Issues fixture, as `apps/api/src/apps/manifest/issues-manifest.fixture.ts`
 * has it: one placement and one screen. The manifest `../brydio-issues` ships
 * adds two placements and a second screen; both must parse.
 */
export const ISSUES_MANIFEST = {
  name: 'issues',
  version: '0.1.0',
  displayName: 'Issues',
  placements: [{ kind: 'project-tab', screen: 'board', label: 'Issues', icon: 'kanban' }],
  data: {
    issues: {
      schema: {
        title: 'string',
        status: ['todo', 'doing', 'done'],
        assignee: 'member?',
        labels: 'string[]',
        body: 'text?',
        project: 'project?',
      },
      search: ['title', 'body'],
      label: 'issue',
    },
    labels: {
      schema: { name: 'string', colour: 'token' },
      label: 'label',
    },
  },
  tools: { generated: true, custom: [] },
  screens: { board: { entry: 'screens/board.js' } },
  grants: { tools: ['*'], collections: ['*'], host: ['navigate', 'message'] },
};
