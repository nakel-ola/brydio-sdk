import { mount, text } from '@brydio/app';
import { api } from '@brydio/api';

void mount(async root => {
  try {
    const projects = await api.projects.list({ query: 'road' });

    root.append(text({ text: projects.map(project => project.name).join(', ') || 'no projects' }));
  } catch (error) {
    root.append(text({ text: error instanceof Error ? error.message : String(error) }));
  }
});
