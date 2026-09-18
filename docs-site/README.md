# SDK documentation site

Run these commands from the repository root.

## Build

```sh
bun run docs:build
```

The static site is written to `docs-site/dist`. Set `DOCS_BASE_PATH` when it
will live below a path prefix. For example:

```sh
DOCS_BASE_PATH=/sdk/ bun run docs:build
```

## Preview

Build first, then serve the static directory locally:

```sh
bun run docs:build
python3 -m http.server --directory docs-site/dist 8080
```

Open `http://localhost:8080` in a browser. This server has no rewrite rules;
the site uses folder index routes such as `/bridge/`.

## Regenerate renderer images

```sh
bun run docs:images
```

This command needs Chrome. Set `BROWSER_BIN` to an executable browser path if
Chrome is not installed in one of the documented default locations.

## Check drift

```sh
bun run docs:check
```

This runs the generated-reference pins, all docs-site tests, a clean static
build, and TypeScript checks. It does not regenerate images or start Chrome.
