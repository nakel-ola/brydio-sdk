import { GrantError, builtApp, defaultBridge, type Bridge } from './bridge.ts';

/**
 * `@brydio/app/ask`: "Ask about this" (Brydio `3ed1c1c`, A4-F04-S03).
 *
 * A separate entry point, so a screen that never asks carries none of it.
 *
 * The app never sends anything. Brydio opens a new chat in the placement's
 * project with `text` in the composer and the record attached, and the person
 * reads it, edits it, and sends it or doesn't. The assistant reads the record
 * as the person, each time, so the attachment can't show what they couldn't
 * read.
 */

/** The record the chat is about. `title` is what the attachment is called. */
export interface AskTarget {
  collection: string;
  id: string;
  title?: string;
}

/** The most text one ask may carry, in bytes: the host's `MAX_ASK_BYTES`. */
export const MAX_ASK_BYTES = 64 * 1024;

/**
 * Drafts a chat about one of the app's records. Resolves with `{ drafted }`
 * once the composer holds it; rejects with a `HostError` in the host's words
 * (the install doesn't grant `message`, the person can't read the record).
 * Needs the `message` host grant.
 *
 * ```tsx
 * <bry-button label="Ask about this issue" onPress={() => void askAbout({ collection: 'issues', id, title }, `What's left on "${title}"?`)} />
 * ```
 */
export function askAbout(target: AskTarget, text: string, bridge: Bridge = defaultBridge()): Promise<{ drafted: boolean }> {
  const host = builtApp()?.grants?.host;

  if (host && !host.includes('message') && !host.includes('*')) return Promise.reject(new GrantError('host', 'message'));
  if (!text.trim()) return Promise.reject(new Error('Say what to ask about it.'));
  if (new TextEncoder().encode(text).byteLength > MAX_ASK_BYTES) return Promise.reject(new Error('A message from an app can be at most 64 KB.'));

  return bridge
    .request('ui/message', { text, target: { collection: target.collection, id: target.id, ...(target.title ? { title: target.title } : {}) } })
    .then(result => ({ drafted: (result as { drafted?: unknown } | undefined)?.drafted === true }));
}
