// ============================================================================
//  SQWEEE — main game. Nape drives movement & obstacle collisions; the Blob class
//  handles the squishy rendering; the World streams an endless field.
// ============================================================================

import { Space, Body, BodyType, Circle, Vec2, Material } from '@newkrok/nape-js';
import { CONFIG, SKINS, PICKUPS } from './config.js';
import { World } from './world.js';
import { Blob } from './blob.js';
import { initInput, getSteer, getJoystick, consumeBoost, getBoostCharge } from './input.js';
import { unlock, blip, chime } from './audio.js';

// --- Canvas & DPR ------------------------------------------------------------
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
let W = 0, H = 0, DPR = 1;

function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth; H = window.innerHeight;
  canvas.width = Math.floor(W * DPR);
  canvas.height = Math.floor(H * DPR);
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}
window.addEventListener('resize', resize);
resize();

// --- Physics (Nape) ----------------------------------------------------------
const space = new Space(new Vec2(0, 0));   // top-down: no gravity
space.worldLinearDrag = CONFIG.COAST_DRAG; // gives the coast-to-a-stop glide

// Bouncy, low-friction "slime" material shared by the blob and obstacles so
// ramming something bigger shoves you back instead of just stopping.
const bouncy = new Material(CONFIG.BOUNCE_ELASTICITY, 0.1, 0.2);

const blobBody = new Body(BodyType.DYNAMIC, new Vec2(0, 0));
blobBody.shapes.add(new Circle(CONFIG.BLOB_START_RADIUS, undefined, bouncy));
blobBody.allowRotation = false;            // no spinning; eyes stay upright
blobBody.space = space;
let physRadius = CONFIG.BLOB_START_RADIUS;  // radius the Nape shape currently is

const world = new World(space, { Body, BodyType, Circle, Vec2 }, bouncy);
const blob = new Blob();

// --- Game state --------------------------------------------------------------
const particles = [];         // world-space splash particles
let totalAbsorbed = 0;
let skinIndex = 0;
let prevVx = 0, prevVy = 0;
let knockStun = 0;            // seconds of "no steering" left after a bump
let boostCooldown = 0;        // seconds until the next space-bar boost is allowed
let boostGrace = 0;           // seconds where steering won't brake a fresh boost surge
let zoom = 1;                 // camera zoom (world px -> screen px)
let running = false;

// Combo / streak
let combo = 0;                // bites in the current streak
let comboTimer = 0;           // seconds left to grab the next bite before it resets
let bestCombo = Number(localStorage.getItem('sqweee.bestCombo')) || 0;  // all-time best, persisted
let beatBestThisRun = false;  // so we only celebrate once per streak

// The window the current countdown is draining over (normally COMBO_WINDOW, but
// the bomb grants a longer one). The meter bar is drawn as a fraction of this,
// so it never overflows and drains slower when the window is longer.
let comboWindowMax = CONFIG.COMBO_WINDOW;

// Refresh the streak timer to a full normal window — but never shorten a longer
// window that's already running (e.g. the bomb grace).
function keepComboAlive() {
  if (comboTimer <= CONFIG.COMBO_WINDOW) {
    comboTimer = CONFIG.COMBO_WINDOW;
    comboWindowMax = CONFIG.COMBO_WINDOW;
  }
}

// Extend the streak by one bite, refresh its timer, and track the record.
function bumpCombo() {
  combo++;
  keepComboAlive();
  if (combo > bestCombo) {
    bestCombo = combo;
    try { localStorage.setItem('sqweee.bestCombo', bestCombo); } catch {}
    if (!beatBestThisRun && combo >= 3) {
      beatBestThisRun = true;
      showToast('New best combo! ' + combo);
      chime();
    }
  }
}
function resetCombo() { combo = 0; beatBestThisRun = false; comboWindowMax = CONFIG.COMBO_WINDOW; }

// Active pickup effects + juice
let magnetTimer = 0;          // seconds of magnet left
let shake = 0;                // current screen-shake magnitude (px), decays each frame

