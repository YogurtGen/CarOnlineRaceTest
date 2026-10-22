export const WORLD = { width: 1600, height: 1000 };
export const COLORS = ['#ff634b', '#62d5ff', '#f3ce48', '#bd9aff', '#80d989', '#ff9bc9', '#f5a55a', '#eef1ea'];

const TAU = Math.PI * 2;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const wrap = (value, length) => ((value % length) + length) % length;
const angleDifference = (angle) => wrap(angle + Math.PI, TAU) - Math.PI;

function makeTrack(id, name, subtitle, controls, width, scenery) {
  const points = [];
  for (let i = 0; i < controls.length; i += 1) {
    const p0 = controls[wrap(i - 1, controls.length)];
    const p1 = controls[i];
    const p2 = controls[(i + 1) % controls.length];
    const p3 = controls[(i + 2) % controls.length];
    for (let j = 0; j < 24; j += 1) {
      const t = j / 24;
      const t2 = t * t;
      const t3 = t2 * t;
      const coordinate = (axis) => 0.5 * ((2 * p1[axis]) + (-p0[axis] + p2[axis]) * t +
        (2 * p0[axis] - 5 * p1[axis] + 4 * p2[axis] - p3[axis]) * t2 +
        (-p0[axis] + 3 * p1[axis] - 3 * p2[axis] + p3[axis]) * t3);
      points.push({ x: coordinate(0), y: coordinate(1) });
    }
  }
  let length = 0;
  points.forEach((point, index) => {
    const next = points[(index + 1) % points.length];
    point.s = length;
    point.segmentLength = Math.hypot(next.x - point.x, next.y - point.y);
    point.angle = Math.atan2(next.y - point.y, next.x - point.x);
    point.nx = -Math.sin(point.angle);
    point.ny = Math.cos(point.angle);
    length += point.segmentLength;
  });
  const track = { id, name, subtitle, width, points, length, scenery, world: WORLD };
  track.start = pointAt(track, 0);
  track.checkpoints = Array.from({ length: 20 }, (_, index) => ({
    ...pointAt(track, index * length / 20), index, progress: index / 20,
  }));
  return track;
}

export const TRACKS = [
  makeTrack('harbor', 'Harbor Loop', 'Tikungan lebar. Gas terus.', [
    [360, 220], [900, 175], [1300, 285], [1360, 640], [1120, 795],
    [700, 750], [300, 800], [210, 550], [245, 325],
  ], 142, { ground: '#284d45', road: '#45535b', curb: '#f3ddbd', accent: '#79c9c3' }),
  makeTrack('canyon', 'Copper Canyon', 'Hairpin dan jalur berkelok.', [
    [380, 220], [890, 190], [1320, 260], [1360, 475], [1100, 555],
    [1230, 775], [860, 820], [605, 660], [285, 755], [205, 455],
  ], 130, { ground: '#9b6650', road: '#514c4a', curb: '#f5dcc0', accent: '#d9b87d' }),
  makeTrack('orchard', 'Orchard Run', 'Tiga chicane. Jaga racing line.', [
    [390, 195], [1030, 180], [1320, 350], [1250, 560], [1360, 765],
    [1020, 815], [800, 605], [550, 785], [270, 725], [215, 455],
  ], 132, { ground: '#546346', road: '#454d50', curb: '#e4dbbb', accent: '#b7cc75' }),
];

function pointAt(track, distance) {
  const s = wrap(distance, track.length);
  let index = 0;
  let high = track.points.length - 1;
  while (index < high) {
    const middle = Math.ceil((index + high) / 2);
    if (track.points[middle].s <= s) index = middle;
    else high = middle - 1;
  }
  const point = track.points[index];
  const next = track.points[(index + 1) % track.points.length];
  const t = (s - point.s) / point.segmentLength;
  return { x: point.x + (next.x - point.x) * t, y: point.y + (next.y - point.y) * t,
    angle: point.angle, nx: point.nx, ny: point.ny, s, progress: s / track.length, index };
}

