import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { createController, createHost, normalizeRoom } from '../src/network.js';

const flush = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};

class LocalChannel {
  static channels = new Set();
  constructor(name) {
    this.name = name;
    LocalChannel.channels.add(this);
  }
  postMessage(message) {
    for (const other of LocalChannel.channels) {
      if (other !== this && other.name === this.name) {
        const copy = structuredClone(message);
        queueMicrotask(() => {
          if (LocalChannel.channels.has(other)) other.onmessage?.({ data: copy });
        });
      }
    }
  }
  close() { LocalChannel.channels.delete(this); }
}

class Connection extends EventEmitter {
  constructor(peer) {
    super();
    this.peer = peer;
    this.open = false;
    this.closed = false;
  }
  send(message) {
    if (!this.open) throw new Error('Connection closed');
    const copy = structuredClone(message);
    queueMicrotask(() => {
      if (!this.other.closed) this.other.emit('data', copy);
    });
  }
  close() {
    if (this.closed) return;
    this.open = false;
    this.closed = true;
    this.emit('close');
    this.other?.close();
  }
}

class FakePeer extends EventEmitter {
  static peers = new Map();
  static collisions = 0;
  constructor(id) {
    super();
    this.id = id;
    this.connections = [];
    this.destroyed = false;
    this.reconnects = 0;
    if ((id.startsWith('couch-rally-v1-') && FakePeer.collisions-- > 0) || FakePeer.peers.has(id)) {
      queueMicrotask(() => this.emit('error', { type: 'unavailable-id' }));
    } else {
      FakePeer.peers.set(id, this);
      queueMicrotask(() => { if (!this.destroyed) this.emit('open', id); });
    }
  }
  connect(id) {
    const target = FakePeer.peers.get(id);
    const local = new Connection(id);
    this.connections.push(local);
    if (!target) {
      queueMicrotask(() => this.emit('error', { type: 'peer-unavailable' }));
      return local;
    }
    const remote = new Connection(this.id);
    local.other = remote;
    remote.other = local;
    target.connections.push(remote);
    target.emit('connection', remote);
    queueMicrotask(() => {
      if (local.closed || remote.closed) return;
      local.open = remote.open = true;
      remote.emit('open');
      local.emit('open');
    });
    return local;
  }
  reconnect() {
    this.reconnects++;
    this.disconnected = false;
    queueMicrotask(() => this.emit('open', this.id));
  }
  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    if (FakePeer.peers.get(this.id) === this) FakePeer.peers.delete(this.id);
    for (const connection of this.connections) connection.close();
    this.emit('close');
  }
}

function environment(t, { local = true, remote = true } = {}) {
  const oldChannel = globalThis.BroadcastChannel;
  const oldPeer = globalThis.Peer;
  LocalChannel.channels.clear();
  FakePeer.peers.clear();
  FakePeer.collisions = 0;
  globalThis.BroadcastChannel = local ? LocalChannel : undefined;
  globalThis.Peer = remote ? FakePeer : undefined;
  t.mock.timers.enable({ apis: ['Date', 'setTimeout', 'setInterval'] });
  t.after(() => {
    globalThis.BroadcastChannel = oldChannel;
    if (oldPeer === undefined) delete globalThis.Peer;
    else globalThis.Peer = oldPeer;
  });
}

test('normalizes room codes and rejects ambiguous or malformed codes', () => {
  assert.equal(normalizeRoom(' ab-c234 '), 'ABC234');
  for (const invalid of ['', null, {}, '123456', 'OABCDE', 'ABCDE', 'ABCDEFG']) {
    assert.equal(normalizeRoom(invalid), '');
  }
});

