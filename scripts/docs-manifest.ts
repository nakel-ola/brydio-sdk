#!/usr/bin/env bun
/** Write `docs/manifest.md` from the manifest schemas and their exported limits. */

import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { baseManifestSchema, MANIFEST_LIMITS } from '../packages/manifest/src/base.ts';
import { DOCUMENT_LIMITS } from '../packages/manifest/src/document-limits.ts';
import { COLOUR_TOKENS, FIELD_LIMITS, LABEL_CHARS } from '../packages/manifest/src/field-types.ts';
import { HOST_CAPABILITIES } from '../packages/manifest/src/grants.ts';
import { migrationStepSchema } from '../packages/manifest/src/migrations.ts';
import { manifestExtensionsSchema, MAX_CUSTOM_TOOLS } from '../packages/manifest/src/schema.ts';

const ROOT = resolve(import.meta.dir, '..');

type BaseField = keyof typeof baseManifestSchema.shape & string;
type ExtensionField = keyof typeof manifestExtensionsSchema.shape & string;
type ManifestField = BaseField | ExtensionField;

interface FieldDoc {
  takes: string;
  description: string;
}

const FIELD_DOCS: Record<ManifestField, FieldDoc> = {
  name: {
    takes: `kebab-case text, at most ${MANIFEST_LIMITS.nameChars} characters`,
    description: 'The stable app key. A published app keeps this name for every version.',
  },
  version: {
    takes: `semver text, at most ${MANIFEST_LIMITS.versionChars} characters`,
    description: 'The app version. A published version is immutable.',
  },
  displayName: {
    takes: `text, at most ${MANIFEST_LIMITS.displayNameChars} characters`,
    description: 'The name people see. Brydio falls back to `name` when this is absent.',
  },
  summary: {
    takes: `text, at most ${MANIFEST_LIMITS.summaryChars} characters`,
    description: 'One sentence shown in the directory and install flow.',
  },
  description: {
    takes: `text, at most ${MANIFEST_LIMITS.descriptionChars.toLocaleString('en-GB')} characters`,
    description: 'The longer explanation of what the app does.',
  },
  author: {
    takes: '`{ name, email?, url? }`',
    description: 'The app author. `name` is required inside this record.',
  },
  homepage: { takes: 'text', description: 'The public page for the app.' },
  repository: { takes: 'text', description: 'The source repository for the app.' },
  license: {
    takes: `text, at most ${MANIFEST_LIMITS.licenseChars} characters`,
    description: 'The licence identifier or name for this app.',
  },
  keywords: {
    takes: `a list of at most ${MANIFEST_LIMITS.keywords} strings`,
    description: 'Words used to find the app in the directory.',
  },
  links: {
    takes: '`{ privacy?, terms?, support? }`',
    description: 'Public policy and support links shown with the app.',
  },
  logo: {
    takes: '`{ color, mono }`, two `./` paths',
    description:
      'Required to publish. The app’s logo in colour and in one colour: PNG, JPEG, WebP or SVG, 48 to 1024 pixels tall, up to four times as wide, at most 512 KB. The one-colour one is a PNG with transparency or an SVG in one colour or `currentColor`.',
  },
  icon: {
    takes: '`{ color, mono }`, two `./` paths',
    description:
      'Required to publish. The app’s square icon in colour, for tiles, and in one colour, which the sidebar tints. 48 to 1024 pixels across. A single path is still read for older versions, but is not enough to publish.',
  },
  brandColor: { takes: 'text', description: 'The legacy light-theme brand colour.' },
  brandColorDark: { takes: 'text', description: 'The legacy dark-theme brand colour.' },
  defaultPrompts: {
    takes: `a list of at most ${MANIFEST_LIMITS.defaultPrompts} strings`,
    description: 'Prompts Brydio may offer when the app is installed.',
  },
  skills: { takes: 'a relative path', description: 'The legacy skill declaration path.' },
  servers: { takes: 'a relative path', description: 'The legacy MCP server declaration path.' },
  integrations: { takes: 'a relative path', description: 'The legacy integration declaration path.' },
  requires: {
    takes: '`{ servers?, integrations?, builtin? }`',
    description: 'Lists extension dependencies. Each inner value is a list of ids.',
  },
  metadata: {
    takes: 'a record of JSON values',
    description: 'Publisher metadata that Brydio preserves without giving it SDK meaning.',
  },
  placements: {
    takes: 'a list of placement offers',
    description: 'Where a person may place the app. Each offer names a declared screen.',
  },
  data: {
    takes: 'a record of collections',
    description: 'The records the app keeps. Each collection declares its fields and generated-tool noun.',
  },
  tools: {
    takes: '`{ generated?, custom? }`',
    description: 'Generated collection tools and custom server-side handlers.',
  },
  screens: {
    takes: 'a record of `{ entry }` values',
    description: 'The screen names and their compiled `.js` or `.mjs` entries inside the bundle.',
  },
  grants: {
    takes: '`{ tools?, collections?, host? }`',
    description: 'Everything the app asks a workspace to let it read, call, or open.',
  },
  migrations: {
    takes: 'an ordered list of versioned migration steps',
    description: 'How existing records move when a later version changes a collection schema.',
  },
  sdk: {
    takes: 'semver text',
    description: 'Written by `brydio build`. Do not add or edit it in `.brydio/app.json`.',
  },
};

