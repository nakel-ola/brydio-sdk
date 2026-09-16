/**
 * Which SDK built a version, and whether a Brydio runs it (A5-F04-S03).
 *
 * `brydio build` writes the `@brydio/app` version it built against into the
 * bundle's `app.json` as `sdk`. Brydio says which versions it runs at
 * `GET /api/v1/apps/sdk` as `{ oldest, before }`, and refuses a publish
 * outside them as `sdk_unsupported` (422, `at: "sdk"`). `brydio publish` asks
 * first and refuses with the same sentence before uploading anything.
 *
 * Copies of the server's `apps/api/src/apps/publishing/sdk-support.ts`
 * (`sdkRefusal`, given the range rather than reading the host's constant) and
 * `apps/api/src/apps/versions/compare-versions.ts`, word for word;
 * `manifest.test.ts` compares them whenever a Brydio checkout sits beside
 * this repository.
 */

/** The SDK versions a Brydio runs: from `oldest`, up to but not including `before`. */
export interface SdkSupport {
  oldest: string;
  before: string;
}

/** Null when an app built with this SDK can run on a Brydio with this support; otherwise the sentence why not. */
export function sdkRefusal(sdk: unknown, support: SdkSupport): string | null {
  const range = `Brydio runs apps built with SDK ${support.oldest} or newer, before ${support.before}.`;

  if (typeof sdk !== 'string' || sdk.length === 0) {
    return `app.json does not say which SDK built it. Build it with brydio build. ${range}`;
  }

  // `before` excludes its own prereleases too: 0.2.0-beta is not a 0.1 SDK.
  if (compareVersions(sdk, support.oldest) < 0 || compareVersions(sdk, `${support.before}-0`) >= 0) {
    return `This app was built with SDK ${sdk}. ${range}`;
  }

  return null;
}

/**
 * Which of two version numbers is newer, by semver's precedence rules. Build
 * metadata (`+abc`) is ignored, as semver says.
 *
 * Negative when `a` is older, positive when newer, zero when they are the
 * same release.
 */
export function compareVersions(a: string, b: string): number {
  const [coreA, preA] = split(a);
  const [coreB, preB] = split(b);

  for (let i = 0; i < 3; i++) {
    const difference = (coreA[i] ?? 0) - (coreB[i] ?? 0);

    if (difference !== 0) return Math.sign(difference);
  }

  // A release is newer than any of its prereleases.
  if (preA.length === 0 || preB.length === 0) return Math.sign(preB.length - preA.length);

  for (let i = 0; i < Math.max(preA.length, preB.length); i++) {
    const x = preA[i];
    const y = preB[i];

    // A longer prerelease with the same start is newer: 1.0.0-beta < 1.0.0-beta.1.
    if (x === undefined) return -1;
    if (y === undefined) return 1;

    const numericX = /^\d+$/.test(x);
    const numericY = /^\d+$/.test(y);

    if (numericX && numericY) {
      const difference = Number(x) - Number(y);

      if (difference !== 0) return Math.sign(difference);
    } else if (numericX !== numericY) {
      // Numbers sort before words: 1.0.0-1 < 1.0.0-alpha.
      return numericX ? -1 : 1;
    } else if (x !== y) {
      return x < y ? -1 : 1;
    }
  }

  return 0;
}

function split(version: string): [number[], string[]] {
  const withoutBuild = version.split('+')[0]!;
  const dash = withoutBuild.indexOf('-');
  const core = dash === -1 ? withoutBuild : withoutBuild.slice(0, dash);
  const pre = dash === -1 ? '' : withoutBuild.slice(dash + 1);

  return [core.split('.').map(Number), pre ? pre.split('.') : []];
}
