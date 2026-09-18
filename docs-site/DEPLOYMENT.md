# Cloudflare Workers deployment

`wrangler.jsonc` configures `brydio-sdk-docs` as static assets only. It has no
Worker entry point, binding, route, secret, or runtime network dependency.

## Workers Builds inputs

- Root directory: `/`
- Build command: `bun run docs:build`
- Deploy command: `bun run docs:deploy`
- Output directory: `docs-site/dist`
- Bun 1.3.11
- Optional base path: `DOCS_BASE_PATH`
- No secrets
- No network fetches
- No rewrites

The static build writes folder index files, so Workers' default HTML handling
serves paths such as `/bridge/` without a custom rewrite.

## Open owner decisions

Domain, production URL, and deployment trigger are open.

Before the first live deployment, create or select the matching Worker in
Cloudflare and choose those values. Then run:

```sh
bun run docs:deploy
```

The checked-in `docs:deploy` command publishes static assets. It is not part of
the local verification flow.
