// ============================================================================
//  INPUT — one-thumb floating joystick (touch/mouse) + WASD/arrows fallback.
//  Exposes a normalised steering vector via getSteer(): {x, y} in -1..1,
//  where length encodes desired speed (0..1).
// ============================================================================

import { CONFIG } from './config.js';

const keys = new Set();

// Charged (slingshot) boost: HOLD to charge, RELEASE to fire. On release we
// queue a boost carrying a charge fraction 0..1 (time held / BOOST_CHARGE_TIME).
// A quick tap ≈ 0. consumeBoost() drains the queued charge.
let boostQueued = false;
let boostCharge = 0;           // charge (0..1) of the queued/released boost
let chargingSince = 0;         // timestamp the current hold began (ms); 0 = not charging
let spaceHeld = false;
let boostPointerId = null;     // the second finger currently charging a boost

// How far the current hold has charged, 0..1. 0 when nothing is held.
function chargeNow() {
  if (!chargingSince) return 0;
  return Math.min(1, (performance.now() - chargingSince) / (CONFIG.BOOST_CHARGE_TIME * 1000));
}
function beginCharge() { if (!chargingSince) chargingSince = performance.now(); }
function releaseCharge() {
  if (!chargingSince) return;
  boostCharge = chargeNow();
  boostQueued = true;
  chargingSince = 0;
}

// Pointer (floating joystick) state
let dragging = false;
let originX = 0, originY = 0;   // where the finger first touched
let curX = 0, curY = 0;         // where it is now
let joyPointerId = null;        // the one pointer that drives the joystick

export function initInput(canvas) {
  // --- Pointer / touch ---
  // First finger down drives the floating joystick; a SECOND finger tapping
  // anywhere while steering fires a boost (mobile's equivalent of Space).
  canvas.addEventListener('pointerdown', (event) => {
    if (joyPointerId === null) {
      joyPointerId = event.pointerId;
      canvas.setPointerCapture(event.pointerId);
      dragging = true;
      originX = curX = event.clientX;
      originY = curY = event.clientY;
    } else if (event.pointerId !== joyPointerId && boostPointerId === null) {
      boostPointerId = event.pointerId;         // second finger holds to charge a boost
      beginCharge();
    }
  });
  canvas.addEventListener('pointermove', (event) => {
    if (event.pointerId !== joyPointerId) return;
    curX = event.clientX; curY = event.clientY;
  });
  const release = (event) => {
    if (event.pointerId === boostPointerId) {    // boost finger lifted → fire
      boostPointerId = null;
      releaseCharge();
      return;
    }
    if (event.pointerId !== joyPointerId) return;
    joyPointerId = null;
    dragging = false;
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);

  // --- Keyboard ---
  window.addEventListener('keydown', (event) => {
    if (event.code === 'Space') {
      event.preventDefault();                 // stop the page from scrolling
      if (!spaceHeld) { spaceHeld = true; beginCharge(); }  // start charging on press
      return;
    }
    keys.add(event.key.toLowerCase());
  });
  window.addEventListener('keyup', (event) => {
    if (event.code === 'Space') { spaceHeld = false; releaseCharge(); return; }  // fire on release
    keys.delete(event.key.toLowerCase());
  });
}

// Returns the charge (0..1) of a released boost at most once, else -1.
export function consumeBoost() {
  if (!boostQueued) return -1;
  boostQueued = false;
  const charge = boostCharge;
  boostCharge = 0;
  return charge;
}

// Live charge (0..1) of a boost being held right now — for the charge-ring HUD.
export function getBoostCharge() { return chargeNow(); }

// Returns desired steering as a vector; length 0..1 scales speed.
export function getSteer() {
  // Keyboard takes over if any movement key is held (nice for desktop testing).
  let kx = 0, ky = 0;
  if (keys.has('a') || keys.has('arrowleft')) kx -= 1;
  if (keys.has('d') || keys.has('arrowright')) kx += 1;
  if (keys.has('w') || keys.has('arrowup')) ky -= 1;
  if (keys.has('s') || keys.has('arrowdown')) ky += 1;
  if (kx || ky) {
    const len = Math.hypot(kx, ky);
    return { x: kx / len, y: ky / len };
  }

  if (dragging) {
    const dx = curX - originX;
    const dy = curY - originY;
    const dist = Math.hypot(dx, dy);
    if (dist < CONFIG.DRAG_DEADZONE) return { x: 0, y: 0 };
    const strength = Math.min(dist / CONFIG.DRAG_MAX_DISTANCE, 1);
    return { x: (dx / dist) * strength, y: (dy / dist) * strength };
  }

  return { x: 0, y: 0 };
}

// For drawing the joystick hint. Returns null when not dragging.
export function getJoystick() {
  if (!dragging) return null;
  const dx = curX - originX;
  const dy = curY - originY;
  const dist = Math.min(Math.hypot(dx, dy), CONFIG.DRAG_MAX_DISTANCE);
  const ang = Math.atan2(dy, dx);
  return {
    baseX: originX, baseY: originY,
    knobX: originX + Math.cos(ang) * dist,
    knobY: originY + Math.sin(ang) * dist,
  };
}
