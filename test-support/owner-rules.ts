import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * What every app needs to publish since the owner's decisions of 22
 * September 2026, for tests that are about something else: a logo and an
 * icon in colour and in one colour (ADR-A20), the templates' own, and one MCP
 * server so the assistant has something to call (ADR-A19).
 */

const TEMPLATE = resolve(import.meta.dir, '..', 'templates', 'preact');

/** The two manifest fields. */
export const BRAND = {
  logo: { color: './brand/logo.svg', mono: './brand/logo-mono.svg' },
  icon: { color: './brand/icon.svg', mono: './brand/icon-mono.svg' },
};

/** The four files, by their path in the app, as text. */
export const BRAND_FILES: Record<string, string> = Object.fromEntries(
  ['logo.svg', 'logo-mono.svg', 'icon.svg', 'icon-mono.svg'].map(name => [`brand/${name}`, readFileSync(join(TEMPLATE, 'brand', name), 'utf8')]),
);

/** The same four, where `brydio build` puts them. */
export const BUILT_BRAND_FILES: Record<string, string> = Object.fromEntries(Object.entries(BRAND_FILES).map(([path, text]) => [`dist/${path}`, text]));

/** One server beside the manifest: something for the assistant to call. */
export const A_SERVER: Record<string, string> = {
  'servers.json': JSON.stringify({ servers: { demo: { url: 'https://mcp.example.com/mcp' } } }),
};

/** Everything above, for an app fixture's files. */
export const OWNED: Record<string, string> = { ...BRAND_FILES, ...A_SERVER };

/** The brand files' paths in a bundle, sorted. */
export const BRAND_PATHS = Object.keys(BRAND_FILES).sort();
