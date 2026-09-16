/**
 * `@brydio/fake-host`: run an app's built screen the way Brydio runs it, with
 * nothing drawn and nothing stored, and look at what it did.
 */

export { BUILT_ENV, testApp, type TestApp } from './app.ts';
export {
  COALESCE_MS,
  DEFAULT_CONTEXT,
  MAX_WATCHES,
  FakeHost,
  TREE_PROTOCOL,
  wordsOf,
  type AskAnswer,
  type FakeHostOptions,
  type HostContext,
  type NavigateTo,
  type StopReason,
  type ToolCall,
} from './host.ts';
export { workerPrelude } from './prelude.ts';
export { FixtureStore, refusal, type Fixtures, type StoreChange, type StoredDocument, type ToolHandler, type ToolResultShape } from './tools.ts';
export { MAX_NODES, MAX_REFUSALS, TreeStore, type Op, type Outcome, type Refusal, type TreeNode, type WireNode } from './tree-store.ts';
