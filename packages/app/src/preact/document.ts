import { TreeError, createElement, createText, type RemoteElement, type RemoteText } from '../tree.ts';

/**
 * The only `document` a Brydio screen has.
 *
 * Preact creates nodes through the global `document` (`createElementNS`,
 * `createTextNode`), and a worker has none. So the Preact adapter installs
 * this one: it makes catalogue elements and text nodes in the remote tree,
 * and nothing else. Every other property throws, naming what was reached
 * for, because the usual reason for touching `document` in an app is
 * reaching for a page that is not there (ADR-A02).
 *
 * Installed once, on first render, and locked: an app cannot swap in a
 * document of its own.
 */

interface DocumentShim {
  createElement(type: string): RemoteElement;
  createElementNS(namespace: string | null, type: string): RemoteElement;
  createTextNode(text: string): RemoteText;
}

const methods: DocumentShim = {
  createElement: type => createElement(type as never),
  createElementNS: (_namespace, type) => createElement(type as never),
  createTextNode: text => createText(String(text)),
};

const shim = new Proxy(methods, {
  get(target, name) {
    if (typeof name === 'string' && Object.prototype.hasOwnProperty.call(target, name)) {
      return target[name as keyof DocumentShim];
    }

    // Symbols are how the engine and inspectors ask about any object; they
    // are not an app reaching for a page.
    if (typeof name === 'symbol') return undefined;

    throw new TreeError(
      'structure',
      `document.${name} is not available to a Brydio app: a screen runs in a worker and draws only with the catalogue.`,
    );
  },
});

export function installDocument(scope: object = globalThis): void {
  const existing = Object.getOwnPropertyDescriptor(scope, 'document');

  if (existing?.value === shim) return;

  if (existing) {
    throw new TreeError('structure', 'This code is running beside a real page. A Brydio screen runs in its own worker.');
  }

  Object.defineProperty(scope, 'document', { value: shim, writable: false, configurable: false, enumerable: false });
}
