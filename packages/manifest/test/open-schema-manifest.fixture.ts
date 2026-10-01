import { OPEN_TYPES } from '../src/open-schema.ts';

/**
 * A Database-shaped app for the open-schema specs (P5): bases hold tables,
 * tables hold rows, and each table's fields are `columns` records. A copy of
 * Brydio's `apps/api/src/apps/manifest/open-schema-manifest.fixture.ts`.
 */
export const OPEN_SCHEMA_MANIFEST = {
  name: 'database',
  version: '0.1.0',
  displayName: 'Database',
  data: {
    tables: { schema: { name: 'string' }, label: 'table' },
    columns: {
      schema: {
        table: 'string',
        key: 'string?',
        name: 'string',
        type: [...OPEN_TYPES],
        choices: 'string[]',
        required: 'boolean?',
        currency: 'string?',
        precision: 'number?',
        linkTo: 'string?',
        description: 'string?',
        position: 'number?',
      },
      label: 'column',
    },
    rows: {
      schema: { table: 'string', title: 'string?' },
      label: 'row',
      search: ['title'],
      openSchema: { fields: 'columns', table: 'table' },
    },
  },
  tools: { generated: true, custom: [] },
  grants: { tools: ['*'], collections: ['*'] },
};
