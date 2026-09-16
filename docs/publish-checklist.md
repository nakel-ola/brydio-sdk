# The publish checklist

This page lists everything an app must pass before Brydio publishes it
(A8-F04-S03). It covers Brydio's own apps and everyone else's, with no
exceptions.

`brydio validate` runs these checks on your own machine. `brydio publish`
runs `brydio build` and `brydio validate` before it uploads anything. Then
Brydio's publish route (`POST /api/v1/apps/publish`) checks the upload again,
because an older or edited command line is still just a client. Every check
reports a code and one sentence, one item per failure. Warnings don't stop a
build or a publish; errors do.

The columns:

- **validate**: whether `brydio validate` (and so `brydio publish`, before
  uploading) runs the check.
- **server**: whether Brydio runs it again. "publish" means the publish route
  refuses the version. "runtime" means Brydio refuses the thing when a screen
  does it, but still publishes the version. "no" means only the command
  line checks it.
- **Refused with**: the sentence you see. `<angle brackets>` stand for your
  app's names. Where the server runs the same check, it uses the same
  sentence unless the row says otherwise.

`packages/cli/test/checklist-doc.test.ts` fails if a code exists in the SDK
and not on this page, or the other way round.

## 1. The manifest parses, and every placement names a screen

The manifest is `.brydio/app.json` (or `app.json`), read with Brydio's own
schema (`@brydio/manifest`). `validate` and the publish route refuse the
same way: the check's own code (`manifest_invalid` for a field of the wrong
shape) and the sentence behind `app.json: "<path>": `, or behind `app.json: `
when the problem isn't about one field. The sentences below are what follows
that prefix. `validate` lists every problem; the route answers with the
first.

| Code | Refused with | validate | server | How to fix |
|---|---|---|---|---|
| `manifest_missing` | There is no manifest. Put one at .brydio/app.json. | yes | publish, as `bundle_manifest_missing` | Add `.brydio/app.json`. |
| `manifest_not_json` | app.json is not valid JSON. (`validate` adds where the parser stopped.) | yes | publish, as `manifest_invalid` | Fix the JSON. |
| `manifest_invalid` | The schema's sentence for the field at `<path>`. For example, the name must be lowercase letters, digits and dashes; the version must look like 1.2.0; "Custom tools are not available yet." | yes | publish | Change the field the path names. |
| `placement_screen_unknown` | A `<kind>` placement opens "`<screen>`", which is not one of the app's screens. | yes | publish | Declare the screen under `screens`, or point the placement at one that is declared. |
| `data_too_many_collections` | An app may keep at most `<n>` collections. | yes | publish | Keep fewer collections. |
| `data_collection_name_format` | `<collection>` is not a collection name: lower-case letters, digits and _, starting with a letter, at most 40 characters. | yes | publish | Rename the collection. |
| `data_label_format` | `<collection>`'s label must be one lower-case word the tools can be named with, at most 40 characters. | yes | publish | Give `label` one lower-case word. |
| `data_label_taken` | `<collection>` and `<other>` would both make tools called `<label>`. | yes | publish | Give one of them a different `label`. |
| `data_too_many_fields` | A collection may have at most `<n>` fields. | yes | publish | Split the collection or drop fields. |
| `data_field_reserved` | `<collection>.<field>`: Brydio keeps `<field>` on every record itself. | yes | publish | Rename the field; Brydio already keeps it. |
| `data_field_name_format` | `<collection>.<field>` is not a field name: letters, digits and _, starting with a lower-case letter, at most 40 characters. | yes | publish | Rename the field. |
| `data_project_field_twice` | `<collection>` links to a project twice (`<a>` and `<b>`); keep one. | yes | publish | Keep one `project` field. |
| `data_field_type_unknown` | `<collection>.<field>`: "`<type>`" is not a field type. | yes | publish | Use one of the field types in the README. |
| `data_enum_empty` | `<collection>.<field>`: A choice needs at least one allowed value. | yes | publish | List at least one value. |
| `data_enum_too_many` | `<collection>.<field>`: A choice may have at most `<n>` values. | yes | publish | Allow fewer values. |
| `data_enum_value_invalid` | `<collection>.<field>`: Each allowed value is a word or two of text, at most `<n>` characters. | yes | publish | Shorten or fix the value. |
| `data_enum_duplicate` | `<collection>.<field>`: A choice names the same value twice. | yes | publish | Take out the duplicate. |
| `data_default_not_allowed` | `<collection>.<field>`: Only a choice or a boolean may have a default, not a <type>. | yes | publish | Take the default out, or make the field a choice or a boolean. |
| `data_default_on_required` | `<collection>.<field>`: A field with a default is one a create may leave out: add "optional": true (or write "boolean?"). | yes | publish | Make the field optional, or take the default out. |
| `data_default_invalid` | `<collection>.<field>`: The default must be one of the choice's values (or true or false for a boolean). | yes | publish | Use one of the allowed values. |
| `data_labels_not_allowed` | `<collection>.<field>`: Only a choice may label its values, not a <type>. | yes | publish | Take `labels` out, or make the field a choice. |
| `data_label_invalid` | `<collection>.<field>`: The label for "<value>" is 1 to `<n>` characters of text. | yes | publish | Give each label 1 to `<n>` characters. |
| `data_label_unknown_value` | `<collection>.<field>`: "<value>" is not one of the choice's values, so it can't have a label. | yes | publish | Label only values the choice allows. |
| `data_field_key_unknown` | `<collection>.<field>`: "<key>" is not something a field may say; use type, optional and default. | yes | publish | Keep to type, optional and default. |
| `custom_name_taken` | `tools.custom`: <name> is already a tool this app has: give the custom tool another name, or switch generated tools off. | yes | publish | Rename the custom tool. |
| `custom_collection_unknown` | `tools.custom`: <name> works on <collection>, which the app does not keep. | yes | publish | Name a collection in `data`, or leave `collection` out. |
| `custom_input_invalid` | `tools.custom`: <name>'s input <field>: not a field type. | yes | publish | Write the input in the field-type grammar. |
| `data_search_unknown_field` | `<collection>` searches `<field>`, which is not one of its fields. | yes | publish | Search only declared fields. |
| `data_search_not_text` | `<collection>.<field>` cannot be searched: only text fields can. | yes | publish | Search only text fields. |
| `manifest_sdk_overwritten` (warning, from `brydio build`) | The manifest says "sdk": `<value>`, which brydio build writes itself. The build says `<version>`; take the line out of the manifest. | build | no | Delete `sdk` from the manifest. |

