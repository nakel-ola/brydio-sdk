/** `@brydio/cli`: the commands, as functions, for scripts and tests. */

export { build, describeBuild, sdkVersionFor, type BuildOptions, type BuildResult } from './build.ts';
export { dev, DevRefused, DEV_CONFIG, DEV_PATH, type DevOptions, type DevSession } from './dev.ts';
export { DIST, MANIFEST_PATHS, formatProblem, readProject, sourceOf, type Problem, type Project } from './project.ts';
export { FORBIDDEN_GLOBALS, checkSource, type SourceProblemCode } from './source-checks.ts';
export { checkSources, screenCalls, validate, type ValidateOptions, type ValidateResult } from './validate.ts';
export { callsOf, type ScreenCall } from './calls.ts';
export { grantProblems } from './grant-checks.ts';
export { main } from './main.ts';
export { API_URL_ENV, PUBLISH_PATH, SDK_PATH, TOKEN_ENV, publish, type PublishOptions, type Published } from './publish.ts';
export { zipFiles } from './zip.ts';
export { test, type TestOptions } from './test.ts';