export function nearestOnTrack(track, x, y) {
  x = finite(x);
  y = finite(y);
  let result = null;
  let closestSquared = Infinity;
  for (let index = 0; index < track.points.length; index += 1) {
    const point = track.points[index];
    const next = track.points[(index + 1) % track.points.length];
    const dx = next.x - point.x;
    const dy = next.y - point.y;
    const t = clamp(((x - point.x) * dx + (y - point.y) * dy) / (dx * dx + dy * dy), 0, 1);
    const px = point.x + t * dx;
    const py = point.y + t * dy;
    const squared = (px - x) ** 2 + (py - y) ** 2;
    if (squared < closestSquared) {
      closestSquared = squared;
      const s = wrap(point.s + point.segmentLength * t, track.length);
      result = { x: px, y: py, distance: Math.sqrt(squared), index, t, s,
        progress: s / track.length, angle: point.angle, nx: point.nx, ny: point.ny };
    }
  }
  return result;
}

export function createRace({ trackId = 'harbor', laps = 3, bots = 3,
  players = [{ id: 'player-1', name: 'Player 1' }] } = {}) {
  const track = TRACKS.find((candidate) => candidate.id === trackId) || TRACKS[0];
  const people = (Array.isArray(players) ? players : []).slice(0, 8);
  const roster = people.map((player, index) => ({
    id: String(player.id || `player-${index + 1}`),
    name: String(player.name || `Player ${index + 1}`).slice(0, 24),
    color: COLORS.includes(player.color) ? player.color : COLORS[index], isBot: false,
  }));
  const botCount = clamp(Math.floor(finite(bots, 3)), 0, 8 - roster.length);
  for (let index = 0; index < botCount; index += 1) {
    roster.push({ id: `bot-${index + 1}`, name: ['NOVA', 'MILO', 'KIKI', 'RIO', 'JUNO', 'AXEL', 'LUNA', 'BEAU'][index],
      color: COLORS[roster.length], isBot: true });
  }
  const ids = new Set();
  const cars = roster.map((entry, index) => {
    let id = entry.id;
    while (ids.has(id)) id += '-2';
    ids.add(id);
    const behind = 54 + Math.floor(index / 2) * 47;
    const start = pointAt(track, -behind);
    const offset = index % 2 === 0 ? -23 : 23;
    return { ...entry, id, x: start.x + start.nx * offset, y: start.y + start.ny * offset,
      angle: start.angle, speed: 0, vx: 0, vy: 0, lap: 0, progress: start.progress,
      distance: -behind, boost: 1, boosting: false, finished: false, finishTime: null,
      place: index + 1, offroad: false, nextCheckpoint: 0, lastCheckpoint: 0,
      started: false, bestLap: null, lapStartedAt: 0, lastLap: null, _boostLocked: false };
  });
  return { trackId: track.id, track, cars, laps: Math.floor(clamp(finite(laps, 3), 0, 99)),
    phase: 'countdown', countdown: 3, elapsed: 0, winnerId: null };
}

function botInput(race, car, nearest) {
  const speed = Math.max(0, car.speed);
  const lookahead = 44 + speed * 0.23;
  const target = pointAt(race.track, nearest.s + lookahead);
  const error = angleDifference(Math.atan2(target.y - car.y, target.x - car.x) - car.angle);
  let desiredSpeed = 284;
  let curvature = 0;
  for (let ahead = 20; ahead <= 260; ahead += 40) {
    const first = pointAt(race.track, nearest.s + ahead);
    const second = pointAt(race.track, nearest.s + ahead + 40);
    const bend = Math.abs(angleDifference(second.angle - first.angle)) / 40;
    curvature = Math.max(curvature, bend);
    const cornerSpeed = Math.sqrt(200 / Math.max(bend, 0.001));
    desiredSpeed = Math.min(desiredSpeed, Math.sqrt(cornerSpeed ** 2 + 2 * 180 * Math.max(0, ahead - 35)));
  }
  const leaderDistance = Math.max(...race.cars.map((racer) => racer.distance));
  const catchup = clamp((leaderDistance - car.distance) / race.track.length, 0, 1) * 12;
  desiredSpeed = clamp(desiredSpeed, 85, 284) + catchup;
  const steer = clamp((2.35 * Math.max(speed, 65) * Math.sin(error)) /
    (lookahead * (1.3 + speed * 0.006)), -1, 1);
  return { steer, throttle: speed < desiredSpeed ? 1 : 0.12,
    brake: speed > desiredSpeed + 22, boost: curvature < 0.0025 && Math.abs(error) < 0.12 && car.boost > 0.45 };
}

