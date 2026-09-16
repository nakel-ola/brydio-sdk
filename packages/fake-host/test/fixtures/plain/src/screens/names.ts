import { Bridge, mount, text, workerPort } from '@brydio/app';

// Asks Brydio for the names of two people and a project, and draws what it was told.
void mount(async root => {
  // Its own bridge that leaves grants to Brydio, so the host's refusal is what the screen hears.
  const bridge = new Bridge(workerPort(), { app: { name: 'plain', version: '1.0.0' }, checkGrants: false });
  const said = (words: string) => root.append(text({ text: words }));

  try {
    const people = await bridge.members(['user_ada', 'user_nobody', 'user_ada']);

    said(people.map(one => `${one.name} (${one.initials})`).join(', ') || 'nobody');
  } catch (error) {
    said(`members: ${error instanceof Error ? error.message : String(error)}`);
  }

  try {
    const projects = await bridge.projects(['project_web']);

    said(projects.map(one => one.name).join(', ') || 'no projects');
  } catch (error) {
    said(`projects: ${error instanceof Error ? error.message : String(error)}`);
  }
});