// Growth multiplier from the current streak (1 at combo 0/1, capped).
function comboMult() {
  return Math.min(CONFIG.COMBO_MULT_CAP, 1 + Math.max(0, combo - 1) * CONFIG.COMBO_GROWTH_STEP);
}
function addShake(amount) { shake = Math.min(CONFIG.SHAKE_MAX, shake + amount); }

// A world-space radius equal to `fraction` of the smaller viewport dimension at
// the current zoom, so effect coverage stays consistent across screen sizes.
function viewRadius(fraction) { return (Math.min(W, H) * fraction) / zoom; }

// --- HUD elements ------------------------------------------------------------
const countEl = document.getElementById('count');
const barEl = document.getElementById('bar');
const levelEl = document.getElementById('level');
const bestEl = document.getElementById('best');
const toastEl = document.getElementById('toast');

let toastTimer = 0;
function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  toastTimer = 2.2;
}

function updateHud() {
  const startR = CONFIG.BLOB_START_RADIUS;
  const grown = blob.targetRadius - startR;
  const level = Math.floor(grown / CONFIG.LEVEL_RADIUS_STEP) + 1;
  const frac = (grown % CONFIG.LEVEL_RADIUS_STEP) / CONFIG.LEVEL_RADIUS_STEP;

  countEl.innerHTML = totalAbsorbed + '<small>absorbed</small>';
  barEl.style.width = (frac * 100).toFixed(1) + '%';
  levelEl.textContent = 'Size Lv ' + level;
  bestEl.textContent = 'Best combo ' + bestCombo;

  const skin = SKINS[skinIndex];
  barEl.style.background = 'linear-gradient(90deg,' + skin.edge + ',' + skin.core + ')';

  // Unlock skins by total absorbed (paced, independent of the size cap).
  let wanted = 0;
  for (let i = 1; i < SKINS.length; i++) {
    const need = CONFIG.SKIN_UNLOCK_AT[i] ?? Infinity;
    if (totalAbsorbed >= need) wanted = i;
  }
  if (wanted > skinIndex) {
    skinIndex = wanted;
    showToast('New colour unlocked! ' + SKINS[skinIndex].name);
    chime();
  }
}

// --- Absorb + particles ------------------------------------------------------
// A crisp "chomp" burst: little sparks fanned OUTWARD from the mouth (dirX,dirY),
// fast and short-lived so it reads as a pop, not a slow drifting cloud.
function spawnSplash(worldX, worldY, color, radius, dirX, dirY, intensity = 1) {
  const count = Math.round((9 + Math.random() * 5) * intensity);
  const baseAng = Math.atan2(dirY, dirX);
  for (let i = 0; i < count; i++) {
    // Bias each spark into a ~150° fan pointing away from the blob.
    const ang = baseAng + (Math.random() - 0.5) * (Math.PI * 0.85);
    const spd = 220 + Math.random() * 260;
    particles.push({
      x: worldX, y: worldY,
      vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
      life: 0.16 + Math.random() * 0.16,
      maxLife: 0.32,
      size: Math.max(1.5, radius * (0.10 + Math.random() * 0.12)),
      color,
    });
  }
}

