import '../../packages/ui/src/web/index.ts';

const documentElement = document.documentElement;
const isCapture = documentElement.dataset.capture === 'true';

function captureError(error: unknown): void {
  if (!isCapture) return;
  documentElement.dataset.captureError = error instanceof Error ? error.message : String(error);
}

if (isCapture) {
  window.addEventListener('error', event => captureError(event.error ?? event.message));
  window.addEventListener('unhandledrejection', event => captureError(event.reason));
}

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

async function mountExamples(): Promise<void> {
  for (const host of document.querySelectorAll<HTMLElement>('[data-example]')) {
    const value = host.dataset.example;
    if (!value) continue;
    renderExample(host, JSON.parse(value) as ExampleTree);
  }
  await Promise.all([...document.querySelectorAll<HTMLElement>('bry-dialog')].map(async element => {
    const updating = element as HTMLElement & { updateComplete?: Promise<unknown> };
    await updating.updateComplete;
    const dialog = element.shadowRoot?.querySelector('dialog');
    if (isCapture && dialog && !dialog.open) dialog.showModal();
  }));
  if (isCapture && !documentElement.dataset.captureError) documentElement.dataset.captureReady = 'true';
}

try {
  await mountExamples();
} catch (error) {
  captureError(error);
  throw error;
}
