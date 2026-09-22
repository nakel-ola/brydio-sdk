# Checklist

A Brydio app: a checklist shown as a tab on a project. Made with
`brydio create`, from the Preact template.

## The files

| File | What it is for |
|---|---|
| `.brydio/app.json` | The manifest: the app's name, where it can be shown (a project tab), its one collection (`items`: a title, done, a note) and its one screen. |
| `src/screens/home.tsx` | The screen: a Preact component made of Brydio's own elements (`<bry-stack>`, `<bry-input>`, …). It reads `items` and writes through the tools Brydio makes for them. |
| `test/home.test.ts` | Runs the screen in the fake host, with no Brydio and no browser. |
| `package.json` | The scripts below, and the SDK. |
| `dist/` | What `brydio build` writes. Don't edit it. |

## Running it

```sh
bun run dev        # brydio dev: a tab in your own project, redrawn on every save
bun run test       # brydio test: the tests, against the fake host
bun run validate   # brydio validate: what Brydio would refuse at publish
```

`brydio dev` signs in with `BRYDIO_API_URL` and `BRYDIO_TOKEN`, asks once
which project to use, and remembers it in `.brydio/dev.json`.

## Brydio's AI

A custom tool's handler can ask Brydio's model with the `model` host grant
(`model.generate`). It needs no key, and the calls are counted against your
publisher. A developer API key (`BRYDIO_API_KEY`) is for your own server
with `@brydio/api/ai`, never for this app: `bun run validate` refuses an app
that holds one. See the SDK's `docs/ai.md`.

## The elements

Every element, its settings and its events are in the SDK's catalogue,
`@brydio/ui` (`packages/ui/src/catalogue.ts` in the SDK), and each is drawn
live in Brydio at `/apps/catalogue`. An element or setting that isn't there
is refused, so the editor's type check is the documentation too.
