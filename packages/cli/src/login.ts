import { spawn } from 'node:child_process';

import {
  RegistryRefused,
  bodyOf,
  choosePublisher,
  path,
  readLogins,
  refusalOf,
  registry,
  turnedAway,
  writeLogins,
  type Me,
  type RegistryOptions,
  type RegistryUser,
} from './registry.ts';

/**
 * `brydio login`, `logout`, `whoami` and `publishers` (PB03).
 *
 * Login is a device flow: the registry gives a short code and its own sign-in
 * page, the person signs in there with their Brydio account in the browser,
 * and this command asks every couple of seconds until the registry hands it a
 * token. The token is kept in `~/.brydio/registry.json`, readable by this
 * account alone, and never printed.
 */

export interface LoginOptions extends RegistryOptions {
  /** Opens the sign-in page; by default the system's browser. `false` only prints it. */
  open?: false | ((url: string) => void);
  /** How long to wait between asks, in milliseconds. */
  pollMs?: number;
  /** For tests: waits, some other way. */
  sleep?: (ms: number) => Promise<void>;
}

/** Runs one command, answering an exit code and turning a refusal into its sentence. */
async function refusing(out: (line: string) => void, work: () => Promise<number>): Promise<number> {
  try {
    return await work();
  } catch (error) {
    if (!(error instanceof RegistryRefused)) throw error;

    out(error.message);

    return error.code;
  }
}

export function login(options: LoginOptions = {}): Promise<number> {
  const out = options.out ?? console.log;

  return refusing(out, async () => {
    // A login starts with no token, whatever is kept: a new one replaces it.
    const reg = registry({ ...options, token: '' });
    const started = bodyOf<{ code?: unknown; verifyUrl?: unknown; pollToken?: unknown; expiresIn?: unknown }>(await reg.send('POST', path.loginStart, {}), reg);

    if (typeof started?.code !== 'string' || typeof started.verifyUrl !== 'string' || typeof started.pollToken !== 'string') {
      throw new RegistryRefused(`${reg.url} answered ${path.loginStart} with something other than { code, verifyUrl, pollToken, expiresIn }. Is that a Brydio app registry?`);
    }

    const expiresIn = typeof started.expiresIn === 'number' && started.expiresIn > 0 ? started.expiresIn : 600;

    out(`Logging in to ${reg.url}.`);
    out(`Open ${started.verifyUrl} and sign in with your Brydio account.`);
    out(`Check that the page shows this code: ${started.code}`);

    if (options.open !== false) (options.open ?? openInBrowser)(started.verifyUrl);

    const sleep = options.sleep ?? ((ms: number) => new Promise<void>(done => setTimeout(done, ms)));
    const pollMs = options.pollMs ?? 2_000;
    const until = Date.now() + expiresIn * 1000;

    for (;;) {
      const answer = await reg.send<{ token?: unknown; user?: RegistryUser }>('POST', path.loginPoll, { pollToken: started.pollToken });
      const { code } = refusalOf(answer.body);

      if (answer.status === 200 && typeof answer.body?.token === 'string') {
        const user = answer.body.user && typeof answer.body.user.id === 'string' ? answer.body.user : { id: '', name: 'this account' };
        const file = readLogins(options);

        writeLogins({ current: reg.url, logins: { ...file.logins, [reg.url]: { token: answer.body.token, user, savedAt: new Date().toISOString() } } }, options);
        out(`Logged in to ${reg.url} as ${user.name}${user.id ? ` (${user.id})` : ''}.`);
        out('The token is kept on this computer, readable by your account alone. It can publish apps to the registry and nothing else.');

        return 0;
      }

      if (answer.status === 410 || code === 'expired') throw new RegistryRefused('The code ran out before the sign-in finished. Run brydio login again.');

      if (answer.status === 403 || code === 'denied') throw new RegistryRefused('The sign-in was turned down in the browser, so this computer is not logged in.');

      if (answer.status !== 428 && code !== 'pending') throw new RegistryRefused(turnedAway(answer, reg));

      if (Date.now() >= until) throw new RegistryRefused('The code ran out before the sign-in finished. Run brydio login again.');

      await sleep(pollMs);
    }
  });
}

