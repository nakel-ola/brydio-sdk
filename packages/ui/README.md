# @brydio/ui

The catalogue of elements a Brydio app draws with: their names, settings and
events, as data (`CATALOGUE`) and as types. `brydio validate`, the worker
runtime and the fake host all read it. Brydio's own
`packages/app/src/apps/catalogue/elements.ts` is the original, and
`test/catalogue.test.ts` holds the two to each other.

## `@brydio/ui/web`: the same elements as web components

For HTML views only: an MCP App from an outside server, or anything Brydio
shows outside its own window. Link the build and write the elements:

```html
<script type="module" src="…/@brydio/ui/web"></script>
<bry-button label="Save" variant="primary"></bry-button>
```

Each element has the catalogue's name, its settings as properties and as
kebab-case attributes (`hideLabel` is `hide-label`; a list or a record is JSON),
and its events as DOM events of the same name (`press`, `change`, …) that
bubble out of the element. The classes are made from `CATALOGUE` when the
build loads, so an element added to the catalogue is here after a build, with
no second copy to write.

App screens don't use this. Brydio draws them with its own React kit, and
nothing built on the SDK needs the web components.

### Why Lit

The web components are built on [Lit](https://lit.dev), pinned to one major
version (`lit` 3 in `package.json`).

- **It's small:** about 5 KB.
- **It's maintained by Google,** and it's what Adobe Spectrum's web components
  are built on.
- **It adds nothing beyond the web component standard** that we'd have to
  migrate away from. A Lit element is a custom element with reactive
  properties and a template.

FAST wasn't chosen: when it changed course, Microsoft's own toolkit for
extension UIs, built on it, was deprecated rather than rewritten, and every
extension using it was stranded. Stencil and similar tools weren't chosen
because they compile to a runtime we wouldn't own.

Lit is imported in exactly one file, `src/web/base.ts`. Every element extends
its `BryElement` and takes `html` and `css` from there, so replacing Lit means
changing that file and rebuilding. `test/web.test.ts` fails if any other file
imports it.
