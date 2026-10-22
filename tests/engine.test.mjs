import test from 'node:test';
import assert from 'node:assert/strict';
import { TRACKS, WORLD, COLORS, createRace, stepRace, resetCar, standings, nearestOnTrack, formatTime } from '../src/engine.js';

function advance(race, seconds, inputs = {}) {
  const steps = Math.round(seconds * 60);
  for (let index = 0; index < steps; index += 1) stepRace(race, 1 / 60, inputs);
}

test('three closed original circuits fit the playfield and expose geometry', () => {
  assert.equal(TRACKS.length, 3);
  assert.equal(new Set(TRACKS.map((track) => track.id)).size, 3);
  for (const track of TRACKS) {
    assert.ok(track.length > 3000);
    assert.equal(track.checkpoints.length, 20);
    for (const point of track.points) {
      assert.ok(point.x > track.width / 2 && point.x < WORLD.width - track.width / 2);
      assert.ok(point.y > track.width / 2 && point.y < WORLD.height - track.width / 2);
      assert.ok(Number.isFinite(point.angle));
    }
    assert.ok(nearestOnTrack(track, track.start.x, track.start.y).distance < 0.001);
  }
});

test('countdown is stationary and race time starts with driving', () => {
  const race = createRace({ bots: 0 });
  const { x, y } = race.cars[0];
  advance(race, 2);
  assert.equal(race.phase, 'countdown');
  assert.equal(race.elapsed, 0);
  assert.equal(race.cars[0].x, x);
  assert.equal(race.cars[0].y, y);
  advance(race, 2);
  assert.equal(race.phase, 'racing');
  assert.ok(Math.abs(race.elapsed - 1) < 0.00001);
  assert.ok(Math.hypot(race.cars[0].x - x, race.cars[0].y - y) > 70);
});

test('human steering, brake/reverse, boost and offroad grip affect real motion', () => {
  const straight = createRace({ bots: 0 });
  const turning = createRace({ bots: 0 });
  advance(straight, 4.5);
  advance(turning, 4.5, { 'player-1': { steer: 1, boost: true } });
  assert.ok(Math.abs(turning.cars[0].angle - straight.cars[0].angle) > 0.8);
  assert.ok(turning.cars[0].boost < 1);
  advance(straight, 2, { 'player-1': { brake: true } });
  assert.ok(straight.cars[0].speed < 0);
  const car = straight.cars[0];
  car.x = 800;
  car.y = 450;
  car.speed = 300;
  car.vx = 300;
  car.vy = 0;
  advance(straight, 0.5);
  assert.equal(car.offroad, true);
  assert.ok(car.speed < 150);
});

test('bots complete legitimate full laps on every track without a session timer', () => {
  for (const track of TRACKS) {
    const race = createRace({ trackId: track.id, laps: 2, bots: 1, players: [] });
    for (let frame = 0; frame < 60 * 100 && race.phase !== 'finished'; frame += 1) stepRace(race, 1 / 60);
    const car = race.cars[0];
    assert.equal(car.lap, 2, `${track.id}: laps ${car.lap}, gate ${car.nextCheckpoint}, xy ${car.x}, ${car.y}`);
    assert.equal(car.finished, true, track.id);
    assert.ok(car.finishTime > 20 && car.finishTime < 100, `${track.id}: ${car.finishTime}`);
    assert.equal(race.phase, 'finished');
    assert.equal(race.winnerId, car.id);
    assert.equal(car.distance, race.laps * track.length);
    assert.ok(car.bestLap > 10);
  }
});

test('eight-car grid, collisions and standings remain finite through a full race', () => {
  const race = createRace({ bots: 8, players: [], laps: 1 });
  assert.equal(race.cars.length, 8);
  assert.equal(COLORS.length, 8);
  for (let frame = 0; frame < 60 * 80 && race.phase !== 'finished'; frame += 1) stepRace(race, 1 / 60);
  assert.equal(race.phase, 'finished');
  const ranked = standings(race);
  assert.deepEqual(ranked.map((car) => car.place), [1, 2, 3, 4, 5, 6, 7, 8]);
  for (const car of ranked) {
    assert.equal(car.lap, 1);
    for (const key of ['x', 'y', 'speed', 'vx', 'vy', 'boost', 'progress', 'distance']) assert.ok(Number.isFinite(car[key]), key);
  }
});

test('crossing the start repeatedly cannot farm laps or bypass checkpoints', () => {
  const race = createRace({ bots: 0, laps: 1 });
  advance(race, 4);
  const car = race.cars[0];
  assert.equal(car.started, true);
  const gate = race.track.start;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    car.x = gate.x - Math.cos(gate.angle) * 2;
    car.y = gate.y - Math.sin(gate.angle) * 2;
    car.angle = gate.angle;
    car.vx = Math.cos(gate.angle) * 300;
    car.vy = Math.sin(gate.angle) * 300;
    car.speed = 300;
    stepRace(race, 1 / 60);
  }
  assert.equal(car.lap, 0);
  assert.equal(car.nextCheckpoint, 1);
  assert.equal(car.finished, false);
  assert.ok(car.distance <= race.track.length / race.track.checkpoints.length);
});

test('recovery preserves the last legitimate checkpoint and never awards a lap', () => {
  const race = createRace({ players: [], bots: 1, laps: 2 });
  advance(race, 8);
  const car = race.cars[0];
  assert.ok(car.lastCheckpoint > 0);
  const expected = car.nextCheckpoint;
  car.x = 1500;
  car.y = 950;
  assert.equal(resetCar(race, car.id), true);
  assert.equal(car.nextCheckpoint, expected);
  assert.equal(car.lap, 0);
  assert.equal(car.speed, 0);
  assert.ok(nearestOnTrack(race.track, car.x, car.y).distance < 1);
  assert.equal(resetCar(race, 'unknown'), false);
});

test('untrusted inputs and invalid frame times stay bounded; practice has no end timer', () => {
  const race = createRace({ bots: 0, laps: 0 });
  advance(race, 3);
  race.elapsed = 100000;
  advance(race, 1, { 'player-1': { steer: Infinity, throttle: NaN, boost: true } });
  stepRace(race, Infinity);
  stepRace(race, -1);
  assert.equal(race.phase, 'racing');
  assert.ok(race.elapsed > 100000);
  const car = race.cars[0];
  for (const key of ['x', 'y', 'angle', 'speed', 'vx', 'vy', 'boost']) assert.ok(Number.isFinite(car[key]), key);
  assert.ok(car.boost >= 0 && car.boost <= 1);
  assert.equal(formatTime(65.439), '1:05.43');
  assert.equal(formatTime(NaN), '0:00.00');
  assert.equal(formatTime(-4), '0:00.00');
});