function handleAbsorb(dt, camX, camY) {
  let detonate = false;
  const magnetRange = magnetTimer > 0 ? viewRadius(CONFIG.MAGNET_VIEW_FRACTION) : 0;
  for (let i = world.objects.length - 1; i >= 0; i--) {
    const obj = world.objects[i];
    if (!obj.absorbable) continue;

    const dx = camX - obj.x, dy = camY - obj.y;
    const dist = Math.hypot(dx, dy) || 0.0001;
    const reach = blob.radius * (1 + CONFIG.ABSORB_REACH_MULT) + obj.r * 0.5;

    // Magnet pickup: reel in plain snacks within range (viewport-scaled), far
    // beyond normal reach. NOT other pickups — else the magnet vacuums in more
    // magnets and refreshes itself forever (and auto-detonates bombs).
    const magnetized = magnetTimer > 0 && !obj.kind && dist < magnetRange;
    if ((dist < reach || magnetized) && !obj.absorbing) {
      obj.absorbing = true; obj.eatR = obj.r;
      obj.viaMagnet = !(dist < reach);   // reeled in by the magnet, not a normal touch
    }

    if (obj.absorbing) {
      // Suck toward the blob, accelerating as it nears. The magnet adds a steady
      // size-scaled inward floor so far snacks stream IN (never repelled) at any scale.
      const ux = dx / dist, uy = dy / dist;
      let pull = CONFIG.ABSORB_PULL * (1 - dist / (reach + 1)) + 200;
      if (magnetTimer > 0) pull = Math.max(pull, blob.radius * CONFIG.MAGNET_PULL_MULT);
      obj.x += ux * pull * dt;
      obj.y += uy * pull * dt;
      // Only shrink once it's near the mouth, so magnetized snacks don't dwindle
      // away mid-flight while streaming in from range.
      if (dist < blob.radius * 1.5) obj.r *= Math.max(0, 1 - 5 * dt);

      if (dist < blob.radius * 0.55 || obj.r < 2) {
        // Chomp! Manual bites build the streak and grow scaled by the combo
        // multiplier (and a lot more for golden). Magnet-vacuumed snacks instead
        // grow at base rate and only keep the streak alive — the magnet is a
        // collection convenience, not a growth engine.
        if (obj.viaMagnet) keepComboAlive();
        else bumpCombo();
        const mult = comboMult();
        const growthMult = obj.viaMagnet
          ? 1
          : mult * (obj.kind === 'golden' ? CONFIG.GOLDEN_GROWTH_MULT : 1);
        blob.addAbsorbed(obj.eatR, growthMult);
        totalAbsorbed++;

        // Activate pickup effects. The bomb detonates AFTER this loop so it can
        // safely consume other objects without disturbing our iteration.
        if (obj.kind === 'magnet') magnetTimer = CONFIG.MAGNET_DURATION;
        else if (obj.kind === 'boom') detonate = true;

        // Gulp inward on the mouth side (springs back); spray sparks from the RIM
        // outward — brighter/bigger as the combo climbs or on a pickup.
        const outX = -ux, outY = -uy;
        blob.poke(outX, outY, -(obj.eatR * 3 + 24));
        const rimX = camX + outX * blob.radius;
        const rimY = camY + outY * blob.radius;
        const intensity = obj.kind ? 3 : 1 + Math.min(2, (mult - 1));
        spawnSplash(rimX, rimY, obj.color, obj.eatR, outX, outY, intensity);

        // Juice: pitch rises with the streak; shake grows with it and pickups.
        const smallness = 1 - Math.min(1, obj.eatR / blob.radius);
        const comboPitch = Math.min(1.6, 0.4 + (1 - smallness) * 0.6 + (mult - 1) * 0.25);
        if (obj.kind) { chime(); addShake(10); }
        else { blip(0.2 + smallness * 0.8, comboPitch); addShake(1.5 + (mult - 1) * 2); }

        world.consume(obj);
      }
    }
  }
  if (detonate) explode(camX, camY);
}

// Bomb pickup: pop every absorbable snack within EXPLOSION_RADIUS at once,
// each feeding growth and the combo — a big satisfying chain clear.
function explode(cx, cy) {
  addShake(22);
  blip(0.32, 0.26);   // low boom

  // Expanding shockwave ring of sparks — speed & size scale with you so the
  // blast reads at the same visual size whatever your zoom.
  for (let i = 0; i < 28; i++) {
    const ang = (i / 28) * Math.PI * 2 + Math.random() * 0.15;
    const spd = blob.radius * (9 + Math.random() * 6);
    particles.push({
      x: cx, y: cy,
      vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
      life: 0.22 + Math.random() * 0.2, maxLife: 0.42,
      size: Math.max(3, blob.radius * (0.08 + Math.random() * 0.09)), color: PICKUPS.boom.color,
    });
  }

  // Blast radius is a fraction of the viewport, so it clears the same visible
  // chunk whatever your size or screen (not the whole width on a phone).
  const radius = viewRadius(CONFIG.EXPLOSION_VIEW_FRACTION);

  // Snapshot victims first so consuming them doesn't disturb iteration.
  const victims = [];
  for (const obj of world.objects) {
    if (obj.absorbable && Math.hypot(obj.x - cx, obj.y - cy) < radius) victims.push(obj);
  }
  for (const obj of victims) {
    bumpCombo();
    blob.addAbsorbed(obj.r, comboMult());
    totalAbsorbed++;
    const dx = obj.x - cx, dy = obj.y - cy, d = Math.hypot(dx, dy) || 1;
    spawnSplash(obj.x, obj.y, obj.color, obj.r, dx / d, dy / d, 1);
    world.consume(obj);
  }

  // The blast empties the field around you — grant extra combo time so the streak
  // survives the aftermath and you can chain into the next cluster. The meter
  // shows this longer window (green + slower drain), not an overgrown bar.
  comboTimer = Math.max(comboTimer, CONFIG.EXPLOSION_COMBO_GRACE);
  comboWindowMax = Math.max(comboWindowMax, CONFIG.EXPLOSION_COMBO_GRACE);
}

