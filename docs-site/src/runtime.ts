import '../../packages/ui/src/web/index.ts';

interface ExampleNode {
  id: string;
  type: `bry-${string}`;
  props: Record<string, unknown>;
  children?: string[];
}

interface ExampleTree {
  root: string;
  nodes: ExampleNode[];
}

function renderExample(host: HTMLElement, example: ExampleTree): void {
  const nodes = new Map(example.nodes.map(node => [node.id, node]));

  const render = (id: string): HTMLElement | null => {
    const node = nodes.get(id);
    if (!node) return null;

    const element = document.createElement(node.type) as HTMLElement & Record<string, unknown>;
    Object.assign(element, node.props);
    for (const childId of node.children ?? []) {
      const child = render(childId);
      if (child) element.append(child);
    }
    return element;
  };

  const root = render(example.root);
  if (root) host.replaceChildren(root);
}

for (const host of document.querySelectorAll<HTMLElement>('[data-example]')) {
  const value = host.dataset.example;
  if (!value) continue;
  renderExample(host, JSON.parse(value) as ExampleTree);
}