test('same-origin pairing preserves one identity, initial state, and close cleanup', async (t) => {
  environment(t);
  const joins = [];
  const leaves = [];
  const receivedByHost = [];
  const receivedByController = [];
  const statuses = [];
  let host;
  host = createHost({
    onJoin: (id) => { joins.push(id); host.send(id, { type: 'welcome' }); },
    onLeave: (id) => leaves.push(id),
    onMessage: (id, data) => receivedByHost.push({ id, data }),
  });
  t.after(() => host.close());
  await host.start();
  const controller = createController({
    room: host.room,
    onMessage: (data) => receivedByController.push(data),
    onStatus: (status) => statuses.push(status),
  });
  t.after(() => controller.close());
  const connected = controller.start();
  await flush();
  assert.equal(await connected, controller.id);
  t.mock.timers.tick(600);
  await flush();
  assert.equal(FakePeer.peers.size, 1, 'local controller never creates a duplicate WebRTC peer');
  assert.deepEqual(joins, [controller.id]);
  assert.deepEqual(receivedByController, [{ type: 'welcome' }]);
  assert.equal(controller.send({ type: 'input', steer: -1 }), true);
  assert.equal(controller.send([]), false);
  assert.equal(controller.send({ text: 'x'.repeat(4096) }), false);
  host.broadcast({ type: 'race', lap: 2 });
  await flush();
  assert.deepEqual(receivedByHost, [{ id: controller.id, data: { type: 'input', steer: -1 } }]);
  assert.deepEqual(receivedByController.at(-1), { type: 'race', lap: 2 });
  assert.equal(statuses.at(-1).state, 'ready');
  controller.close();
  controller.close();
  await flush();
  assert.deepEqual(leaves, [controller.id]);
  host.close();
  host.close();
  assert.equal(LocalChannel.channels.size, 0);
  assert.equal(FakePeer.peers.size, 0);
});

test('WebRTC pairing validates incoming data and keeps active connections during signaling reconnect', async (t) => {
  environment(t, { local: false });
  const joins = [];
  const leaves = [];
  const inputs = [];
  const closes = [];
  const host = createHost({
    onJoin: (id) => joins.push(id),
    onLeave: (id) => leaves.push(id),
    onMessage: (id, data) => inputs.push({ id, data }),
  });
  t.after(() => host.close());
  await host.start();
  const controller = createController({ room: host.room, onClose: (reason) => closes.push(reason) });
  t.after(() => controller.close());
  const started = controller.start();
  t.mock.timers.tick(1);
  await flush();
  assert.equal(await started, controller.id);
  const hostPeer = [...FakePeer.peers.values()].find((peer) => peer.id.startsWith('couch-rally-v1-'));
  const hostConnection = hostPeer.connections[0];
  for (const malformed of [null, 'text', [], { v: 1, t: 'data', d: [] }, { v: 1, t: 'data', d: { text: 'x'.repeat(5000) } }]) {
    hostConnection.emit('data', malformed);
  }
  controller.send({ type: 'input', throttle: 1 });
  await flush();
  assert.deepEqual(inputs, [{ id: controller.id, data: { type: 'input', throttle: 1 } }]);
  hostPeer.disconnected = true;
  hostPeer.emit('disconnected');
  t.mock.timers.tick(2000);
  await flush();
  assert.equal(hostPeer.reconnects, 1);
  assert.equal(joins.length, 1);
  assert.equal(leaves.length, 0);
  assert.equal(controller.send({ type: 'input', steer: 1 }), true);
  await flush();
  assert.equal(inputs.length, 2);
  host.close();
  await flush();
  assert.deepEqual(leaves, [controller.id]);
  assert.equal(closes.length, 1);
  assert.equal(FakePeer.peers.size, 0);
});

test('local-only mode caps the roster at eight and reports signaling failure', async (t) => {
  environment(t, { remote: false });
  const joins = [];
  const statuses = [];
  const host = createHost({ onJoin: (id) => joins.push(id), onStatus: (status) => statuses.push(status) });
  t.after(() => host.close());
  await host.start();
  assert.equal(statuses.at(-1).state, 'offline');
  const controllers = Array.from({ length: 9 }, () => createController({ room: host.room }));
  t.after(() => controllers.forEach((controller) => controller.close()));
  const results = await Promise.allSettled(controllers.map((controller) => controller.start()));
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 8);
  assert.equal(results.filter((result) => result.status === 'rejected').length, 1);
  assert.equal(joins.length, 8);
});

test('missing hosts time out once and release local channels', async (t) => {
  environment(t, { remote: false });
  const closes = [];
  const controller = createController({ room: 'ABC234', onClose: (reason) => closes.push(reason) });
  const rejected = assert.rejects(controller.start(), /12 detik/);
  t.mock.timers.tick(12_000);
  await rejected;
  controller.close();
  assert.equal(closes.length, 1);
  assert.equal(LocalChannel.channels.size, 0);
  assert.equal(controller.send({ type: 'input' }), false);
});

