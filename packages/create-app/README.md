# @brydio/create-app

Create a Brydio app from the packaged Preact template:

```sh
npm create @brydio/app my-app
cd my-app
bun run test
bun run dev
```

Use `--template plain` after the app name for Brydio's framework-free element
functions instead. The generated app uses exact registry versions of the
Brydio SDK and includes a manifest, one screen, one collection, and tests.

The generated project and this initializer require Bun 1.3 or newer. This
package is MIT licensed.