export function logout(options: RegistryOptions = {}): Promise<number> {
  const out = options.out ?? console.log;

  return refusing(out, async () => {
    const reg = registry(options);
    const file = readLogins(options);

    if (!file.logins[reg.url]) {
      out(`This computer is not logged in to ${reg.url}, so there is nothing to log out of.`);

      return 0;
    }

    // Revoked at the registry when it can be. Forgotten here whatever it says,
    // so a registry that is down never leaves a token behind on this computer.
    let revoked = false;

    try {
      const answer = await reg.send('POST', path.logout);

      revoked = answer.status === 204 || answer.status === 200 || answer.status === 401;
    } catch {
      revoked = false;
    }

    const { [reg.url]: _, ...rest } = file.logins;

    writeLogins({ ...(file.current && file.current !== reg.url ? { current: file.current } : {}), logins: rest }, options);
    out(`Logged out of ${reg.url}.`);

    if (!revoked) out('The registry could not be told, so the token still works there until it runs out. It is gone from this computer.');

    return 0;
  });
}

export function whoami(options: RegistryOptions = {}): Promise<number> {
  const out = options.out ?? console.log;

  return refusing(out, async () => {
    const reg = registry(options, 'signedIn');
    const me = bodyOf<Me>(await reg.send('GET', path.me), reg);

    out(`${me.user.name} (${me.user.id}) on ${reg.url}.`);

    if (!me.publishers.length) out('Not in any publisher yet. Make one with brydio publishers create "<name>".');

    for (const one of me.publishers) out(`  ${one.name} (${one.id}), ${one.role}`);

    return 0;
  });
}

/** `brydio publishers` lists them; `brydio publishers create <name>` makes one. */
export function publishers(words: string[], options: RegistryOptions & { publisher?: string } = {}): Promise<number> {
  const out = options.out ?? console.log;
  const [command, ...rest] = words;

  return refusing(out, async () => {
    const reg = registry(options, 'signedIn');

    if (command === undefined || command === 'list') {
      const me = bodyOf<Me>(await reg.send('GET', path.me), reg);

      out(`Publishers ${me.user.name} is in, on ${reg.url}:`);

      if (!me.publishers.length) out('  none yet. Make one with brydio publishers create "<name>".');

      for (const one of me.publishers) out(`  ${one.name} (${one.id}), ${one.role}`);

      return 0;
    }

    if (command === 'show') {
      const me = bodyOf<Me>(await reg.send('GET', path.me), reg);
      const chosen = choosePublisher(me, rest[0] ?? options.publisher, 'to show');
      const found = bodyOf<{ id: string; name: string; members?: { userId: string; role: string }[]; workspaces?: string[] }>(
        await reg.send('GET', `${path.publishers}/${encodeURIComponent(chosen.id)}`),
        reg,
      );

      out(`${found.name} (${found.id}) on ${reg.url}`);
      out(`  Members     ${(found.members ?? []).map(one => `${one.userId} (${one.role})`).join(', ') || 'none'}`);
      out(`  Workspaces  ${(found.workspaces ?? []).join(', ') || 'none linked yet. A Brydio workspace admin links a publisher from inside Brydio.'}`);

      return 0;
    }

    if (command === 'create') {
      const name = rest.join(' ').trim();

      if (!name) throw new RegistryRefused('Say what to call it: brydio publishers create "<name>".', 2);

      const answer = await reg.send<{ id?: string; name?: string }>('POST', path.publishers, { name });

      if (answer.status === 201 || answer.status === 200) {
        out(`Made the publisher ${answer.body?.name ?? name} (${answer.body?.id}) on ${reg.url}. You are its owner.`);

        return 0;
      }

      const { code, message } = refusalOf(answer.body);

      if (answer.status === 409 || answer.status === 422) throw new RegistryRefused(`The registry did not make it: ${message ?? 'that name is taken.'}${code ? ` [${code}]` : ''}`);

      throw new RegistryRefused(turnedAway(answer, reg));
    }

    throw new RegistryRefused(`There is no "publishers ${command}" command. There is list, show and create.`, 2);
  });
}

/** The system's own way to open a page. A failure is quiet: the address is printed anyway. */
function openInBrowser(url: string): void {
  const [command, ...args] = process.platform === 'darwin' ? ['open', url] : process.platform === 'win32' ? ['cmd', '/c', 'start', '', url] : ['xdg-open', url];

  try {
    spawn(command!, args, { stdio: 'ignore', detached: true }).on('error', () => {}).unref();
  } catch {
    // Printed above; the person can open it themselves.
  }
}
