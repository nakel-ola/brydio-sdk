import { ACCESS, TAG_FORMAT, registryApp, type Access } from './publish.ts';
import { RegistryRefused, appAndVersion, bodyOf, path, refusalOf, registry, turnedAway, type Answer, type Registry, type RegistryOptions } from './registry.ts';

/**
 * What a publisher changes about an app already on the registry, without
 * publishing (PB04, PB17): `tag`, `tags`, `deprecate`, `access` and `retire`.
 *
 * None of them changes a version: a version is never replaced. A tag points
 * at one, a deprecation is a message beside one, access is who may install
 * the app, and retiring stops new versions for good.
 */

export interface AppCommandOptions extends RegistryOptions {
  /** `deprecate --undo`: take the message off. */
  undo?: boolean;
  /** `retire` is never undone, so it wants this. */
  yes?: boolean;
}

async function refusing(out: (line: string) => void, work: () => Promise<number>): Promise<number> {
  try {
    return await work();
  } catch (error) {
    if (!(error instanceof RegistryRefused)) throw error;

    out(error.message);

    return error.code;
  }
}

/** A route's own refusals, with the registry's sentence and code, before the shared ones. */
function refused(answer: Answer, reg: Registry, own: Record<number, string>): RegistryRefused {
  const { code, message } = refusalOf(answer.body);

  if (own[answer.status] !== undefined) return new RegistryRefused(`${message ?? own[answer.status]}${code ? ` [${code}]` : ''}`);

  return new RegistryRefused(turnedAway(answer, reg));
}

/** `brydio tag <app>@<version> <tag>`: point a tag at a version, as `npm dist-tag add` does. */
export function tag(words: string[], options: AppCommandOptions = {}): Promise<number> {
  const out = options.out ?? console.log;

  return refusing(out, async () => {
    const { app, version } = appAndVersion(words[0], 'brydio tag <app>@<version> <tag>, like brydio tag tasks@1.4.0 latest.');
    const name = words[1];

    if (!name) throw new RegistryRefused(`Say which tag: brydio tag ${app}@${version} <tag>, like latest or beta.`, 2);

    if (!TAG_FORMAT.test(name)) throw new RegistryRefused(`"${name}" is not a tag. A tag is a lower-case word of up to 32 letters, digits and dashes, like latest or beta.`, 2);

    const reg = registry(options, 'signedIn');

    out(`Registry ${reg.url}`);

    const before = await registryApp(reg, app);

    if (!before) throw new RegistryRefused(`${reg.url} has no app called ${app}.`);

    const answer = await reg.send<{ tag: string; version: string }>('PUT', path.tag(app, name), { version });

    if (answer.status !== 200) throw refused(answer, reg, { 404: `${app} has no version ${version}.`, 409: `The ${name} tag can't point at ${app} ${version}.`, 422: `The ${name} tag can't point at ${app} ${version}.` });

    const was = before.tags[name];

    out(was === answer.body.version ? `${app}'s ${name} tag already pointed at ${version}. Nothing changed.` : `${app}'s ${name} tag now points at ${answer.body.version}${was ? `, moved from ${was}` : ''}.`);
    out(`Installs that follow ${name} move to it once Brydio has it approved for them. brydio tags ${app} ${name} shows every move.`);

    return 0;
  });
}

/** `brydio tags <app> [tag]`: an app's tags, or one tag's history of moves. */
export function tags(words: string[], options: AppCommandOptions = {}): Promise<number> {
  const out = options.out ?? console.log;

  return refusing(out, async () => {
    const [app, name] = words;

    if (!app) throw new RegistryRefused('Say which app: brydio tags <app> [tag].', 2);

    const reg = registry(options);

    out(`Registry ${reg.url}`);

    if (name) {
      const history = bodyOf<{ version: string; movedBy: string; movedAt: string }[]>(await reg.send('GET', `${path.tag(app, name)}/history`), reg, [200]);

      if (!history.length) out(`${app}'s ${name} tag has never pointed at a version.`);

      for (const move of history) out(`  ${move.movedAt}  ${move.version.padEnd(12)}  by ${move.movedBy}`);

      return 0;
    }

    const found = await registryApp(reg, app);

    if (!found) throw new RegistryRefused(`${reg.url} has no app called ${app}.`);

    out(`${found.key}, published by ${found.publisher}, ${found.access} access${found.retired ? ', retired' : ''}`);

    for (const [one, version] of Object.entries(found.tags).sort()) out(`  ${one.padEnd(10)} ${version}`);

    for (const one of found.versions) {
      out(`  ${one.version.padEnd(12)} ${one.state.padEnd(9)} ${one.publishedAt}${one.deprecated ? `  deprecated: ${one.deprecated}` : ''}`);
    }

    return 0;
  });
}

