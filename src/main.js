import { TRACKS, COLORS, createRace, stepRace, standings, resetCar, formatTime } from './engine.js';
import { createRenderer } from './renderer.js';
import { createHost, createController, normalizeRoom } from './network.js';

const $ = (id) => document.getElementById(id);
const stage = $('stage');
const people = new Map();
const remoteInputs = new Map();
const keys = new Set();
const pressed = new Map();
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const initialRoom = new URLSearchParams(location.hash.slice(1)).get('join');
let renderer;
let view = 'home', host = null, controller = null, race = null, demo = null;
let running = false, paused = false, controllerRoom = '', driverId = '', wakeLock = null;
let lastPhase = '', lastUI = 0, frameTime = performance.now(), accumulator = 0;
let lastAssetUI = 0;
let toastTimer, connected = false, disposed = 0, previousControllerId = '', inputSuspended = false;

function ensureRenderer() {
  if (renderer) return true;
  try { renderer=createRenderer($('race-canvas')); return true; }
  catch { toast('WebGL tidak tersedia. Aktifkan hardware acceleration lalu muat ulang.'); return false; }
}
if (!initialRoom) ensureRenderer();

for (const track of TRACKS) {
  const option = document.createElement('option'); option.value = track.id; option.textContent = track.name;
  $('track-select').append(option);
}
function toast(message) {
  $('toast').textContent = message; $('toast').hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').hidden = true; }, 4000);
}
function show(next) {
  view = next;
  for (const name of ['home','host','controller']) $(`${name}-view`).hidden = name !== next;
  $('footer').hidden = next === 'controller';
  document.body.classList.toggle('controller-active', next === 'controller');
  if (next !== 'controller') $(next === 'host' ? 'host-stage' : 'home-stage').append(stage);
  stage.hidden = next === 'controller';
}
function makeDemo(trackId = $('track-select').value) {
  demo = createRace({ trackId, players: [], bots: 8, laps: 0 });
  demo.phase = 'racing'; demo.countdown = 0;
  $('track-label').textContent = demo.track.name;
}
function cleanup() {
  disposed++; host?.close(); controller?.close(); host = null; controller = null;
  people.clear(); remoteInputs.clear(); keys.clear(); pressed.clear();
  running = false; paused = false; race = null; connected = false; driverId = ''; previousControllerId = ''; inputSuspended = false;
  wakeLock?.release().catch(() => {}); wakeLock = null;
}
async function keepAwake() {
  try { if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen'); } catch {}
}
function home() {
  cleanup(); history.replaceState(null, '', location.pathname + location.search);
  show('home'); ensureRenderer(); makeDemo(); $('race-overlay').hidden = true; $('leaderboard').hidden = true; $('viewport-huds').hidden = true;
}
function roomLink() {
  const url = new URL(location.href); url.hash = `join=${host.room}`; return url.href;
}
function displayRoom() {
  if (!host) return;
  $('room-code').textContent = host.room;
  const qr = window.qrcode?.(0, 'M');
  if (qr) { qr.addData(roomLink()); qr.make(); $('qr').innerHTML = qr.createSvgTag({ scalable: true, margin: 0 }); $('qr').querySelector('svg').setAttribute('aria-label','QR untuk bergabung ke room'); }
}
function roster() {
  const list = $('players-list'); list.replaceChildren();
  for (const player of people.values()) {
    const li = document.createElement('li');
    const swatch = document.createElement('i'); swatch.className = 'swatch'; swatch.style.background = player.color;
    const name = document.createElement('span'); name.textContent = player.name;
    const status = document.createElement('small'); status.textContent = player.local ? (player.id === 'keyboard-1' ? 'PANAH' : 'WASD') : player.connected ? 'HP' : 'TERPUTUS';
    li.append(swatch, name, status); list.append(li);
  }
  $('no-players').hidden = people.size > 0;
  $('player-count').textContent = `${people.size} / 4`;
  $('start-button').disabled = people.size === 0;
  $('keyboard-button').disabled = running || people.size >= 4 || [...people.values()].filter(p => p.local).length >= 2;
}
function sendWelcome(id) {
  const player = people.get(id);
  if (player) host.send(id, {type:'welcome',id,name:player.name,color:player.color,waiting:running&&!race?.cars.some(c=>c.id===id)});
}
function hostMessage(id, data) {
  if (!data || typeof data !== 'object') return;
  if (data.type === 'hello') {
    if (typeof data.name !== 'string') return;
    if (!people.has(id) && people.size >= 4) { host.send(id,{type:'rejected',message:'Grid penuh. Maksimal 4 pembalap manusia.'}); return; }
    const name = data.name.trim().replace(/[\u0000-\u001f\u007f]/g,'').slice(0,16) || 'Pembalap';
    if (!people.has(id)) people.set(id,{id,name,color:COLORS[people.size],local:false,connected:true});
    else people.get(id).connected = true;
    sendWelcome(id); roster(); return;
  }
  if (!people.has(id)) return;
  if (data.type === 'input' && Number.isFinite(data.steer) && Number.isFinite(data.throttle)) {
    remoteInputs.set(id,{steer:Math.max(-1,Math.min(1,data.steer)),throttle:Math.max(0,Math.min(1,data.throttle)),brake:data.brake===true,boost:data.boost===true,time:performance.now()});
  }
  if (data.type === 'reset' && running) resetCar(race,id);
}
function addKeyboard() {
  if (people.size >= 4 || running) return;
  const id = people.has('keyboard-1') ? 'keyboard-2' : 'keyboard-1';
  if (people.has(id)) return;
  people.set(id,{id,name:id==='keyboard-1'?'Pembalap 1':'Pembalap 2',color:COLORS[people.size],local:true,connected:true}); roster();
}
async function beginHost(solo = false) {
  if (!ensureRenderer()) return;
  cleanup(); show('host'); makeDemo(); lastPhase = '';
  $('setup-panel').hidden = false; $('lobby-button').hidden = true; $('pause-button').hidden = true;
  $('start-button').hidden = false; $('start-button').textContent = 'MULAI BALAPAN'; $('host-title').textContent = 'Siapa yang paling kencang?';
  $('race-overlay').hidden = true; $('leaderboard').hidden = true; $('viewport-huds').hidden = true;
  $('race-clock').textContent = 'PILIH LINTASAN. SIAPKAN HP.'; $('host-status').textContent = 'Menyiapkan room...';
  const generation = disposed;
  host = createHost({
    onStatus(status) { if(generation!==disposed)return; $('host-status').textContent=status.message; $('host-status').classList.toggle('error',['offline','error'].includes(status.state)); displayRoom(); },
    onJoin(id) { if(generation!==disposed)return; host.send(id,{type:'host',phase:running?race.phase:'lobby'}); },
    onLeave(id) { if(generation!==disposed)return; if(running&&people.has(id))people.get(id).connected=false; else people.delete(id); remoteInputs.delete(id); roster(); },
    onMessage:hostMessage
  });
  displayRoom(); roster();
  host.start().catch(error=>{ if(generation===disposed){$('host-status').textContent=error.message;$('host-status').classList.add('error');}});
  if (solo) { addKeyboard(); startRace(); }
  keepAwake();
}
function startRace() {
  if (!people.size) return;
  for (const [id,player] of people) if (!player.connected) people.delete(id);
  if (!people.size) { roster(); return; }
  race = createRace({trackId:$('track-select').value,laps:Number($('laps-select').value),bots:Number($('bots-select').value),players:[...people.values()]});
  running = true; paused = false; lastPhase = ''; accumulator = 0; keys.clear();
  $('setup-panel').hidden = true; $('start-button').hidden = true; $('lobby-button').hidden = false;
  $('pause-button').hidden = false; $('pause-button').textContent = 'Jeda';
  $('track-label').textContent = race.track.name; $('host-title').textContent = race.laps ? 'Gas. Kejar garis finis.' : 'Free ride. Jalan terus.';
  $('leaderboard').hidden = true; $('viewport-huds').hidden = false;
  host?.broadcast({type:'race',phase:'countdown',laps:race.laps}); roster();
}
function lobby() {
  running = false; paused = false; race = null; remoteInputs.clear(); keys.clear();
  for (const [id,p] of people) if(!p.connected)people.delete(id);
  $('setup-panel').hidden = false; $('start-button').hidden = false; $('start-button').textContent='MULAI BALAPAN';
  $('lobby-button').hidden = true; $('pause-button').hidden = true; $('race-overlay').hidden = true; $('leaderboard').hidden = true; $('viewport-huds').hidden = true;
  $('host-title').textContent = 'Siapa yang paling kencang?'; $('race-clock').textContent = 'PILIH LINTASAN. SIAPKAN HP.';
  host?.broadcast({type:'lobby'}); makeDemo(); roster();
}
function togglePause() {
  if (!running || race.phase === 'finished') return;
  paused = !paused; keys.clear(); $('pause-button').textContent = paused ? 'Lanjut' : 'Jeda';
  host?.broadcast({type:'paused',value:paused}); updateRaceUI();
}
function openController(code) {
  const normalized = normalizeRoom(code);
  if (!normalized) { toast('Kode room harus 6 huruf atau angka dari layar.'); return; }
  cleanup(); controllerRoom = normalized;
  try { previousControllerId=sessionStorage.getItem(`couch-rally-id-${normalized}`)||''; } catch {}
  history.replaceState(null,'',`#join=${normalized}`); show('controller');
  $('controller-room').textContent = normalized; $('driver-form').hidden = false; $('gamepad').hidden = true;
  $('join-status').textContent = ''; $('driver-form').querySelector('button').disabled = false;
  try { $('driver-name').value = localStorage.getItem('couch-rally-name') || ''; } catch {}
  $('driver-name').focus();
}
function padMessage(data) {
  if (!data || typeof data !== 'object') return;
  if (data.type === 'welcome') {
    connected = true; driverId = data.id; inputSuspended = document.hidden;
    $('driver-form').hidden = true; $('gamepad').hidden = false;
    $('pad-name').textContent = data.name; $('pad-room').textContent = `ROOM ${controllerRoom}`;
    $('pad-status').textContent = data.waiting ? 'Balapan berlangsung. Kamu masuk di balapan berikutnya.' : 'Tersambung. Tunggu host mulai balapan.';
    $('boost-fill').style.width = '100%'; keepAwake(); sendInput();
  }
  if (data.type === 'rejected') { disconnected(data.message); controller?.close(); }
  if (data.type === 'lobby') $('pad-status').textContent = 'Di pit lane. Tunggu host mulai balapan.';
  if (data.type === 'race') { $('pad-status').textContent = 'Siap-siap...'; pressed.clear(); }
  if (data.type === 'paused') $('pad-status').textContent = data.value ? 'Balapan dijeda oleh host.' : 'GAS!';
  if (data.type === 'telemetry') {
    $('pad-position').textContent = `P${data.place}`; $('pad-speed').textContent = String(data.speed);
    $('pad-lap').textContent = data.laps ? `${Math.min(data.lap+1,data.laps)}/${data.laps}` : '∞';
    $('boost-fill').style.width = `${Math.max(0,Math.min(1,data.boost))*100}%`;
    $('pad-status').textContent = data.paused ? 'Balapan dijeda oleh host.' : data.phase==='countdown' ? `Start dalam ${Math.ceil(data.countdown)}...` : data.finished ? `FINIS! Posisi ${data.place}. Tunggu host untuk balapan lagi.` : data.phase==='finished' ? 'Balapan selesai. Tunggu host untuk balapan lagi.' : 'GAS! Belok, rem, dan boost di jalan lurus.';
  }
}
function disconnected(message) {
  connected=false; pressed.clear(); keys.clear();
  $('gamepad').hidden=true; $('driver-form').hidden=false;
  $('join-status').textContent=message || 'Koneksi terputus. Pastikan layar host masih terbuka, lalu sambungkan lagi.';
  $('driver-form').querySelector('button').disabled=false;
}
async function join(event) {
  event.preventDefault();
  const name = $('driver-name').value.trim().slice(0,16);
  if (!name) { $('driver-name').focus(); return; }
  try { localStorage.setItem('couch-rally-name', name); } catch {}
  controller?.close(); const generation=disposed;
  $('driver-form').querySelector('button').disabled=true;
  controller = createController({room:controllerRoom,id:previousControllerId,onStatus(status){if(generation===disposed)$('join-status').textContent=status.message;},onMessage:padMessage,onClose(message){if(generation===disposed)disconnected(message);}});
  previousControllerId = controller.id;
  try { sessionStorage.setItem(`couch-rally-id-${controllerRoom}`,previousControllerId); } catch {}
  try { await controller.start(); if(generation===disposed)controller.send({type:'hello',name}); }
  catch(error) { if(generation===disposed)disconnected(error.message); }
}
function activeControl(name) { return [...pressed.values()].includes(name); }
function sendInput(forceStop = false) {
  if (!connected) return;
  forceStop = forceStop || inputSuspended || document.hidden;
  controller?.send({type:'input',steer:forceStop?0:Number(activeControl('right')||keys.has('ArrowRight'))-Number(activeControl('left')||keys.has('ArrowLeft')),throttle:forceStop?0:$('auto-gas').checked||activeControl('gas')||keys.has('ArrowUp')?1:0,brake:forceStop||activeControl('brake')||keys.has('ArrowDown'),boost:!forceStop&&(activeControl('boost')||keys.has('Space'))});
}
function keyboardInput(id) {
  const p2=id==='keyboard-2';
  return {steer:Number(keys.has(p2?'KeyD':'ArrowRight'))-Number(keys.has(p2?'KeyA':'ArrowLeft')),throttle:1,brake:keys.has(p2?'KeyS':'ArrowDown'),boost:keys.has(p2?'ShiftLeft':'Space')||p2&&keys.has('ShiftRight')};
}
function updateRaceUI() {
  if(!race)return;
  const sorted=standings(race);
  $('race-clock').textContent=`${race.laps ? race.laps+' LAP' : 'FREE RIDE ∞'} / ${formatTime(race.elapsed)}`;
  const overlay=$('race-overlay');
  overlay.hidden=!(paused||race.phase==='countdown'||race.phase==='finished');
  overlay.replaceChildren();
  if(!overlay.hidden){const title=document.createElement('strong'),caption=document.createElement('span');title.textContent=paused?'JEDA':race.phase==='countdown'?String(Math.max(1,Math.ceil(race.countdown))):'FINIS!';caption.textContent=paused?'Tekan Lanjut untuk kembali balapan.':race.phase==='countdown'?'GAS OTOMATIS. SIAPKAN JEMPOL.':`${sorted[0]?.name || 'Pembalap'} menang. Balapan lagi kapan pun.`;overlay.append(title,caption);}
  const leaderboard=$('leaderboard');leaderboard.replaceChildren();
  for(const car of sorted){const row=document.createElement('div'),pos=document.createElement('b'),mark=document.createElement('i'),name=document.createElement('span'),lap=document.createElement('small');pos.textContent=car.place;mark.style.background=car.color;name.textContent=car.name;lap.textContent=car.finished?'FINIS':race.laps?`${Math.min(car.lap+1,race.laps)}/${race.laps}`:'∞';row.append(pos,mark,name,lap);leaderboard.append(row);}
  const humans=race.cars.filter(c=>!c.isBot).slice(0,4);
  const hud=$('viewport-huds');hud.replaceChildren();hud.dataset.count=humans.length;
  for(const car of humans){const panel=document.createElement('div');panel.className='viewport-hud';const top=document.createElement('div');top.className='viewport-top';const name=document.createElement('strong'),lap=document.createElement('span');name.textContent=`P${car.place} / ${race.cars.length}  ${car.name}`;lap.textContent=race.laps?`LAP ${Math.min(car.lap+1,race.laps)}/${race.laps}`:'FREE RIDE';top.append(name,lap);const speed=document.createElement('div');speed.className='viewport-speed';speed.textContent=`${Math.round(Math.max(0,car.speed)*.45)} KM/J`;panel.append(top,speed);hud.append(panel);}
  if(race.phase==='finished'&&lastPhase!=='finished'){ $('start-button').hidden=false;$('start-button').textContent='BALAPAN LAGI';$('pause-button').hidden=true; }
  lastPhase=race.phase;
  for(const player of people.values()) if(!player.local){const car=race.cars.find(c=>c.id===player.id);if(car)host?.send(player.id,{type:'telemetry',phase:race.phase,countdown:race.countdown,place:car.place,speed:Math.round(Math.max(0,car.speed)*.45),lap:car.lap,laps:race.laps,boost:car.boost,finished:car.finished,paused});}
}
function frame(now) {
  const dt=Math.min((now-frameTime)/1000,.1);frameTime=now;
  if(view!=='controller'&&renderer){
    if(running&&race){
      if(!paused){accumulator+=dt;let steps=0;const inputs={};for(const p of people.values()){if(p.local)inputs[p.id]=keyboardInput(p.id);else {const input=remoteInputs.get(p.id);inputs[p.id]=input&&now-input.time<650?input:{steer:0,throttle:0,brake:true,boost:false};}}while(accumulator>=1/60&&steps++<8){stepRace(race,1/60,inputs);accumulator-=1/60;}}
      renderer.draw(race,{labels:true,split:true,motion:!reducedMotion});
      if(now-lastUI>100){updateRaceUI();lastUI=now;}
    } else if(demo){if(!reducedMotion)stepRace(demo,dt,{});renderer.draw(demo,{labels:false,split:false,motion:!reducedMotion});}
    if(now-lastAssetUI>300){
      const stats=renderer.getStats(),failed=stats.modelError||stats.assets?.errors?.length;
      const loading=stats.models==='loading'||stats.assets?.pending>0;
      $('asset-status').hidden=!failed&&!loading;
      $('asset-status').textContent=failed?'Sebagian aset gagal dimuat. Mobil cadangan aktif; muat ulang untuk mencoba lagi.':'Memuat aset 3D...';
      lastAssetUI=now;
    }
  }
  requestAnimationFrame(frame);
}

$('host-button').onclick=()=>beginHost();$('solo-button').onclick=()=>beginHost(true);$('home-button').onclick=home;
$('join-form').onsubmit=e=>{e.preventDefault();openController($('room-input').value);};
$('driver-form').onsubmit=join;$('keyboard-button').onclick=addKeyboard;$('start-button').onclick=startRace;
$('lobby-button').onclick=lobby;$('pause-button').onclick=togglePause;
$('track-select').onchange=()=>makeDemo();
$('copy-button').onclick=async()=>{try{await navigator.clipboard.writeText(roomLink());toast('Link controller disalin.');}catch{toast('Salin alamat website dan tambahkan #join='+host.room);}};
$('fullscreen-button').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{toast('Layar penuh tidak didukung browser ini.');}};
$('disconnect-button').onclick=home;$('reset-button').onclick=()=>controller?.send({type:'reset'});
$('auto-gas').onchange=()=>{$('gas-button').hidden=$('auto-gas').checked;sendInput();};
for(const [button,dialog] of [['help-button','help-dialog'],['credits-button','credits-dialog']])$(button).onclick=()=>$(dialog).showModal();
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>b.closest('dialog').close());
for(const button of document.querySelectorAll('[data-control]')){
  button.addEventListener('pointerdown',e=>{if(!connected)return;e.preventDefault();button.setPointerCapture(e.pointerId);pressed.set(e.pointerId,button.dataset.control);button.classList.add('pressed');sendInput();});
  const release=e=>{pressed.delete(e.pointerId);button.classList.remove('pressed');sendInput();};
  button.addEventListener('pointerup',release);button.addEventListener('pointercancel',release);button.addEventListener('lostpointercapture',release);
  button.addEventListener('keydown',e=>{if(e.code==='Space'||e.code==='Enter'){e.preventDefault();pressed.set(`key-${button.dataset.control}`,button.dataset.control);button.classList.add('pressed');sendInput();}});
  button.addEventListener('keyup',e=>{if(e.code==='Space'||e.code==='Enter'){pressed.delete(`key-${button.dataset.control}`);button.classList.remove('pressed');sendInput();}});
}
document.addEventListener('keydown',e=>{
  if(document.querySelector('dialog[open]')||['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName))return;
  if((view==='host'&&running)||(view==='controller'&&connected)){
    if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Space','KeyA','KeyD','KeyS','KeyW','ShiftLeft','ShiftRight','KeyR','Escape'].includes(e.code))e.preventDefault();
    keys.add(e.code);
    if(!e.repeat&&e.code==='KeyR'){
      if(view==='host'){for(const p of people.values())if(p.local)resetCar(race,p.id);}
      else controller?.send({type:'reset'});
    }
    if(!e.repeat&&e.code==='Escape'&&view==='host')togglePause();
    if(view==='controller')sendInput();
  }
});
document.addEventListener('keyup',e=>{keys.delete(e.code);if(view==='controller')sendInput();});
window.addEventListener('blur',()=>{inputSuspended=true;keys.clear();pressed.clear();document.querySelectorAll('.pressed').forEach(e=>e.classList.remove('pressed'));sendInput(true);});
window.addEventListener('focus',()=>{inputSuspended=document.hidden;sendInput();});
document.addEventListener('visibilitychange',()=>{inputSuspended=document.hidden;if(document.hidden){keys.clear();pressed.clear();sendInput(true);if(view==='host'&&running&&!paused)togglePause();}else if(connected||host){keepAwake();sendInput();}});
window.addEventListener('pagehide',()=>{sendInput(true);host?.close();controller?.close();});
window.addEventListener('hashchange',()=>{const code=new URLSearchParams(location.hash.slice(1)).get('join');if(code&&view!=='controller')openController(code);});
setInterval(()=>{if(view==='controller'&&connected)sendInput();},50);
makeDemo();show('home');requestAnimationFrame(frame);
if(initialRoom)openController(initialRoom);
