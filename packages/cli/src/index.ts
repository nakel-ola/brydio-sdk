/** `@brydio/cli`: the commands, as functions, for scripts and tests. */

export { build, describeBuild, sdkVersionFor, type BuildOptions, type BuildResult } from './build.ts';
export { dev, type DevOptions } from './dev.ts';
export { DIST, MANIFEST_PATHS, formatProblem, readProject, sourceOf, type Problem, type Project } from './project.ts';
export { FORBIDDEN_GLOBALS, checkSource, type SourceProblemCode } from './source-checks.ts';
export { checkSources, validate, type ValidateResult } from './validate.ts';
export { main } from './main.ts';
export { API_URL_ENV, PUBLISH_PATH, TOKEN_ENV, publish, type PublishOptions, type Published } from './publish.ts';
export { zipFiles } from './zip.ts';
export { test, type TestOptions } from './test.ts';
