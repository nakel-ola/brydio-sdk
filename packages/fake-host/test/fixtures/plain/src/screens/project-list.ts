import { Bridge, mount, text, workerPort } from '@brydio/app';

// Lists the projects the viewer can open: all of them, then those matching "LAUNCH", at most one.
void mount(async root => {
  // Its own bridge that leaves grants to the host, which the test grants.
  const bridge = new Bridge(workerPort(), { app: { name: 'plain', version: '1.0.0' }, checkGrants: false });
  const every = await bridge.listProjects();
  const some = await bridge.listProjects({ query: 'LAUNCH', limit: 1 });

  root.append(text({ text: every.map(one => one.name).join(', ') }), text({ text: some.map(one => one.id).join(', ') }));
});