// Explicit super-elastic shove: ramming a too-big obstacle launches you back
// harder than you hit. One burst per fresh contact (debounced) so it feels like
// a trampoline, not a force field.
function handleKnockback(camX, camY, vx, vy) {
  const speed = Math.hypot(vx, vy);
  for (const obj of world.objects) {
    if (!obj.body) continue; // only solid obstacles have a physics body
    const dx = camX - obj.x, dy = camY - obj.y;
    const dist = Math.hypot(dx, dy) || 0.0001;
    const gap = dist - (blob.radius + obj.r);
    const ax = dx / dist, ay = dy / dist;                // direction away from obstacle

    if (gap < CONFIG.NUDGE_GAP) {
      // Big juicy launch ONLY on a fresh, fast ram (debounced so it's one shot).
      if (speed > CONFIG.KNOCKBACK_MIN_SPEED && !obj.contacting) {
        obj.contacting = true;
        const launch = Math.min(speed * CONFIG.KNOCKBACK, CONFIG.SPEED_CAP);
        blobBody.velocity.x = ax * launch;
        blobBody.velocity.y = ay * launch;
        knockStun = CONFIG.KNOCKBACK_STUN;
        blob.poke(ax, ay, blob.radius * 5 + 90);          // stretch out the launch side
        blob.morphBounce(speed / CONFIG.KNOCKBACK_MIN_SPEED);  // deform into a random shape

        if (boostGrace > 0) {
          // GREEDY BOOST: you rammed a too-big obstacle mid-boost. Pay for it —
          // shrink a bit (never below start) and lose your streak.
          blob.targetRadius = Math.max(CONFIG.BLOB_START_RADIUS, blob.targetRadius * CONFIG.BOOST_CRASH_SHRINK);
          resetCombo(); comboTimer = 0;
          boostGrace = 0;                                 // one penalty per boost
          addShake(16);
          blip(0.16, 0.35);                               // harsher "crunch"
        } else {
          blip(0.05, 1);                                  // low "thud"
        }
      } else if (knockStun <= 0) {
        // Anti-stuck: while touching, guarantee a gentle OUTWARD drift. Summed over
        // several obstacles this ejects you from any concave pocket — no stun, so
        // you keep full steering control and can never get wedged.
        const outward = blobBody.velocity.x * ax + blobBody.velocity.y * ay;
        if (outward < CONFIG.KNOCKBACK_NUDGE) {
          const add = CONFIG.KNOCKBACK_NUDGE - outward;
          blobBody.velocity.x += ax * add;
          blobBody.velocity.y += ay * add;
        }
      }
    } else if (gap > 10) {
      obj.contacting = false;                             // re-arm once clearly separated
    }
  }
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.vx *= 0.9; p.vy *= 0.9;
    p.life -= dt;
    if (p.life <= 0) particles.splice(i, 1);
  }
}

