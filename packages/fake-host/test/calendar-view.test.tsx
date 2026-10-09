import { Bridge, createRoot, RemoteElement, type Port, type RpcMessage, type TreeMountParams, type TreePatchParams } from '@brydio/app';
import { render, useState } from '@brydio/app/preact';
import { describe, expect, test } from 'bun:test';

import { TreeStore } from '../src/index.ts';

/**
 * A Preact calendar answering a move, received by the host's own tree store
 * (CA02).
 *
 * Brydio's `bry-calendar-view` draws a moved event where the person put it
 * and waits: it takes new `events` as the answer, and `settled` with the
 * event's id as a refusal, after which the event goes back. `answers` below
 * asks exactly those two questions of what the tree store now holds.
 */

const settle = () => new Promise(resolve => setTimeout(resolve, 0));

function screen() {
  const store = new TreeStore();
  const refused: unknown[] = [];
  let listener: (message: unknown) => void = () => {};
  const port: Port = {
    post: raw => {
      const message = JSON.parse(JSON.stringify(raw)) as RpcMessage;

      if (message.method === 'tree/mount') {
        const { root, nodes } = message.params as TreeMountParams;

        refused.push(...store.mount(root, nodes).refused);
      }

      if (message.method === 'tree/patch') refused.push(...store.patch((message.params as TreePatchParams).ops).refused);
    },
    listen: next => {
      listener = next;

      return () => {};
    },
  };
  const bridge = new Bridge(port, { app: { name: 'calendar', version: '1.0.0' } });
  const root = createRoot({ bridge });

  return {
    store,
    refused,
    root,
    hostSays: (method: string, params?: unknown) => listener({ jsonrpc: '2.0', method, params }),
    async connect() {
      const connected = bridge.connect();

      listener({
        jsonrpc: '2.0',
        method: 'host/context',
        params: { theme: 'light', locale: 'en-GB', placement: { id: 'p', kind: 'project-widget' }, instance: { id: 'i', name: 'Calendar', scope: 'workspace' }, size: { width: 960, height: 640 } },
      });
      await connected;
      await settle();
    },
  };
}

describe('a Preact calendar view, as Brydio receives it', () => {
  test('a move the app saves is sent back as new events, and one it refuses is settled, each time it is refused', async () => {
    const { store, refused, root, hostSays, connect } = screen();
    let refuse = false;
    let saw: unknown = null;

    function Calendar() {
      const [events, setEvents] = useState([
        { id: 'standup', title: 'Standup', start: '2026-10-07T09:00:00Z', end: '2026-10-07T09:30:00Z', editable: true },
        { id: 'review', title: 'Design review', start: '2026-10-07T13:00:00Z', end: '2026-10-07T14:00:00Z', editable: true },
      ]);

      return (
        <bry-calendar-view
          view="week"
          date="2026-10-07"
          zone="Europe/London"
          events={events}
          onMove={event => {
            const move = (saw = event.detail);

            // Leave `settled` out of the JSX and set it on the node: the same id twice is still sent.
            if (refuse) return (event.target as RemoteElement).setAttribute('settled', move.id);

            setEvents(events.map(one => (one.id === move.id ? { ...one, start: move.start, end: move.end } : one)));
          }}
        />
      );
    }

    render(<Calendar />, root);
    await connect();

    const calendar = store.get(store.get(store.root!)!.children[0]!)!;
    const startOf = (id: string) => (store.get(calendar.id)!.props.events as { id: string; start: string }[]).find(one => one.id === id)!.start;

    expect(calendar.type).toBe('bry-calendar-view');
    expect(refused).toEqual([]);

    // Brydio draws the event moved and raises `move`; the app saves it and sends the events again.
    const sent = store.get(calendar.id)!.props.events;

    hostSays('tree/event', { node: calendar.id, name: 'move', detail: { id: 'standup', start: '2026-10-07T10:00:00Z', end: '2026-10-07T10:30:00Z', allday: false } });
    await settle();

    expect(saw).toEqual({ id: 'standup', start: '2026-10-07T10:00:00Z', end: '2026-10-07T10:30:00Z', allday: false });
    expect(refused).toEqual([]);
    // Answered: the events are new, with the event where the move put it.
    expect(store.get(calendar.id)!.props.events).not.toBe(sent);
    expect(startOf('standup')).toBe('2026-10-07T10:00:00Z');
    expect(store.get(calendar.id)!.props.settled).toBeUndefined();

    // Refused, twice for the same event: each refusal reaches the calendar as a new node, which is its answer.
    refuse = true;

    for (const _ of [1, 2]) {
      const revision = store.get(calendar.id);

      hostSays('tree/event', { node: calendar.id, name: 'move', detail: { id: 'review', start: '2026-10-08T13:00:00Z', end: '2026-10-08T14:00:00Z', allday: false } });
      await settle();

      expect(store.get(calendar.id)).not.toBe(revision);
      expect(store.get(calendar.id)!.props.settled).toBe('review');
    }

    expect(startOf('review')).toBe('2026-10-07T13:00:00Z');
    expect(refused).toEqual([]);
  });

  test('refuses an event without its times, in the host’s words', async () => {
    const { refused, root, connect } = screen();

    render(<bry-calendar-view events={[{ id: 'a', start: '2026-10-07T09:00:00Z' } as never]} />, root);
    await connect();

    expect(JSON.stringify(refused)).toContain('bry-calendar-view events[0] needs a end.');
  });
});