const FIELD_TYPES = [
  ['`string`', `Short text, at most ${FIELD_LIMITS.stringChars.toLocaleString('en-GB')} characters.`],
  ['`text`', `Long text, at most ${FIELD_LIMITS.textChars.toLocaleString('en-GB')} characters.`],
  ['`["todo", "done"]`', `A choice. It may list at most ${FIELD_LIMITS.enumValues} unique values.`],
  ['`member`', 'A Brydio member id.'],
  ['`project`', 'A Brydio project id. One collection may have one project field.'],
  ['`date`', 'An ISO calendar date in `YYYY-MM-DD` form.'],
  ['`number`', 'A finite number.'],
  ['`boolean`', '`true` or `false`.'],
  ['`string[]`', `A list of at most ${FIELD_LIMITS.listEntries} short strings.`],
  ['`token`', `One of ${COLOUR_TOKENS.map(token => `\`${token}\``).join(', ')}.`],
] as const;

const MIGRATION_DOCS = {
  add: 'Add a field. A required field needs a valid `default` for existing records.',
  rename: 'Move one field to a new name without losing its values.',
  drop: 'Remove one field and its stored values.',
  dropCollection: 'Remove a collection and all records it kept.',
  replace: 'Replace one removed choice value with a value the new schema allows.',
} satisfies Record<(typeof migrationStepSchema.options)[number]['_output']['op'], string>;

const LIMIT_DESCRIPTIONS: Record<keyof typeof FIELD_LIMITS, string> = {
  collections: 'Collections one app may keep',
  fields: 'Fields one collection may have',
  enumValues: 'Values one choice may allow',
  enumValueChars: "Characters in one of a choice's values",
  stringChars: 'Characters in a `string` value',
  textChars: 'Characters in a `text` value',
  listEntries: 'Entries in a `string[]` value',
  nameChars: 'Characters in a collection, label, field or screen name',
};

const DOCUMENT_LIMIT_DESCRIPTIONS: Record<keyof typeof DOCUMENT_LIMITS, string> = {
  bodyBytes: 'Bytes in one stored record',
  recordsPerCollection: 'Live records in one collection of one instance',
  pageDefault: "Records returned when a list or search does not say how many",
  pageMax: 'Records one list or search page may return',
  pageBytes: 'Bytes after which a page stops and returns a cursor',
  batchChanges: 'Changes one `batch_<plural>` call may make',
};

const markdownNumber = (value: number): string => value.toLocaleString('en-GB');

const table = (headings: string[], rows: string[][]): string =>
  [
    `| ${headings.join(' | ')} |`,
    `|${headings.map(() => '---').join('|')}|`,
    ...rows.map(row => `| ${row.join(' | ')} |`),
  ].join('\n');

function schemaFor(field: ManifestField): { isOptional(): boolean } {
  if (field in baseManifestSchema.shape) {
    return (baseManifestSchema.shape as Record<string, { isOptional(): boolean }>)[field]!;
  }

  return (manifestExtensionsSchema.shape as Record<string, { isOptional(): boolean }>)[field]!;
}

/** The complete manifest reference, suitable for writing or checking in a test. */
export function manifestDoc(): string {
  const fields = [
    ...(Object.keys(baseManifestSchema.shape) as BaseField[]),
    ...(Object.keys(manifestExtensionsSchema.shape) as ExtensionField[]),
  ];
  const issues = readFileSync(join(ROOT, 'packages', 'manifest', 'examples', 'issues.json'), 'utf8').trim();
  const migrationOps = migrationStepSchema.options.map(option => option.shape.op.value);

  return [
    '# The manifest',
    '',
    'Every app has a manifest at `.brydio/app.json`. It names the app, its screens,',
    'the records it keeps, where it may appear, and every grant it asks for.',
    '`@brydio/manifest` exports `appManifestSchema`, its TypeScript types, and',
    '`defineManifest()`. `brydio validate` and Brydio use the same rules.',
    '',
    '**This page is generated** by `bun run docs:manifest`. Its field list comes',
    'from the Zod schemas, its limits come from the exported constants, and its',
    'worked example is the checked-in Issues manifest. Do not edit it by hand.',
    '',
    '## Issues, as a complete example',
    '',
    'This is `packages/manifest/examples/issues.json`, the proposal app used to',
    'exercise project and workspace placements, two collections, generated tools,',
    'two screens, collection grants, tool grants, and host grants.',
    '',
    '```json',
    issues,
    '```',
    '',
    '## Top-level fields',
    '',
    table(
      ['Field', 'Takes', 'Required', 'What it does'],
      fields.map(field => [
        `\`${field}\``,
        FIELD_DOCS[field].takes,
        schemaFor(field).isOptional() ? 'no' : 'yes',
        FIELD_DOCS[field].description,
      ]),
    ),
    '',
    'Unknown top-level fields are rejected. The sections below expand the fields',
    'that have their own nested grammar.',
    '',
    '## Placements and screens',
    '',
    'Each `placements` entry has a `kind`, a `screen`, and optional `label` and',
    '`icon` text. `kind` is `project-tab`, `project-sidebar`, or',
    '`workspace-sidebar`. `screen` must name a key in `screens`. Each screen has',
    'one `entry`, a relative `.js` or `.mjs` path inside the built bundle.',
    '',
    '## Collections and schema types',
    '',
    'Each key in `data` is a collection name. A collection has a required `schema`,',
    'an optional singular `label` used in generated tool names, and an optional',
    '`search` list. Search fields must use `string`, `text`, or `string[]`.',
    '',
    table(['Manifest spelling', 'Stored value'], FIELD_TYPES.map(([name, description]) => [name, description])),
    '',
    'Add `?` to a named type to make the field optional, such as `member?`.',
    'A field may also use `{ "type": ..., "optional": true, "default": ...,',
    '`"labels": ... }`. Only optional choices and booleans may have defaults.',
    `Choice labels are 1 to ${LABEL_CHARS} characters and may name only declared values.`,
    '',
    '## Tools',
    '',
    '`tools.generated` defaults to `true`. Each collection then gets create,',
    'update, get, list, search, delete, and batch tools. `tools.custom` may hold',
    `at most ${MAX_CUSTOM_TOOLS} handlers. A custom tool has a lower-case \`name\`,`,
    'a `description`, a built `handler` path, and optional `input`, `write`, and',
    '`collection`. Its input fields use the same schema types as collection fields.',
    'A custom tool that writes must set `write: true`, which makes Brydio ask the',
    'person before it runs.',
    '',
    '## Grants',
    '',
    '`grants.tools` names generated or custom tools, a collection noun, or `*`.',
    '`grants.collections` names collections or `*`. `grants.host` may contain:',
    '',
    HOST_CAPABILITIES.map(grant => `- \`${grant}\``).join('\n'),
    '',
    'A named connection grant is `connection:<name>`. `*` never grants a',
    'connection. A collection the app keeps must appear in `grants.collections`,',
    'and a custom tool must appear in `grants.tools` unless that list has `*`.',
    '',
    '## Migrations',
    '',
    'When a published version changes a collection schema, `migrations` explains',
    'how records from earlier versions become readable by the new one. Each entry',
    'has the target `version` and 1 to 100 `steps`. Keep every migration in order',
    'so a workspace several versions behind can run each one.',
    '',
    table(['Operation', 'What it does'], migrationOps.map(operation => [`\`${operation}\``, MIGRATION_DOCS[operation]])),
    '',
    '## Limits',
    '',
    'The generator reads these values from `FIELD_LIMITS` and `DOCUMENT_LIMITS`.',
    'The manifest validator and the fake host use the same exports.',
    '',
    table(
      ['Limit', 'Value', 'What it bounds'],
      Object.entries(FIELD_LIMITS).map(([key, value]) => [
        `\`FIELD_LIMITS.${key}\``,
        markdownNumber(value),
        LIMIT_DESCRIPTIONS[key as keyof typeof FIELD_LIMITS],
      ]),
    ),
    '',
    table(
      ['Limit', 'Value', 'What it bounds'],
      Object.entries(DOCUMENT_LIMITS).map(([key, value]) => [
        `\`DOCUMENT_LIMITS.${key}\``,
        markdownNumber(value),
        DOCUMENT_LIMIT_DESCRIPTIONS[key as keyof typeof DOCUMENT_LIMITS],
      ]),
    ),
    '',
    'The full validation list, with every problem code and refusal sentence, is',
    'in [the publish checklist](publish-checklist.md).',
    '',
  ].join('\n');
}

if (import.meta.main) {
  const path = join(ROOT, 'docs', 'manifest.md');

  writeFileSync(path, manifestDoc());
  console.log(`Wrote ${path}`);
}
