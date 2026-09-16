import { host, mount, text } from '@brydio/app';

// Says where it is running, and says it again whenever the host says it changed.
void mount(async (root, context) => {
  const describe = (now: typeof context) =>
    `${now.placement.kind} in ${now.instance.scope}, ${now.theme}, selected ${JSON.stringify(now.selection ?? null)}`;
  const line = text({ text: describe(context) });

  root.append(line);
  host.subscribe(now => line.setAttribute('text', describe(now)));
});
