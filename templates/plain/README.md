# Checklist

A Brydio app: a checklist shown as a tab on a project. Made with
`brydio create`, from the plain template: the same app as the Preact
template, built with Brydio's element functions and no framework.

## The files

| File | What it is for |
|---|---|
| `.brydio/app.json` | The manifest: the app's name, where it can be shown (a project tab), its one collection (`items`: a title, done, a note) and its one screen. |
| `src/screens/home.ts` | The screen: built once from `stack()`, `input()`, `button()` and the rest, with the list redrawn by `replaceChildren` whenever `items` changes. |
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

## Plain or Preact

Built the same way, this screen is **26.5 KB** and the Preact template's
is **42.1 KB**: 15.6 KB, or 37%, smaller (8.4 KB against 14.5 KB gzipped).
The difference is Preact itself. What you give up for it is components and
hooks: here you keep the nodes you need and change them yourself.

## The elements

Every element, its settings and its events are in the SDK's catalogue,
`@brydio/ui` (`packages/ui/src/catalogue.ts` in the SDK), and each is drawn
live in Brydio at `/apps/catalogue`. An element or setting that isn't there
is refused, so the editor's type check is the documentation too.