function normalizeInput(input) {
  return { steer: clamp(finite(input?.steer), -1, 1),
    throttle: input?.throttle == null ? 1 : clamp(finite(input.throttle), 0, 1),
    brake: input?.brake === true, boost: input?.boost === true };
}

function updateProgress(race, car, previousX, previousY) {
  const track = race.track;
  const nearest = nearestOnTrack(track, car.x, car.y);
  car.progress = nearest.progress;
  car.offroad = nearest.distance > track.width / 2;
  const gate = track.checkpoints[car.nextCheckpoint];
  const tx = Math.cos(gate.angle);
  const ty = Math.sin(gate.angle);
  const before = (previousX - gate.x) * tx + (previousY - gate.y) * ty;
  const after = (car.x - gate.x) * tx + (car.y - gate.y) * ty;
  const crossT = before / (before - after);
  const crossX = previousX + (car.x - previousX) * crossT;
  const crossY = previousY + (car.y - previousY) * crossT;
  const crosses = before <= 0 && after > 0 &&
    Math.hypot(crossX - gate.x, crossY - gate.y) <= track.width / 2 + 10 &&
    Math.hypot(car.x - previousX, car.y - previousY) < 30;
  if (crosses) {
    car.lastCheckpoint = car.nextCheckpoint;
    if (car.nextCheckpoint === 0) {
      if (car.started) {
        car.lap += 1;
        car.lastLap = race.elapsed - car.lapStartedAt;
        car.bestLap = car.bestLap == null ? car.lastLap : Math.min(car.bestLap, car.lastLap);
      }
      car.started = true;
      car.lapStartedAt = race.elapsed;
      if (race.laps > 0 && car.lap >= race.laps) {
        car.finished = true;
        car.finishTime = race.elapsed;
        car.distance = race.laps * track.length;
        car.boosting = false;
        race.winnerId ||= car.id;
      }
    }
    car.nextCheckpoint = (car.nextCheckpoint + 1) % track.checkpoints.length;
  }
  if (car.finished) return;
  if (!car.started) {
    car.distance = -clamp(track.length - nearest.s, 0, track.length / 4);
    return;
  }
  const gateLength = track.length / track.checkpoints.length;
  const previousGate = car.nextCheckpoint === 0 ? track.checkpoints.length - 1 : car.nextCheckpoint - 1;
  let s = nearest.s;
  if (car.nextCheckpoint === 0 && s < gateLength) s += track.length;
  car.distance = car.lap * track.length + clamp(s, previousGate * gateLength, (previousGate + 1) * gateLength);
}

function collideCars(cars) {
  for (let i = 0; i < cars.length; i += 1) {
    for (let j = i + 1; j < cars.length; j += 1) {
      const a = cars[i];
      const b = cars[j];
      if (a.finished || b.finished) continue;
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      let distance = Math.hypot(dx, dy);
      if (distance >= 33) continue;
      if (distance < 0.001) { dx = 1; dy = 0; distance = 1; }
      const nx = dx / distance;
      const ny = dy / distance;
      const separation = (33 - distance) / 2;
      a.x -= nx * separation;
      a.y -= ny * separation;
      b.x += nx * separation;
      b.y += ny * separation;
      const relativeSpeed = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (relativeSpeed < 0) {
        const impulse = -relativeSpeed * 0.62;
        a.vx -= nx * impulse;
        a.vy -= ny * impulse;
        b.vx += nx * impulse;
        b.vy += ny * impulse;
        a.speed *= 0.985;
        b.speed *= 0.985;
      }
    }
  }
}

