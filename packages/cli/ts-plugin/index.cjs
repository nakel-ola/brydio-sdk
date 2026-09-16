// The TypeScript language service plugin `@brydio/cli/ts-plugin` (A5-F03-S03).
// tsserver `require`s this; the checks are built into plugin.cjs from src/ts-plugin.ts.
const built = require('./plugin.cjs');

module.exports = built.default || built;
