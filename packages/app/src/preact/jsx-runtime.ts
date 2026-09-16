import type { ElementAttributes, ElementName, HoldsChildren } from '@brydio/ui';
import type { Component, ComponentChildren, Ref, VNode } from 'preact';

import type { RemoteElement } from '../tree.ts';

/**
 * The JSX an app compiles against: Preact's runtime, with only the
 * catalogue's elements declared.
 *
 * An app's tsconfig points its JSX here (`"jsxImportSource":
 * "@brydio/app/preact"`), so `<div>` is a type error in the editor before it
 * is a refusal anywhere else, and `<bry-stack gap="9">` is underlined with
 * the values it may take. Only a stack and a card take children; a heading,
 * a text and a button take their words as a setting, as the host draws them.
 */

export { Fragment, jsx, jsxDEV, jsxs } from 'preact/jsx-runtime';

type ChildrenOf<E extends ElementName> = HoldsChildren<E> extends true ? { children?: ComponentChildren } : { children?: never };

/**
 * What `<bry-…>` takes: its settings, its handlers, the children it holds, a
 * key, and a ref to the node in the worker's tree (never sent to the host).
 */
export type IntrinsicProps<E extends ElementName> = ElementAttributes<E> &
  ChildrenOf<E> & { key?: string | number; ref?: Ref<RemoteElement<E>> };

type Intrinsics = { [E in ElementName]: IntrinsicProps<E> };

export declare namespace JSX {
  type Element = VNode<any>;
  interface ElementClass extends Component<any, any> {}
  interface ElementAttributesProperty {
    props: any;
  }
  interface ElementChildrenAttribute {
    children: any;
  }
  interface IntrinsicAttributes {
    key?: any;
  }
  interface IntrinsicElements extends Intrinsics {}
}