// --- Rendering ---------------------------------------------------------------
function drawBackground() {
  // Calm backdrop whose hue drifts a touch as you grow.
  const hue = (200 + skinIndex * 18) % 360;
  const g = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.75);
  g.addColorStop(0, `hsl(${hue}, 38%, 18%)`);
  g.addColorStop(1, `hsl(${hue}, 42%, 9%)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

function drawGrid(camX, camY, zoom) {
  // Faint world grid for a legible sense of motion/parallax.
  const step = CONFIG.CELL_SIZE / 2;
  const cx = W / 2, cy = H / 2;
  const halfW = cx / zoom, halfH = cy / zoom;   // more world is visible when zoomed out
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  const startX = Math.floor((camX - halfW) / step) * step;
  const startY = Math.floor((camY - halfH) / step) * step;
  for (let wx = startX; wx < camX + halfW + step; wx += step) {
    for (let wy = startY; wy < camY + halfH + step; wy += step) {
      const sx = cx + (wx - camX) * zoom, sy = cy + (wy - camY) * zoom;
      ctx.beginPath();
      ctx.arc(sx, sy, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawObjects(camX, camY, time, zoom) {
  const cx = W / 2, cy = H / 2;
  for (const obj of world.objects) {
    const sx = cx + (obj.x - camX) * zoom;
    const sy = cy + (obj.y - camY) * zoom;
    const wob = 1 + Math.sin(time * 3 + obj.wobblePhase) * 0.04;
    const r = obj.r * wob * zoom;
    if (sx < -r || sx > W + r || sy < -r || sy > H + r) continue; // cull off-screen

    // Pickups pulse with a glow so they read as special from across the field.
    if (obj.kind) {
      const pulse = 0.6 + 0.4 * Math.sin(time * 6 + obj.wobblePhase);
      ctx.save();
      ctx.globalAlpha = 0.5 * pulse;
      ctx.fillStyle = obj.color;
      ctx.beginPath();
      ctx.arc(sx, sy, r * 1.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    const g = ctx.createRadialGradient(sx - r * 0.3, sy - r * 0.35, r * 0.1, sx, sy, r);
    g.addColorStop(0, obj.color);
    g.addColorStop(1, shade(obj.color, -0.25));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fill();

    // Obstacles (too big to eat) get a subtle ring so they read as "not yet".
    if (!obj.absorbable) {
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(255,255,255,0.22)';
      ctx.stroke();
    }

    // Pickup glyph on top so its type is legible.
    if (obj.kind) {
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.font = `${Math.max(8, r * 1.1)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(PICKUPS[obj.kind].glyph, sx, sy + r * 0.05);
    }
  }
}

