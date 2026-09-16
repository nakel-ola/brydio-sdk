/**
 * Finding a secret somebody shipped inside a bundle (A8-F04-S03).
 *
 * A copy of Brydio's `apps/api/src/extensions/apps/secret-scan.ts`, which
 * `POST /apps/publish` runs over every upload and refuses as
 * `secret_in_bundle`. The same keys, the same idea of a placeholder, the same
 * two places looked in, and the same sentence, so `brydio validate` refuses
 * exactly what the server would and nothing else.
 *
 * The scan is deliberately narrow, as the server's is. It looks only where a
 * package *declares* credentials, `servers.json` and `integrations/*.json`,
 * where a value is unambiguous, and in the bundle's own `app.json`
 * (`secretsInJson`), rather than grepping scripts for things that look like
 * keys: a pattern scan of minified code misses real keys and refuses innocent
 * strings (Hodler, 16 Sep).
 */

/** The server's sentence for `brydio_secret_in_package`, which publishing sends as `secret_in_bundle`. */
export const SECRET_MESSAGE =
  'That package contains a secret. Header values and client secrets are entered here, never shipped in a file — remove it and import again.';

/** The keys that hold a value rather than a name, in either declaration. */
const VALUE_KEYS = new Set(['value', 'clientSecret', 'client_secret', 'secret', 'apiKey', 'api_key', 'key', 'token', 'password']);

export interface SecretFound {
  code: 'secret_in_bundle';
  message: string;
  /** Where: the file and the path inside it. The value itself is never carried. */
  path: string;
}

/** A value that is actually one, rather than a placeholder asking to be filled. */
const isRealValue = (value: unknown): boolean => {
  if (typeof value !== 'string') return false;

  const trimmed = value.trim();

  if (!trimmed) return false;
  if (/^\$\{[^}]*\}$/.test(trimmed)) return false;
  if (/^[<{[].*[>}\]]$/.test(trimmed)) return false;
  if (/^(your|my|the)[ _-]/i.test(trimmed)) return false;
  if (/^(x+|\*+|\.+|todo|tbd|changeme|redacted|placeholder)$/i.test(trimmed)) return false;

  return true;
};

function walk(node: unknown, at: string, found: SecretFound[]): void {
  if (Array.isArray(node)) {
    node.forEach((one, index) => walk(one, `${at}[${index}]`, found));

    return;
  }

  if (!node || typeof node !== 'object') return;

  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    const path = at ? `${at}.${key}` : key;

    if (VALUE_KEYS.has(key) && isRealValue(value)) {
      // Never quoted back: a report that repeated the secret would copy it somewhere else.
      found.push({ code: 'secret_in_bundle', message: SECRET_MESSAGE, path });
      continue;
    }

    walk(value, path, found);
  }
}

/**
 * Every secret-shaped value in one JSON document, by the same keys and the
 * same placeholder rules: for a bundle's `app.json`, which Brydio serves to
 * every screen that opens it and scans at publish (`secretsInJson`).
 */
export function secretsInJson(document: unknown, at: string): SecretFound[] {
  const found: SecretFound[] = [];

  walk(document, at, found);

  return found;
}

/** Every secret declared in a bundle's files, as the server finds them. */
export function findSecrets(files: ReadonlyMap<string, Uint8Array>, root = ''): SecretFound[] {
  const found: SecretFound[] = [];

  for (const [path, bytes] of files) {
    const relative = root && path.startsWith(`${root}/`) ? path.slice(root.length + 1) : path;
    const declares = relative === 'servers.json' || (relative.startsWith('integrations/') && relative.endsWith('.json'));

    if (!declares) continue;

    try {
      walk(JSON.parse(new TextDecoder().decode(bytes)), relative, found);
    } catch {
      // A file that will not parse is refused elsewhere.
    }
  }

  return found;
}
