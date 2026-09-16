import { describe, expect, test } from 'bun:test';

import { GrantError, HostError, TeardownError, type TreeMountParams, type TreePatchParams } from '../src/index.ts';
import { render, useMembers, useProjects } from '../src/preact/index.ts';
import { harness, settle } from './harness.ts';

describe('names for the ids a screen holds (G12, host/members and host/projects)', () => {
  test('asks for members and projects as requests, answered host/result, and refuses without the grant before sending', async () => {
    const { bridge, connect, take, hostSays } = harness({ app: { grants: { host: ['members'] } } });

    await connect();
    take();

    const people = bridge.members(['user_ada', 'user_ada', 'user_bo']);

    expect(take()).toEqual([{ jsonrpc: '2.0', id: '1', method: 'host/members', params: { id: '1', ids: ['user_ada', 'user_bo'] } }]);
    hostSays('host/result', { id: '1', result: { members: [{ id: 'user_ada', name: 'Ada Lovelace', initials: 'AL' }] } });
    expect(await people).toEqual([{ id: 'user_ada', name: 'Ada Lovelace', initials: 'AL' }]);

    expect(await bridge.projects(['project_1']).catch(error => error)).toBeInstanceOf(GrantError);

    const refused = bridge.members(['user_cy']);

    hostSays('host/error', { id: '2', error: { code: -32000, message: 'Issues did not ask to see the names of people.' } });
    expect(await refused.catch(error => [error instanceof HostError, error.message])).toEqual([true, 'Issues did not ask to see the names of people.']);

    const waiting = bridge.members(['user_dee']);

    hostSays('worker/teardown');
    expect(await waiting.catch(error => error)).toBeInstanceOf(TeardownError);
  });

  test('useMembers and useProjects draw names once Brydio answers, and ask each id once per screen', async () => {
    const { root, connect, sent, hostSays } = harness({ app: { grants: { host: ['members', 'projects'] } } });
    const assignees = ['user_ada', null, 'user_ada', 'user_gone'];

    function Cards({ extra }: { extra?: string }) {
      const people = useMembers([...assignees, extra]);
      const projects = useProjects(['project_web']);

      return (
        <bry-stack>
          {assignees.map((id, at) => (
            <bry-avatar key={at} name={(id && people.get(id)?.name) || 'Unassigned'} />
          ))}
          <bry-text text={projects.get('project_web')?.name ?? '…'} />
        </bry-stack>
      );
    }

    render(<Cards />, root);
    await connect();
    await settle();

    const asked = sent.filter(one => one.method === 'host/members' || one.method === 'host/projects');

    expect(asked.map(one => [one.method, (one.params as { ids: string[] }).ids])).toEqual([
      ['host/members', ['user_ada', 'user_gone']],
      ['host/projects', ['project_web']],
    ]);

    hostSays('host/result', { id: asked[0]!.id, result: { members: [{ id: 'user_ada', name: 'Ada Lovelace', initials: 'AL' }] } });
    hostSays('host/result', { id: asked[1]!.id, result: { projects: [{ id: 'project_web', name: 'Website' }] } });
    await settle();
    await settle();

    const mount = sent.find(one => one.method === 'tree/mount')!.params as TreeMountParams;
    const ops = sent.filter(one => one.method === 'tree/patch').flatMap(one => (one.params as TreePatchParams).ops);
    const avatars = mount.nodes.filter(node => node.type === 'bry-avatar').map(node => node.id);

    expect(ops).toContainEqual({ op: 'props', id: avatars[0], props: { name: 'Ada Lovelace' } } as never);
    expect(ops).toContainEqual({ op: 'props', id: avatars[2], props: { name: 'Ada Lovelace' } } as never);
    expect(ops.some(op => op.op === 'props' && op.id === avatars[3])).toBe(false);

    // Another render asks only for an id it hasn't asked before.
    render(<Cards extra="user_cy" />, root);
    await settle();

    expect(sent.filter(one => one.method === 'host/members').map(one => (one.params as { ids: string[] }).ids)).toEqual([['user_ada', 'user_gone'], ['user_cy']]);
  });
});