test('host retries a signaling ID collision before returning its current code', async (t) => {
  environment(t, { local: false });
  FakePeer.collisions = 1;
  const host = createHost();
  t.after(() => host.close());
  const code = await host.start();
  assert.equal(code, host.room);
  assert.equal(FakePeer.peers.size, 1);
  assert.ok(FakePeer.peers.has(`couch-rally-v1-${code}`));
});

test('a silent controller is removed once by the stale heartbeat check', async (t) => {
  environment(t, { remote: false });
  const leaves = [];
  const closes = [];
  const host = createHost({ onLeave: (id) => leaves.push(id) });
  t.after(() => host.close());
  await host.start();
  const controller = createController({ room: host.room, onClose: (reason) => closes.push(reason) });
  t.after(() => controller.close());
  const connected = controller.start();
  await flush();
  await connected;
  const controllerChannel = [...LocalChannel.channels].at(-1);
  controllerChannel.postMessage = () => {};
  for (let i = 0; i < 6; i++) {
    t.mock.timers.tick(2000);
    await flush();
  }
  assert.deepEqual(leaves, [controller.id]);
  assert.equal(closes.length, 1);
  assert.match(closes[0], /tidak merespons/);
});

test('host fails cleanly when neither signaling nor local channels are available', async (t) => {
  environment(t, { local: false, remote: false });
  const host = createHost();
  await assert.rejects(host.start(), /Koneksi tidak tersedia/);
  host.close();
  assert.equal(FakePeer.peers.size, 0);
  assert.equal(LocalChannel.channels.size, 0);
});

test('an invalid room fails immediately without opening transports', async (t) => {
  environment(t);
  const controller = createController({ room: 'bad' });
  await assert.rejects(controller.start(), /6 huruf atau angka/);
  assert.equal(LocalChannel.channels.size, 0);
  assert.equal(FakePeer.peers.size, 0);
});

for (const local of [true, false]) {
  test(`${local ? 'local' : 'WebRTC'} reconnect keeps the seat in a full room and ignores the old connection`, async (t) => {
    environment(t, { local, remote: !local });
    const active = new Set();
    const inputs = [];
    const host = createHost({
      onJoin: (id) => active.add(id),
      onLeave: (id) => active.delete(id),
      onMessage: (id, data) => inputs.push({ id, data }),
    });
    t.after(() => host.close());
    await host.start();
    const controllers = Array.from({ length: 8 }, () => createController({ room: host.room }));
    t.after(() => controllers.forEach((controller) => controller.close()));
    const connected = Promise.all(controllers.map((controller) => controller.start()));
    t.mock.timers.tick(1);
    await flush();
    await connected;
    const first = controllers[0];
    const firstPeer = [...FakePeer.peers.values()].find((peer) => peer.id.includes(first.id));
    const oldRemoteConnection = firstPeer?.connections[0].other;
    const received = [];
    const replacement = createController({ room: host.room, id: first.id, onMessage: (data) => received.push(data) });
    t.after(() => replacement.close());
    const reconnected = replacement.start();
    t.mock.timers.tick(1);
    await flush();
    assert.equal(await reconnected, first.id);
    assert.equal(active.size, 8);
    assert.equal(active.has(first.id), true);
    assert.equal(first.send({ type: 'input' }), false);
    oldRemoteConnection?.emit('data', { v: 1, t: 'bye' });
    replacement.send({ type: 'input', steer: 1 });
    host.send(first.id, { type: 'welcome', car: 'same-car' });
    await flush();
    assert.deepEqual(inputs, [{ id: first.id, data: { type: 'input', steer: 1 } }]);
    assert.deepEqual(received, [{ type: 'welcome', car: 'same-car' }]);
    assert.equal(active.size, 8, 'a late old bye cannot evict the replacement');
    if (firstPeer) assert.equal(firstPeer.destroyed, true);
  });
}

test('invalid requested identities are replaced with a fresh UUID', () => {
  const controller = createController({ room: 'ABC234', id: 'other-player' });
  assert.match(controller.id, /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/);
});
