import type { DocumentOf } from '@brydio/manifest';

import { builtApp, defaultBridge } from './bridge.ts';
import type { DataChange, ListQuery, ListResult } from './protocol.ts';

/**
 * One collection, typed from its schema (A5-F01-S02, S03).
 *
 * `get`, `query` and `subscribe` are `data.get`, `data.list` and `data.watch`
 * with the collection's document type. `put` writes through the collection's
 * generated tools: `create_<label>` for a new record, `update_<label>` for
 * one with an `id` and the `version` it was read at. So a put asks the person
 * like any write, and a field or value the schema doesn't allow doesn't
 * compile.
 *
 * Its own entry point, `@brydio/app/data`, so an app that doesn't use it
 * carries none of it.
 *
 * ```ts
 * import { collection } from '@brydio/app/data';
 *
 * const ISSUE = { title: 'string', status: ['todo', 'doing', 'done'] } as const;
 * const issues = collection('issues', ISSUE);
 *
 * await issues.put({ title: 'Fix the login', status: 'todo' });
 * await issues.put({ title: 'x', status: 'blocked' });   // error: not a status
 * ```
 */

/** What a put sends: the schema's fields, and for an update the id and version read. */
export type PutOf<S> =
  | Omit<DocumentOf<S>, 'id' | 'version' | 'createdBy' | 'createdAt' | 'updatedAt'>
  | ({ id: string; version: number } & Partial<Omit<DocumentOf<S>, 'id' | 'version' | 'createdBy' | 'createdAt' | 'updatedAt'>>);

export interface Collection<S> {
  readonly name: string;
  get(id: string): Promise<DocumentOf<S>>;
  query(query?: ListQuery): Promise<ListResult<DocumentOf<S>>>;
  /** Creates the record, or updates it when `id` and `version` are given; resolves with it as saved. */
  put(record: PutOf<S>): Promise<DocumentOf<S>>;
  /** Calls `onChange` with each burst of changes until the returned function is called. */
  subscribe(onChange: (changes: DataChange[]) => void, onEnd?: (error: Error) => void): () => void;
}

export function collection<const S extends Record<string, unknown>>(name: string, _schema: S): Collection<S> {
  const label = () => builtApp()?.collections?.[name]?.label ?? singular(name);

  return {
    name,
    get: id => defaultBridge().getDocument<DocumentOf<S>>(name, id),
    query: (query = {}) => defaultBridge().listDocuments<DocumentOf<S>>(name, query),
    put: record => {
      const updating = typeof (record as { id?: unknown }).id === 'string';

      return defaultBridge().callTool<DocumentOf<S>>(`${updating ? 'update' : 'create'}_${label()}`, record as Record<string, unknown>);
    },
    subscribe: (onChange, onEnd) => defaultBridge().watch(name, onChange, onEnd),
  };
}

/**
 * A collection's default label, as `@brydio/manifest`'s `labelOf` works it
 * out: `issues` is `issue`. Copied rather than imported, because importing the
 * manifest package would put its schemas in every screen's bundle.
 */
function singular(collection: string): string {
  return collection.length > 1 && collection.endsWith('s') ? collection.slice(0, -1) : collection;
}