## 2. Screens use only catalogue elements and the settings each one takes

Checked by reading each screen's source with TypeScript's parser, against
`@brydio/ui`'s catalogue, which is a copy of Brydio's own. Only what the source
writes out is checked: a value or an element name worked out while the screen
runs isn't guessed at. Brydio refuses anything that gets past this check,
node by node, while drawing (`tree/refused`), using the same sentences. The
publish route can't check compiled code for this.

| Code | Refused with | validate | server | How to fix |
|---|---|---|---|---|
| `element_unknown` | Brydio has no element called "`<name>`". A screen draws with `<the catalogue>`. | yes | runtime | Use a catalogue element. |
| `prop_unknown` | `<element>` has no setting called "`<name>`". | yes | runtime | Remove the setting, or use one the element takes (see the README's table). |
| `prop_value_invalid` | `<element> <setting>` must be one of `<values>`. (Or: must be text of at most `<n>` characters; must be true or false; must be a whole number from `<min>` to `<max>`; a list or a record names the path, as in `bry-table columns[0].align must be one of start, end.`) | yes | runtime | Use an allowed value. |
| `prop_required` | `<element>` needs a `<setting>`. | yes | runtime | Add the setting. |
| `event_unknown` | `<element>` raises `<events>`, not "`<event>`". Or: `<element>` raises no events, so it takes no `<onEvent>`. | yes | runtime | Remove the handler. |
| `children_not_allowed` | `<element>` can’t hold other nodes. | yes | runtime | Give the element its words as a setting (`text="…"`, `label="…"`). |
| `source_syntax` | This does not parse: `<TypeScript's words>` | yes | no | Fix the syntax. |
| `screen_source_missing` (from `brydio build`) | The "`<screen>`" screen is built from src/`<entry>`.tsx (or .ts, .jsx, .js), and there is no such file. | build | no | Add the source file, or fix the entry. |
| `screen_build_failed` (from `brydio build`) | The "`<screen>`" screen did not build: `<the bundler's words>` | build | no | Fix what the bundler names. |

## 3. No element carries a style, a class or raw HTML

| Code | Refused with | validate | server | How to fix |
|---|---|---|---|---|
| `style_forbidden` | The element's own refusal, followed by the reason. For `style`: Brydio draws every element in its own style; there is no style setting. For `class` and `className`: There are no classes in a Brydio app; choose a setting the element offers. For `color` and `colour`: Colours come from Brydio’s tokens through a setting like tone, never a value. For `dangerouslySetInnerHTML` and `innerHTML`: A Brydio app has no HTML to set. | yes | runtime, as the element's refusal without the reason | Use the element's own settings (`tone`, `variant`, `gap`). |

A screen also runs in a worker with no page, no network, no storage and no
other workers, and it may import only `@brydio/*`, Preact and its own files:

| Code | Refused with | validate | server | How to fix |
|---|---|---|---|---|
| `dom_global` | `<name>`: A screen has no page: it runs in a worker and draws only with the catalogue. | yes | runtime (the worker has none) | Draw with elements. |
| `network_global` | `<name>`: A screen has no network; call the app’s tools instead. | yes | runtime | Call the app's tools. |
| `storage_global` | `<name>`: A screen has no storage; keep records in the app’s collections. | yes | runtime | Keep records in a collection. |
| `worker_global` | `<name>`: A screen is one module in one worker; there is nothing else to start or load. | yes | runtime | Build everything into the screen. |
| `eval_forbidden` | eval is refused in a Brydio app’s worker; write the code out. | yes | runtime | Write the code out. |
| `import_not_allowed` | import "`<specifier>`": a screen imports only its own files, @brydio packages and Preact. Anything else it needs belongs in the SDK. | yes | no | Import only `@brydio/*`, `preact`, `preact/hooks`, `preact/jsx-runtime` and your own files. |

## 4. Every collection has a schema, and a version that changes one declares its migration

Every collection must have a `schema`; the manifest checks in section 1
refuse one without. A version whose collections differ from the version
published before it must list `migrations` steps for its own version
number (`add`, `rename`, `drop`, `dropCollection`, `replace`), in Brydio's
A3-F07 shape.

`validate` compares against the previous version when it can see it:

- `--previous <app.json or folder>`, pointing at the manifest of the version
  published before this one, or
- a `dist/app.json` built from a lower version, when no `--previous` is given.

When neither is there, only the publish route runs this check. It compares
against the highest version already published below this one.

| Code | Refused with | validate | server | How to fix |
|---|---|---|---|---|
| `migration_missing` | `<why>` (`<version>` against `<previous>`, the version before it.) `<why>` is one of the sentences in the next table. `validate` lists every one; the route stops at the first. | with a previous version: `--previous <app.json>`, an older `dist/`, or, in `brydio publish`, the version Brydio last published (`GET /api/v1/apps/publish/:appKey/latest`), checked before uploading | publish | Add the step to `migrations` under this version's number. |
| `previous_unreadable` | There is no manifest at `<path>` to compare this version with. Or: `<path>` is not valid JSON, so this version can't be compared with it. | yes | no | Point `--previous` at the published version's `app.json`. |
| `previous_not_older` | `<path>` is version `<v>`, not one before `<version>`, so it can't say what this version changes. | yes | no | Point `--previous` at an earlier version. |

The reasons behind `migration_missing`, from `@brydio/manifest`'s copy of
Brydio's `migrations.ts`:

| Code | Refused with | validate | server | How to fix |
|---|---|---|---|---|
| `migration_unexplained` | `<collection>.<field>` is new; add it with a step (and a default, when the field is required). Or: `<collection>.<field>` is gone; drop it or rename it with a step. Or: `<collection>` is no longer declared; say dropCollection to remove its records. | with a previous version | publish | `{ "op": "add" }`, `"rename"`, `"drop"` or `"dropCollection"`. |
| `migration_type_changed` | `<collection>.<field>` changed type; drop `` `<field>` `` and add it again under a new name. Or: `<collection>.<field>` became required, and records without it would not be readable; add a new field with a default instead. | with a previous version | publish | Drop the field and add a new one. |
| `migration_value_removed` | `<collection>.<field>` no longer allows "`<value>`"; say which value replaces each. | with a previous version | publish | `{ "op": "replace", "from": …, "to": … }`. |
| `migration_default_missing` | add `<collection>.<field>`: a required field needs a default for the records already kept. | with a previous version | publish | Give the `add` step a `default`. |
| `migration_default_invalid` | add `<collection>.<field>`: the default is not valid; `<why>` | with a previous version | publish | Fix the default. |
| `migration_step_invalid` | `<op> <collection>.<field>`: there is no such field (or collection, or value). | with a previous version | publish | Fix the step so it names what the previous version had. |
| `migration_step_pointless` | `<op> <collection>.<field>`: the new version still declares it (or does not declare it). | with a previous version | publish | Remove the step. |

## 5. Every tool the manifest exposes is generated or has a handler

An app's tools are the ones Brydio generates for its collections
(`create_`, `update_`, `get_`, `list_`, `search_`, `delete_`). `tools.custom`
must be empty until handler scripts arrive (Phase 3), so a declared tool with
no handler is `manifest_invalid` ("Custom tools are not available yet.").
Screens may call only tools that exist:

| Code | Refused with | validate | server | How to fix |
|---|---|---|---|---|
| `tool_unknown` | "`<tool>`" is not one of this app's tools. Its tools are `<list>`. | yes | runtime | Call a generated tool, or declare the collection that generates it. |
| `collection_unknown` | "`<collection>`" is not one of this app's collections. It keeps `<list>`. | yes | runtime | Read a declared collection. |

## 6. The bundle is under the cap, and holds only scripts and the manifest

| Code | Refused with | validate | server | How to fix |
|---|---|---|---|---|
| `bundle_not_built` | There is no dist/ yet. Run brydio build first. | yes | no | Run `brydio build`. |
| `screen_not_built` | The "`<screen>`" screen names "`<entry>`", which is not a script in this bundle. Run brydio build. | yes | publish | Run `brydio build`, or fix the entry. |
| `bundle_stale` (warning) | The built manifest is not the manifest as it is now. Run brydio build again. | yes | no | Run `brydio build`. |
| `bundle_too_large` | That bundle is `<size>`, over the 1.00 MB cap. The largest file is "`<file>`" at `<size>`. | yes | publish | Make the screens smaller; start with the largest file. |
| `bundle_file_not_code` | "`<file>`" is not a script. A bundle holds only .js files and app.json. (From `brydio build`: The "`<screen>`" screen brings in "`<file>`", which a bundle cannot hold. A Brydio app has no CSS, HTML or images: Brydio draws every element itself.) | yes | publish | Remove the import of CSS, HTML or images. |
| `runtime_too_large` | The "`<screen>`" screen carries `<n>` KB of Brydio's runtime, over the 30 KB a screen may carry. Something in @brydio is being bundled that this screen does not use. | no: `brydio build` (minified) refuses it, and `validate` reads a build | no | Import what the screen uses from `@brydio/app`, not a schema or checking library; say so on the channel if the SDK itself leaks. |
| `bundle_path_invalid` | "`<path>`" is not a path a bundle can hold. | yes | publish | Use plain ASCII names with no hidden segments. |
| `bundle_manifest_missing` | That bundle has no app.json at its root. | yes | publish | Run `brydio build`. |
| `bundle_empty` | That bundle has no screens in it, only a manifest. | yes | publish | Declare and build a screen. |
| `archive_unreadable`, `archive_too_large`, `archive_uncompressed_too_large`, `archive_too_many_entries`, `archive_member_path_absolute`, `archive_member_path_has_parent_segment`, `archive_member_path_has_backslash`, `archive_member_path_invalid`, `archive_member_type_unsupported`, `skill_directory_hidden` | The archive reader's sentence, at bundle scale ("That upload is larger than 2 MB. A bundle is at most 1 MB of code."). | no: `brydio publish` writes the zip itself | publish | Publish with `brydio publish` rather than a zip made by hand. |

## 7. No secret-looking string in the bundle

| Code | Refused with | validate | server | How to fix |
|---|---|---|---|---|
| `secret_in_bundle` | That package contains a secret. Header values and client secrets are entered here, never shipped in a file — remove it and import again. | yes | publish | Remove the value, and treat it as leaked. |

This is Brydio's existing scan (`extensions/apps/secret-scan.ts`), copied
exactly. It looks at the value keys (`value`, `secret`, `token`, `apiKey`, …)
anywhere in the bundle's `app.json`, and in `servers.json` and
`integrations/*.json`, and skips placeholders like `${user_config.key}` or
`<your key>`. `app.json` is served to every screen that opens the app, so it
holds nothing private. Scripts aren't scanned, on purpose: a pattern scan of
minified code misses real keys and refuses innocent strings.

## 8. The grants list everything the screens call, and nothing they don't

A tool counts as granted when its name, `*`, or its collection's name is in
`grants.tools`, as long as its collection is also granted. That is how
Brydio reads grants (`apps/api/src/apps/manifest/grants.ts`). `validate`
checks the calls a screen writes out: `tools.call('…')`, `tools.result('…')`,
`data.get('…')`, `data.list('…')`, `useList('…')`, the bridge's `callTool`,
`getDocument` and `listDocuments`, and `navigate(…)`. Asking for too little
is an error. Asking for too much is a warning: a tool grant may be meant for
the assistant rather than a screen.

| Code | Refused with | validate | server | How to fix |
|---|---|---|---|---|
| `grant_collection_missing` | app.json: "grants.collections": `<collection>` is kept but not asked for: add it to grants.collections. | yes | publish | Add the collection, or `*`, to `grants.collections`. |
| `grant_tool_missing` | "`<tool>`" is called here but not asked for: add it, or its collection `<collection>`, to grants.tools. | yes | runtime | Add the tool or its collection to `grants.tools`. |
| `grant_host_missing` | navigate is called here but not asked for: add "navigate" to grants.host. | yes | runtime | Add `navigate` to `grants.host`. |
| `grant_unknown` | app.json asks for "`<grant>`", which Brydio does not grant. An app may ask for navigate, message, members, projects or connection:<name>. | yes | publish | Ask only for `navigate`, `message`, `members`, `projects` or `connection:<name>`. |
| `grant_tool_unknown` (warning) | grants.tools asks for "`<name>`", which is neither one of this app's tools nor one of its collections. | yes | no | Remove the name, or fix its spelling. |
| `grant_collection_unknown` (warning) | grants.collections asks for "`<name>`", which this app does not keep. | yes | no | Remove the name. |
| `grant_host_unused` (warning) | grants.host asks for "`<grant>`", which no screen uses. Ask only for what the app does. | yes | no | Remove the grant, or use it. |

## Only at publish

The publish route runs these; the command line can't, or checks them in its
own step.

| Code | Refused with | validate | server | How to fix |
|---|---|---|---|---|
| `sdk_unsupported` | This app was built with SDK `<v>`. Brydio runs apps built with SDK `<oldest>` or newer, before `<before>`. (Or: app.json does not say which SDK built it. Build it with brydio build. …) | no: `brydio publish` checks it before uploading, against `GET /api/v1/apps/sdk` | publish | Build with an SDK in the range. |
| `screenshot_failed` | `<screen>, <narrow or wide>, <light or dark>`: the screen stopped, had a node refused, threw, or drew nothing, when pictured in the fake host with `.brydio/samples.json`. (Or: pictures need `@brydio/fake-host` in the app's devDependencies.) | no: `brydio publish` pictures every screen before uploading | publish, as `screenshot_invalid` for a picture the server refuses | Fix the screen so it draws with the sample records, or fix `.brydio/samples.json`. |
| `version_exists` | `<app> <version>` was already published on `<date>` `<how it differs>`. A version is never replaced; publish this as a new version number. | no | publish (409) | Raise the version number. |
| `not_publisher` | `<app>` is published by other accounts. Ask one of them to add you as a publisher. | no | publish (403) | Ask a publisher to add you. |
| `manifest_unreadable` | app.json is not valid JSON. (Or: app.json is not a JSON object.) | no: `manifest_not_json` covers it | publish | Fix the JSON. |