function drawParticles(camX, camY, zoom) {
  const cx = W / 2, cy = H / 2;
  for (const p of particles) {
    const sx = cx + (p.x - camX) * zoom, sy = cy + (p.y - camY) * zoom;
    ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(sx, sy, p.size * zoom, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// Growing arc around the blob while a slingshot boost is charging.
function drawChargeRing(zoom) {
  const c = getBoostCharge();
  if (c <= 0.02) return;
  const cx = W / 2, cy = H / 2;
  const ringR = blob.radius * zoom + 14 + c * 10;
  ctx.save();
  ctx.strokeStyle = `rgba(255,255,255,${0.35 + c * 0.5})`;
  ctx.lineWidth = 3 + c * 4;
  ctx.beginPath();
  ctx.arc(cx, cy, ringR, -Math.PI / 2, -Math.PI / 2 + c * Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

// Touch devices (phones/tablets) get the extra bottom-left copy in landscape;
// desktop — also "landscape" but with a fine pointer — keeps only the top-right.
const isTouchDevice = typeof window.matchMedia === 'function'
  && window.matchMedia('(pointer: coarse)').matches;

// Streak multiplier + a draining bar. Desktop keeps the original top-CENTRE
// meter. Touch devices move it out of the centre sightline: top-right (always)
// plus a second copy bottom-left in landscape. Hidden when there's no streak.
function drawComboMeter() {
  if (combo < 2) return;
  if (!isTouchDevice) {
    drawComboBlock(W / 2, 74, 'center');            // desktop: original top-centre
    return;
  }
  drawComboBlock(W - 16, 40, 'right');              // touch: top-right
  if (W > H) drawComboBlock(16, H - 92, 'left');    // + bottom-left in landscape
}

// Draw one combo meter anchored at (anchorX, y) with the given horizontal align.
function drawComboBlock(anchorX, y, align) {
  const mult = comboMult();
  const frac = Math.max(0, Math.min(1, comboTimer / comboWindowMax));  // never overflows
  const inGrace = comboWindowMax > CONFIG.COMBO_WINDOW + 1e-3;         // bomb bonus window
  const accent = inGrace ? '#7ef0c8' : '#ffe27a';    // green while the bomb grace lasts
  const pop = 1 + (mult - 1) * 0.06;                 // meter swells with the multiplier

  ctx.save();
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = accent;
  ctx.font = `700 ${Math.round(30 * pop)}px system-ui, sans-serif`;
  ctx.fillText(`x${mult.toFixed(1)}`, anchorX, y);
  ctx.font = '600 13px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.fillText(`${combo} COMBO`, anchorX, y + 18);

  // Draining timer bar. Full-width track + clamped fill, so it never grows past
  // normal. Right-aligned drains from the right; left/centre drain from the left.
  const barW = 120, barH = 5;
  const barLeft = align === 'right' ? anchorX - barW
                : align === 'center' ? anchorX - barW / 2
                : anchorX;
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.fillRect(barLeft, y + 26, barW, barH);
  ctx.fillStyle = accent;
  const fillX = align === 'right' ? anchorX - barW * frac : barLeft;
  ctx.fillRect(fillX, y + 26, barW * frac, barH);

  // Best-combo marker: ★ once you've matched/beaten your record, else "BEST n".
  ctx.font = '700 12px system-ui, sans-serif';
  if (beatBestThisRun) {
    ctx.fillStyle = accent;
    ctx.fillText(`★ BEST ${bestCombo} ★`, anchorX, y + 44);
  } else {
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillText(`BEST ${bestCombo}`, anchorX, y + 44);
  }
  ctx.restore();
}

// Small badges for active pickup effects with their own countdown bars.
function drawEffects() {
  const active = [];
  if (magnetTimer > 0) active.push({ p: PICKUPS.magnet, t: magnetTimer, max: CONFIG.MAGNET_DURATION });
  if (!active.length) return;
  // Bottom-left normally; bottom-RIGHT only when the combo meter's extra copy
  // occupies the bottom-left (touch landscape), so they never overlap.
  const rightSide = isTouchDevice && W > H;
  const barW = 70, barH = 5;
  const glyphX = rightSide ? W - 24 : 18;
  const barX = rightSide ? W - 24 - 18 - barW : 44;   // bar left edge
  ctx.save();
  ctx.textAlign = rightSide ? 'right' : 'left';
  let y = H - 40;
  for (const eff of active) {
    ctx.fillStyle = eff.p.color;
    ctx.font = '20px sans-serif';
    ctx.fillText(eff.p.glyph, glyphX, y);
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(barX, y - 8, barW, barH);
    ctx.fillStyle = eff.p.color;
    ctx.fillRect(barX, y - 8, barW * (eff.t / eff.max), barH);
    y -= 26;
  }
  ctx.restore();
}

function drawJoystick() {
  const stick = getJoystick();
  if (!stick) return;
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(stick.baseX, stick.baseY, CONFIG.DRAG_MAX_DISTANCE, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.beginPath(); ctx.arc(stick.knobX, stick.knobY, 26, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// Darken/lighten a hex colour by amt (-1..1).
function shade(hex, amt) {
  const num = parseInt(hex.slice(1), 16);
  let r = (num >> 16) & 255, g = (num >> 8) & 255, b = num & 255;
  r = Math.max(0, Math.min(255, r + r * amt));
  g = Math.max(0, Math.min(255, g + g * amt));
  b = Math.max(0, Math.min(255, b + b * amt));
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

// --- Main loop ---------------------------------------------------------------
let lastTime = 0;
let accumulator = 0;
const FIXED = 1 / 60;

function frame(now) {
  requestAnimationFrame(frame);
  if (!running) return;

  const t = now / 1000;
  let dt = lastTime ? t - lastTime : FIXED;
  lastTime = t;
  dt = Math.min(dt, 0.05); // clamp big hitches

  if (knockStun > 0) knockStun -= dt;
  if (boostGrace > 0) boostGrace -= dt;
  if (boostCooldown > 0) boostCooldown -= dt;
  if (magnetTimer > 0) magnetTimer -= dt;
  if (comboTimer > 0) { comboTimer -= dt; if (comboTimer <= 0) resetCombo(); }
  if (shake > 0) shake = Math.max(0, shake * (1 - Math.min(1, CONFIG.SHAKE_DECAY * dt)));

  // --- Steering: push the Nape body toward desired velocity via impulses,
  //     so real collisions still block/squish us against obstacles. ---
  //     Suppressed briefly after a bump (knockStun) so the launch actually lands.
  const steer = getSteer();
  const steerMag = Math.hypot(steer.x, steer.y);
  if (steerMag > 0.02 && knockStun <= 0) {
    // Only steer while there's input; on release we coast on world drag alone.
    // Top speed no longer drops with size — big-you cruises just as fast. The
    // heavier/slidier feel stays via sizeGain (below), which softens acceleration
    // without lowering the speed you eventually reach.
    const sizeGain = Math.pow(CONFIG.BLOB_START_RADIUS / blob.radius, CONFIG.HEAVY_FACTOR);
    // Counter the camera zoom-out so on-screen speed stays constant as you grow:
    // the more the view is zoomed out, the more world speed is scaled up to match.
    const zoomComp = 1 / Math.pow(zoom, CONFIG.SPEED_ZOOM_COMP);
    // While boosting, float the target speed up to your current speed so steering
    // still turns you but doesn't brake the surge back down to cruise speed.
    let desSpeed = CONFIG.MAX_SPEED * zoomComp;
    if (boostGrace > 0) {
      desSpeed = Math.max(desSpeed, Math.hypot(blobBody.velocity.x, blobBody.velocity.y));
    }
    const desVx = steer.x * desSpeed;
    const desVy = steer.y * desSpeed;
    const mass = blobBody.mass;
    const impX = (desVx - blobBody.velocity.x) * mass * CONFIG.STEER_GAIN * sizeGain;
    const impY = (desVy - blobBody.velocity.y) * mass * CONFIG.STEER_GAIN * sizeGain;
    blobBody.applyImpulse(new Vec2(impX, impY));
  }

  // --- Slingshot boost: a surge along your CURRENT velocity (where you're
  //     actually travelling), so a boost mid-knockback follows the push, not
  //     your facing. When fully stopped, fall back to your steer direction.
  //     Strength scales with how long Space/second-finger was held (charge). ---
  const charge = consumeBoost();   // -1 if none, else 0..1
  if (charge >= 0 && boostCooldown <= 0) {
    const bvx = blobBody.velocity.x, bvy = blobBody.velocity.y;
    const bspeed = Math.hypot(bvx, bvy);
    let dirX = 0, dirY = 0;
    if (bspeed > CONFIG.BOOST_MIN_SPEED) {
      dirX = bvx / bspeed; dirY = bvy / bspeed;
    } else {
      const s = getSteer();
      const sm = Math.hypot(s.x, s.y);
      if (sm > 0.02) { dirX = s.x / sm; dirY = s.y / sm; }
    }
    if (dirX || dirY) {
      const boostComp = 1 / Math.pow(zoom, CONFIG.SPEED_ZOOM_COMP);   // match cruise scaling
      const surge = (CONFIG.BOOST_SPEED + (CONFIG.BOOST_SPEED_MAX - CONFIG.BOOST_SPEED) * charge) * boostComp;
      blobBody.velocity.x += dirX * surge;
      blobBody.velocity.y += dirY * surge;
      boostCooldown = CONFIG.BOOST_COOLDOWN;
      boostGrace = CONFIG.BOOST_GRACE;
      blob.jump(1 + charge);                                  // bigger hop on a bigger charge
      blob.poke(dirX, dirY, blob.radius * (4 + charge * 4) + 90);
      addShake(4 + charge * 8);
      blip(0.10 + charge * 0.08, 0.9);                        // pitch rises with charge
    }
  }

  // --- Fixed-step physics ---
  accumulator += dt;
  let steps = 0;
  while (accumulator >= FIXED && steps < 5) {
    space.step(FIXED);
    accumulator -= FIXED;
    steps++;
  }

  // --- Read motion back out ---
  const vx = blobBody.velocity.x, vy = blobBody.velocity.y;
  let ax = (vx - prevVx) / dt, ay = (vy - prevVy) / dt;
  const aMag = Math.hypot(ax, ay);
  if (aMag > 15000) { ax = ax / aMag * 15000; ay = ay / aMag * 15000; } // clamp collision spikes (punchy on bumps)
  prevVx = vx; prevVy = vy;

  const camX = blobBody.position.x;
  const camY = blobBody.position.y;

  // --- Grow the physics shape to match the visual radius (in steps) ---
  if (Math.abs(blob.radius - physRadius) > 1.2) {
    const ratio = blob.radius / physRadius;
    blobBody.scaleShapes(ratio, ratio);
    physRadius = blob.radius;
  }

  // --- Camera zoom: scale the view down as the blob grows so it never fills
  //     the screen. Reference/cap are fractions of the SMALLER screen dimension,
  //     so the blob takes the same share of a phone screen as a desktop one.
  //     Only affects rendering; physics/absorb stay in world units. ---
  const minDim = Math.min(W, H);
  const refR = minDim * CONFIG.ZOOM_REF_FRACTION;
  let zoomTarget = Math.min(1, Math.pow(refR / blob.radius, CONFIG.ZOOM_STRENGTH));
  // Hard cap: the blob's on-screen radius can't exceed this fraction of the small
  // dimension, so a big blob can never swallow the whole (small) viewport.
  const maxBlobR = minDim * CONFIG.ZOOM_MAX_BLOB_FRACTION;
  zoomTarget = Math.min(zoomTarget, maxBlobR / blob.radius);
  zoom += (zoomTarget - zoom) * Math.min(1, CONFIG.ZOOM_EASE * dt);

  // How many cells to keep alive so the zoomed-out view stays filled to the edges.
  const viewCells = Math.ceil((Math.max(W, H) / 2 / zoom) / CONFIG.CELL_SIZE) + 1;
  const cellRadius = Math.max(CONFIG.SPAWN_RADIUS_CELLS, viewCells);

  // --- Systems update ---
  world.update(camX, camY, blob.radius, cellRadius);
  handleKnockback(camX, camY, vx, vy);
  // Hard speed ceiling: bouncing among several obstacles (or stacked nudges)
  // can't compound into runaway velocity. Scaled by the same zoom compensation
  // so it doesn't clip the (now higher) cruise/boost speeds when zoomed out.
  const speedCap = CONFIG.SPEED_CAP / Math.pow(zoom, CONFIG.SPEED_ZOOM_COMP);
  const bs = Math.hypot(blobBody.velocity.x, blobBody.velocity.y);
  if (bs > speedCap) {
    const k = speedCap / bs;
    blobBody.velocity.x *= k;
    blobBody.velocity.y *= k;
  }
  handleAbsorb(dt, camX, camY);
  updateParticles(dt);
  blob.update(dt, vx, vy, ax, ay);
  updateHud();

  if (toastTimer > 0) { toastTimer -= dt; if (toastTimer <= 0) toastEl.classList.remove('show'); }

  // --- Draw ---
  drawBackground();
  ctx.save();
  if (shake > 0) {
    ctx.translate((Math.random() * 2 - 1) * shake, (Math.random() * 2 - 1) * shake);
  }
  drawGrid(camX, camY, zoom);
  drawObjects(camX, camY, t, zoom);
  drawParticles(camX, camY, zoom);
  blob.draw(ctx, W / 2, H / 2, SKINS[skinIndex], vx, vy, zoom);
  ctx.restore();

  drawChargeRing(zoom);        // slingshot charge-up around the blob
  drawComboMeter();            // streak multiplier + draining timer
  drawEffects();               // active magnet / slow-mo badges
  drawJoystick();
}

// --- Boot --------------------------------------------------------------------
initInput(canvas);
requestAnimationFrame(frame);

// Show the standing record on the start screen.
const bestStartEl = document.getElementById('bestStart');
if (bestStartEl) bestStartEl.textContent = bestCombo > 0 ? '🔥 Best combo: ' + bestCombo : '';

document.getElementById('playBtn').addEventListener('click', () => {
  unlock();
  document.getElementById('start').classList.add('hidden');
  document.getElementById('hud').classList.remove('hidden');
  running = true;
  lastTime = 0;
});