function tick(race, dt, inputs) {
  race.elapsed += dt;
  for (const car of race.cars) {
    if (car.finished) continue;
    const previousX = car.x;
    const previousY = car.y;
    const nearest = nearestOnTrack(race.track, car.x, car.y);
    const input = car.isBot ? botInput(race, car, nearest) : normalizeInput(inputs instanceof Map ? inputs.get(car.id) : inputs?.[car.id]);
    const offroad = nearest.distance > race.track.width / 2;
    if (!input.boost) car._boostLocked = false;
    car.boosting = input.boost && !car._boostLocked && car.boost > 0 && !input.brake && !offroad;
    car.boost = clamp(car.boost + (car.boosting ? -0.30 : 0.085) * dt, 0, 1);
    if (car.boost <= 0) car._boostLocked = true;
    const acceleration = offroad ? 180 : car.boosting ? 610 : 370;
    if (input.brake) car.speed = Math.max(-95, car.speed - 610 * dt);
    else car.speed += (input.throttle * acceleration - car.speed * (offroad ? 2.3 : 0.55) - Math.sign(car.speed) * 19) * dt;
    car.speed *= Math.exp(-Math.abs(input.steer) * (offroad ? 0.35 : 0.075) * dt);
    car.speed = clamp(car.speed, -95, offroad ? 150 : car.boosting ? 410 : 305);
    const moving = clamp(Math.abs(car.speed) / 45, 0, 1);
    car.angle = angleDifference(car.angle + input.steer * (1.3 + Math.abs(car.speed) * 0.006) * moving * Math.sign(car.speed) * dt);
    const grip = 1 - Math.exp(-(offroad ? 5 : input.brake ? 7 : 11) * dt);
    car.vx += (Math.cos(car.angle) * car.speed - car.vx) * grip;
    car.vy += (Math.sin(car.angle) * car.speed - car.vy) * grip;
    car.x = clamp(car.x + car.vx * dt, 25, WORLD.width - 25);
    car.y = clamp(car.y + car.vy * dt, 25, WORLD.height - 25);
    if (car.x === 25 || car.x === WORLD.width - 25 || car.y === 25 || car.y === WORLD.height - 25) {
      car.speed *= 0.9;
      car.vx *= 0.8;
      car.vy *= 0.8;
    }
    updateProgress(race, car, previousX, previousY);
  }
  collideCars(race.cars);
  standings(race);
  if (race.cars.length > 0 && race.cars.every((car) => car.finished || car.isBot) && race.cars.some((car) => car.finished && !car.isBot)) {
    race.phase = 'finished';
  } else if (race.cars.length > 0 && race.cars.every((car) => car.finished)) race.phase = 'finished';
}

export function stepRace(race, dt, inputs = {}) {
  let remaining = clamp(finite(dt), 0, 0.25);
  if (race.phase === 'finished' || remaining === 0) return race;
  if (race.phase === 'countdown') {
    const consumed = Math.min(remaining, race.countdown);
    race.countdown = Math.max(0, race.countdown - consumed);
    remaining -= consumed;
    if (race.countdown > 0.000001) return race;
    race.countdown = 0;
    race.phase = 'racing';
  }
  while (remaining > 0.000001 && race.phase === 'racing') {
    const step = Math.min(remaining, 1 / 120);
    tick(race, step, inputs);
    remaining -= step;
  }
  return race;
}

export function standings(race) {
  const ranked = [...race.cars].sort((a, b) => {
    if (a.finished && b.finished) return a.finishTime - b.finishTime;
    if (a.finished !== b.finished) return a.finished ? -1 : 1;
    return b.distance - a.distance;
  });
  ranked.forEach((car, index) => { car.place = index + 1; });
  return ranked;
}

export function resetCar(race, id) {
  const car = race.cars.find((candidate) => candidate.id === id);
  if (!car || car.finished) return false;
  const checkpoint = race.track.checkpoints[car.started ? car.lastCheckpoint : 0];
  const position = pointAt(race.track, checkpoint.s + (car.started ? 20 : -45));
  car.x = position.x;
  car.y = position.y;
  car.angle = position.angle;
  car.speed = 0;
  car.vx = 0;
  car.vy = 0;
  car.offroad = false;
  car.boosting = false;
  car.progress = position.progress;
  if (car.started) car.distance = car.lap * race.track.length + checkpoint.s;
  else car.distance = -45;
  return true;
}

export function formatTime(seconds) {
  const centiseconds = Math.floor(Math.max(0, finite(seconds)) * 100 + 0.000001);
  const minutes = Math.floor(centiseconds / 6000);
  return `${minutes}:${String(Math.floor(centiseconds / 100) % 60).padStart(2, '0')}.${String(centiseconds % 100).padStart(2, '0')}`;
}
