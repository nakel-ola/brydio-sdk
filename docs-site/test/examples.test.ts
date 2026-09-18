import { describe, expect, test } from 'bun:test';

import {
  CATALOGUE,
  ELEMENT_NAMES,
  checkChild,
  refusalForProps,
  type ElementName,
} from '../../packages/ui/src/validate.ts';
import { EXAMPLES, exampleFingerprint, jsxFor } from '../src/examples.ts';

describe('catalogue examples', () => {
  test('gives every documented element a receiver-valid example and JSX source', () => {
    expect(Object.keys(EXAMPLES)).toEqual(ELEMENT_NAMES);

    for (const name of ELEMENT_NAMES) {
      const example = EXAMPLES[name];
      const nodes = new Map(example.nodes.map(node => [node.id, node]));

      expect(nodes.has(example.root)).toBe(true);

      for (const node of example.nodes) {
        expect(node.type in CATALOGUE).toBe(true);

        if (!(node.type in CATALOGUE)) continue;

        const element = node.type as ElementName;
        expect(refusalForProps(element, node.props)).toBeNull();

        for (const child of node.children ?? []) {
          expect(checkChild(element)).toBeNull();
          expect(nodes.has(child)).toBe(true);
        }
      }

      const jsx = jsxFor(example);
      expect(jsx).not.toBe('');
      expect(jsx).toContain(name);
      expect(exampleFingerprint(name)).not.toBe('');
    }
  });
});
