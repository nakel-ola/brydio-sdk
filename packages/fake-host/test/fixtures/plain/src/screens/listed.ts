import { Bridge, mount, text, workerPort } from '@brydio/app';

// Lists the people it may name: everyone, then those matching "ad", at most one.
void mount(async root => {
  // Its own bridge that leaves grants to the host, which the test grants.
  const bridge = new Bridge(workerPort(), { app: { name: 'plain', version: '1.0.0' }, checkGrants: false });
  const everyone = await bridge.listMembers();
  const some = await bridge.listMembers({ query: 'AD', limit: 1 });

  root.append(text({ text: everyone.map(one => one.name).join(', ') }), text({ text: some.map(one => `${one.name} (${one.initials})`).join(', ') }));
});