/** `brydio deprecate <app>@<version> "<message>"`, or `--undo`: warn admins off a version, as `npm deprecate` does. */
export function deprecate(words: string[], options: AppCommandOptions = {}): Promise<number> {
  const out = options.out ?? console.log;

  return refusing(out, async () => {
    const { app, version } = appAndVersion(words[0], 'brydio deprecate <app>@<version> "<message>", like brydio deprecate tasks@1.3.0 "data bug, use 1.3.1".');
    const message = words.slice(1).join(' ').trim();

    if (options.undo && message) throw new RegistryRefused('--undo takes the message off, so give no message with it.', 2);

    if (!options.undo && !message) {
      throw new RegistryRefused(`Say why, for the admins of workspaces on it: brydio deprecate ${app}@${version} "<message>". To take a deprecation off, add --undo.`, 2);
    }

    if (message.length > 500) throw new RegistryRefused(`That message is ${message.length} characters. Keep it to 500: admins read it on the app's page.`, 2);

    const reg = registry(options, 'signedIn');

    out(`Registry ${reg.url}`);

    const answer = await reg.send('PUT', `${path.version(app, version)}/deprecation`, { message: options.undo ? null : message });

    if (answer.status !== 200 && answer.status !== 204) throw refused(answer, reg, { 404: `${app} has no version ${version}.`, 422: 'The registry did not take that message.' });

    out(
      options.undo
        ? `${app} ${version} is no longer deprecated.`
        : `${app} ${version} is deprecated. Admins of workspaces on it see: "${message}". It still installs and runs; nothing is removed.`,
    );

    return 0;
  });
}

/** `brydio access <app> workspace|public`. */
export function access(words: string[], options: AppCommandOptions = {}): Promise<number> {
  const out = options.out ?? console.log;

  return refusing(out, async () => {
    const [app, wanted] = words;

    if (!app || !wanted) throw new RegistryRefused('Say which app and who may install it: brydio access <app> workspace|public.', 2);

    if (!ACCESS.includes(wanted as Access)) {
      throw new RegistryRefused(`Access is workspace (your publisher's own workspaces) or public (the store, after Brydio's review), not "${wanted}".`, 2);
    }

    const reg = registry(options, 'signedIn');

    out(`Registry ${reg.url}`);

    const before = await registryApp(reg, app);

    if (!before) throw new RegistryRefused(`${reg.url} has no app called ${app}.`);

    if (before.access === wanted) {
      out(`${app} already has ${wanted} access. Nothing changed.`);

      return 0;
    }

    const answer = await reg.send('PUT', `${path.app(app)}/access`, { access: wanted });

    if (answer.status !== 200 && answer.status !== 204) throw refused(answer, reg, { 422: `${app} can't have ${wanted} access.` });

    out(`${app} now has ${wanted} access.`);
    out(
      wanted === 'public'
        ? "Its versions go to Brydio's review, and it shows in the store once one is approved."
        : "It leaves the store and no new workspace can install it. Workspaces that have it keep it and keep getting new versions on their tag.",
    );

    return 0;
  });
}

/** `brydio retire <app> --yes`: no more versions, ever. */
export function retire(words: string[], options: AppCommandOptions = {}): Promise<number> {
  const out = options.out ?? console.log;

  return refusing(out, async () => {
    const [app] = words;

    if (!app) throw new RegistryRefused('Say which app: brydio retire <app> --yes.', 2);

    if (!options.yes) {
      out(`Retiring ${app} is never undone: no new version of it can be published again, under any number.`);
      out('Every workspace that has it is told, keeps running its last version, and sees "No longer maintained" with export and uninstall.');
      out(`If that is what you mean, run brydio retire ${app} --yes.`);

      return 2;
    }

    const reg = registry(options, 'signedIn');

    out(`Registry ${reg.url}`);

    const answer = await reg.send('POST', `${path.app(app)}/retire`, {});

    if (answer.status !== 200 && answer.status !== 204) throw refused(answer, reg, { 404: `${reg.url} has no app called ${app}.` });

    out(`${app} is retired. Workspaces that have it keep its last version and are told it is no longer maintained.`);

    return 0;
  });
}
