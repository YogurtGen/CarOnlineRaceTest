const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const PREFIX = 'couch-rally-v1-';
const PLAYER_PREFIX = 'couch-rally-player-';
const VERSION = 1;
const CONNECT_TIMEOUT = 12_000;
const STALE_TIMEOUT = 10_000;
const LOCAL_HEAD_START = 500;
const MAX_PLAYERS = 8;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;

function seatId(address) {
  if (typeof address !== 'string' || address[36] !== '-') return '';
  const id = address.slice(0, 36);
  return UUID.test(id) && UUID.test(address.slice(37)) ? id : '';
}

export function normalizeRoom(value) {
  const room = typeof value === 'string' ? value.toUpperCase().replace(/[\s-]/g, '') : '';
  return room.length === 6 && [...room].every((letter) => ALPHABET.includes(letter)) ? room : '';
}

function randomId() {
  if (globalThis.crypto.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function randomRoom() {
  return [...globalThis.crypto.getRandomValues(new Uint8Array(6))]
    .map((byte) => ALPHABET[byte % ALPHABET.length]).join('');
}

function validData(data, maxLength = 4096) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  const prototype = Object.getPrototypeOf(data);
  if (prototype !== Object.prototype && prototype !== null) return false;
  try {
    return JSON.stringify(data).length <= maxLength;
  } catch {
    return false;
  }
}

function validPacket(packet) {
  return validData(packet, 4608) && packet.v === VERSION && typeof packet.t === 'string';
}

function packet(type, data) {
  return data === undefined ? { v: VERSION, t: type } : { v: VERSION, t: type, d: data };
}

function channelFor(room) {
  try {
    return typeof globalThis.BroadcastChannel === 'function'
      ? new globalThis.BroadcastChannel(`${PREFIX}${room}`) : null;
  } catch {
    return null;
  }
}

function post(channel, message) {
  try {
    channel?.postMessage(message);
    return Boolean(channel);
  } catch {
    return false;
  }
}

function sendConnection(connection, message) {
  try {
    if (!connection?.open) return false;
    connection.send(message);
    return true;
  } catch {
    return false;
  }
}

function signalMessage() {
  return 'Server sinyal tidak tersedia. Tab di perangkat yang sama masih bisa bergabung; coba lagi untuk HP lain.';
}

export function createHost({ onStatus, onJoin, onLeave, onMessage } = {}) {
  let room = randomRoom();
  let hostId = randomId();
  let peer;
  let channel;
  let closed = false;
  let started = false;
  let signaled = false;
  let attempts = 0;
  let startPromise;
  let resolveStart;
  let rejectStart;
  let startSettled = false;
  let deadline;
  let heartbeat;
  let reconnectAt = 0;
  const players = new Map();
  const pending = new Set();

  function status(state, message) {
    if (!closed) onStatus?.({ state, message, room });
  }

  function finishStart(error) {
    if (startSettled) return;
    startSettled = true;
    clearTimeout(deadline);
    if (error) {
      if (!closed) shutDown();
      rejectStart(error);
    }
    else resolveStart(room);
  }

  function shutDown() {
    closed = true;
    clearInterval(heartbeat);
    clearTimeout(deadline);
    for (const connection of pending) connection.close();
    pending.clear();
    channel?.close();
    peer?.destroy();
  }

  function sendRecord(player, message) {
    return player.kind === 'local'
      ? post(channel, { ...message, from: hostId, to: player.address })
      : sendConnection(player.connection, message);
  }

  function remove(player, reason, tellPlayer = false) {
    if (players.get(player.id) !== player) return;
    players.delete(player.id);
    if (tellPlayer) sendRecord(player, packet('bye', { reason }));
    if (player.connection) player.connection.close();
    onLeave?.(player.id);
  }

  function accept(id, kind, connection, address) {
    const previous = players.get(id);
    if (closed || (!previous && players.size >= MAX_PLAYERS)) return null;
    if (previous) remove(previous, 'Controller tersambung ulang dari sesi baru.', true);
    const player = { id, kind, connection, address, lastSeen: Date.now() };
    players.set(id, player);
    sendRecord(player, packet('accepted'));
    onJoin?.(id);
    return player;
  }

  function receive(player, message) {
    if (players.get(player.id) !== player || !validPacket(message)) return;
    player.lastSeen = Date.now();
    if (message.t === 'data' && validData(message.d)) onMessage?.(player.id, message.d);
    else if (message.t === 'ping') sendRecord(player, packet('pong'));
    else if (message.t === 'bye') remove(player, 'Controller ditutup.');
  }

  function openChannel() {
    channel?.close();
    channel = channelFor(room);
    if (!channel) return;
    channel.onmessage = ({ data: message }) => {
      if (closed || !validPacket(message)) return;
      const id = seatId(message.from);
      if (!id) return;
      if (message.t === 'discover') {
        post(channel, { ...packet('offer'), from: hostId, to: message.from });
        return;
      }
      if (message.to !== hostId) return;
      if (message.t === 'join') {
        const existing = players.get(id);
        if (existing?.kind === 'local' && existing.address === message.from) {
          sendRecord(existing, packet('accepted'));
        } else if (!accept(id, 'local', null, message.from)) {
          post(channel, { ...packet('rejected', { reason: 'Ruang penuh atau controller sudah tersambung.' }), from: hostId, to: message.from });
        }
        return;
      }
      const player = players.get(id);
      if (player?.kind === 'local' && player.address === message.from) receive(player, message);
    };
  }

  function fallback() {
    status('offline', signalMessage());
    finishStart(channel ? undefined : new Error('Koneksi tidak tersedia. Periksa internet lalu coba lagi.'));
  }

  function openPeer() {
    const Peer = globalThis.Peer;
    if (typeof Peer !== 'function') {
      fallback();
      return;
    }
    let current;
    try {
      current = new Peer(`${PREFIX}${room}`, { debug: 0 });
    } catch {
      fallback();
      return;
    }
    peer = current;
    current.on('open', () => {
      if (closed || peer !== current) return;
      signaled = true;
      status('ready', 'Ruang siap. Buka link controller di HP.');
      finishStart();
    });
    current.on('connection', (connection) => {
      const address = connection.peer?.startsWith(PLAYER_PREFIX) ? connection.peer.slice(PLAYER_PREFIX.length) : '';
      const id = seatId(address);
      if (!id) {
        connection.close();
        return;
      }
      if (closed || peer !== current || (!players.has(id) && players.size + pending.size >= MAX_PLAYERS)) {
        connection.on('open', () => {
          sendConnection(connection, packet('rejected', { reason: 'Ruang penuh. Maksimal 8 controller.' }));
          setTimeout(() => connection.close(), 100);
        });
        return;
      }
      pending.add(connection);
      let player;
      const pendingTimer = setTimeout(() => {
        pending.delete(connection);
        connection.close();
      }, CONNECT_TIMEOUT);
      connection.on('open', () => {
        clearTimeout(pendingTimer);
        pending.delete(connection);
        player = accept(id, 'remote', connection, address);
        if (!player) {
          sendConnection(connection, packet('rejected', { reason: 'Ruang penuh atau controller sudah tersambung.' }));
          setTimeout(() => connection.close(), 100);
        }
      });
      connection.on('data', (message) => {
        if (player) receive(player, message);
      });
      const disconnected = () => {
        clearTimeout(pendingTimer);
        pending.delete(connection);
        if (player) remove(player, 'Controller terputus.');
      };
      connection.on('close', disconnected);
      connection.on('error', disconnected);
    });
    current.on('disconnected', () => {
      if (closed || peer !== current) return;
      status('offline', 'Server sinyal terputus. Balapan yang sudah tersambung tetap berjalan.');
      reconnectAt = Date.now() + 1000;
    });
    current.on('close', () => {
      if (!closed && peer === current) fallback();
    });
    current.on('error', (error) => {
      if (closed || peer !== current) return;
      if (error.type === 'unavailable-id' && !signaled && ++attempts < 5) {
        peer = null;
        current.destroy();
        for (const player of [...players.values()]) remove(player, 'Kode ruang berubah. Masuk lagi.', true);
        room = randomRoom();
        hostId = randomId();
        openChannel();
        status('connecting', 'Mencari kode ruang yang tersedia…');
        openPeer();
      } else {
        fallback();
      }
    });
  }

  return {
    get room() { return room; },
    start() {
      if (startPromise) return startPromise;
      if (closed) return Promise.reject(new Error('Ruang sudah ditutup.'));
      started = true;
      startPromise = new Promise((resolve, reject) => {
        resolveStart = resolve;
        rejectStart = reject;
      });
      status('connecting', 'Menyiapkan kode ruang…');
      openChannel();
      deadline = setTimeout(fallback, CONNECT_TIMEOUT);
      heartbeat = setInterval(() => {
        for (const player of [...players.values()]) {
          if (Date.now() - player.lastSeen > STALE_TIMEOUT) remove(player, 'Controller tidak merespons.', true);
          else if (!sendRecord(player, packet('ping'))) remove(player, 'Controller terputus.');
        }
        if (peer?.disconnected && !peer.destroyed && Date.now() >= reconnectAt) {
          reconnectAt = Date.now() + 3000;
          try { peer.reconnect(); } catch { /* Next heartbeat retries signaling. */ }
        }
      }, 2000);
      openPeer();
      return startPromise;
    },
    broadcast(data) {
      if (closed || !validData(data)) return false;
      for (const player of [...players.values()]) {
        if (!sendRecord(player, packet('data', data))) remove(player, 'Controller terputus.');
      }
      return true;
    },
    send(id, data) {
      const player = players.get(id);
      return !closed && validData(data) && Boolean(player) && sendRecord(player, packet('data', data));
    },
    close() {
      if (closed) return;
      for (const player of [...players.values()]) remove(player, 'Tuan rumah menutup ruang.', true);
      shutDown();
      if (started) finishStart(new Error('Ruang ditutup.'));
    },
  };
}

export function createController({ room: requestedRoom, id: requestedId, onStatus, onMessage, onClose } = {}) {
  const room = normalizeRoom(requestedRoom);
  const id = typeof requestedId === 'string' && UUID.test(requestedId) ? requestedId : randomId();
  const address = `${id}-${randomId()}`;
  let hostId;
  let channel;
  let peer;
  let connection;
  let mode;
  let closed = false;
  let ready = false;
  let lastSeen = Date.now();
  let startPromise;
  let resolveStart;
  let rejectStart;
  let startSettled = false;
  let deadline;
  let localTimer;
  let discovery;
  let heartbeat;
  let reconnectAt = 0;

  function status(state, message) {
    if (!closed) onStatus?.({ state, message, room });
  }

  function sendPacket(message) {
    return mode === 'local'
      ? post(channel, { ...message, from: address, to: hostId })
      : sendConnection(connection, message);
  }

  function cleanup() {
    clearTimeout(deadline);
    clearTimeout(localTimer);
    clearInterval(discovery);
    clearInterval(heartbeat);
    channel?.close();
    connection?.close();
    peer?.destroy();
  }

  function stop(reason, explicit = false) {
    if (closed) return;
    if (ready) sendPacket(packet('bye'));
    if (!explicit) status('error', reason);
    closed = true;
    cleanup();
    if (!startSettled && startPromise) {
      startSettled = true;
      rejectStart(new Error(reason));
    }
    if (!explicit) onClose?.(reason);
  }

  function receive(message) {
    if (closed || !validPacket(message)) return;
    lastSeen = Date.now();
    if (message.t === 'accepted' && !ready) {
      ready = true;
      clearTimeout(deadline);
      clearTimeout(localTimer);
      clearInterval(discovery);
      status('ready', mode === 'local' ? 'Controller tersambung di perangkat ini.' : 'Controller tersambung. Siap balapan!');
      startSettled = true;
      resolveStart(id);
    } else if (message.t === 'rejected' || message.t === 'bye') {
      stop(message.d?.reason || 'Ruang ditutup.');
    } else if (ready && message.t === 'data' && validData(message.d)) {
      onMessage?.(message.d);
    } else if (message.t === 'ping') {
      sendPacket(packet('pong'));
    }
  }

  function openPeer() {
    if (closed || mode === 'local' || peer) return;
    const Peer = globalThis.Peer;
    if (typeof Peer !== 'function') {
      status('offline', 'Server sinyal tidak tersedia. Cek internet, atau buka controller pada perangkat yang sama.');
      return;
    }
    try {
      peer = new Peer(`${PLAYER_PREFIX}${address}`, { debug: 0 });
    } catch {
      status('offline', 'Browser belum bisa membuka koneksi. Coba Chrome, Safari, atau Opera terbaru.');
      return;
    }
    peer.on('open', () => {
      if (closed || mode === 'local') return;
      if (ready) {
        status('ready', 'Controller tersambung. Siap balapan!');
        return;
      }
      if (connection) return;
      mode = 'remote';
      try {
        connection = peer.connect(`${PREFIX}${room}`, { reliable: true, serialization: 'json' });
      } catch {
        stop('Koneksi ke layar gagal. Periksa kode ruang dan internet.');
        return;
      }
      connection.on('data', receive);
      connection.on('close', () => { if (!closed) stop('Koneksi ke layar terputus. Masuk lagi dengan kode ruang.'); });
      connection.on('error', () => { if (!closed) stop('Koneksi ke layar gagal. Periksa kode ruang dan internet.'); });
    });
    peer.on('disconnected', () => {
      if (closed || mode === 'local') return;
      status('offline', ready
        ? 'Server sinyal terputus. Controller tetap bisa dipakai selama koneksi aktif.'
        : 'Server sinyal terputus. Sedang mencoba menyambung lagi…');
      reconnectAt = Date.now() + 1000;
    });
    peer.on('error', (error) => {
      if (closed || mode === 'local') return;
      if (error.type === 'peer-unavailable') stop('Kode ruang tidak ditemukan. Pastikan layar utama sudah terbuka.');
      else if (!ready) status('offline', 'Server sinyal belum bisa dihubungi. Periksa internet dan kode ruang.');
      else status('offline', 'Server sinyal terputus. Koneksi balapan tetap aktif.');
    });
  }

  return {
    id,
    start() {
      if (startPromise) return startPromise;
      if (closed) return Promise.reject(new Error('Controller sudah ditutup.'));
      startPromise = new Promise((resolve, reject) => {
        resolveStart = resolve;
        rejectStart = reject;
      });
      if (!room) {
        stop('Kode ruang harus berisi 6 huruf atau angka.');
        return startPromise;
      }
      status('connecting', 'Menghubungkan controller…');
      channel = channelFor(room);
      if (channel) {
        channel.onmessage = ({ data: message }) => {
          if (closed || !validPacket(message) || message.to !== address || !UUID.test(message.from ?? '')) return;
          if (message.t === 'offer' && !mode) {
            mode = 'local';
            hostId = message.from;
            clearTimeout(localTimer);
            // A local handshake wins only before the WebRTC connection is selected.
            peer?.destroy();
            post(channel, { ...packet('join'), from: address, to: hostId });
          } else if (mode === 'local' && message.from === hostId) receive(message);
        };
        post(channel, { ...packet('discover'), from: address });
        discovery = setInterval(() => {
          if (!mode) post(channel, { ...packet('discover'), from: address });
          else if (mode === 'local' && !ready) post(channel, { ...packet('join'), from: address, to: hostId });
        }, 1000);
      }
      localTimer = setTimeout(openPeer, channel ? LOCAL_HEAD_START : 0);
      deadline = setTimeout(() => stop('Belum terhubung setelah 12 detik. Cek kode ruang, internet, lalu coba lagi.'), CONNECT_TIMEOUT);
      heartbeat = setInterval(() => {
        if (ready) {
          if (Date.now() - lastSeen > STALE_TIMEOUT) stop('Layar utama tidak merespons. Masuk lagi untuk menyambung.');
          else if (!sendPacket(packet('ping'))) stop('Koneksi ke layar terputus.');
        }
        if (peer?.disconnected && !peer.destroyed && !closed && Date.now() >= reconnectAt) {
          reconnectAt = Date.now() + 3000;
          try { peer.reconnect(); } catch { /* Next heartbeat retries signaling. */ }
        }
      }, 2000);
      return startPromise;
    },
    send(data) {
      return !closed && ready && validData(data) && sendPacket(packet('data', data));
    },
    close() { stop('Controller ditutup.', true); },
  };
}
