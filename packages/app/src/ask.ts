import { defaultBridge, type Bridge } from './bridge.ts';

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

/**
 * The record the chat is about, or **`null` for a chat about something Brydio
 * does not keep** (`tasks/apps` A8-F02-S03).
 *
 * With a record, Brydio attaches it, and **the assistant reads the record as
 * the person, each time, so the attachment can't show what they couldn't
 * read.** That guarantee is why the record path is safe.
 *
 * With `null` there is no attachment and so nothing to guarantee: the whole
 * message is the words in `text`, which the person reads in their own
 * composer before sending. It exists for an app whose subject is not its own
 * — a pull request the app fetched and **deliberately keeps nothing of** —
 * where storing a record to make an attachment possible would break the
 * promise that Brydio keeps nothing of it.
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
export function askAbout(
  target: AskTarget | null,
  text: string,
  bridge: Bridge = defaultBridge()
): Promise<{ drafted: boolean }> {
  // The text's size, the record and the `message` grant are the host's to check, in its words:
  // checked here too, they would only add to every screen that asks.
  //
  // `target` is left out of the call entirely when there is none, rather than
  // sent as null: a host that predates this answers "say which record", which
  // is the right refusal, instead of reading a null as a record.
  return bridge
    .request('ui/message', target ? { text, target } : { text })
    .then(result => ({ drafted: (result as { drafted?: boolean } | undefined)?.drafted === true }));
}
