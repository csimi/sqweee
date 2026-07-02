// ============================================================================
//  BLOB — the star. A ring of spring-coupled points gives real soft-body
//  squish & jiggle; it's driven by the Nape body's motion (accel = wobble,
//  collisions = squash) and rendered as a smooth metaball-ish outline with
//  googly eyes that look where you're going.
// ============================================================================

import { CONFIG } from './config.js';

// Radial shape functions: given an angle (and a rotation phase), return the
// target radius as a multiple of the blob radius. The ring springs toward these
// on a bounce so the blob briefly deforms into the shape, then wobbles back.
// A regular n-gon: distance to the edge as a function of angle (1 at a vertex).
function polygon(theta, phase, n) {
  const seg = (Math.PI * 2) / n;
  const a = (((theta - phase) % seg) + seg) % seg - seg / 2;
  return Math.cos(Math.PI / n) / Math.cos(a);
}
// An n-pointed star: triangle-wave between an inner valley and the outer tip.
function starShape(theta, phase, spikes, inner) {
  const tri = Math.abs(((((theta - phase) * spikes) / Math.PI) % 2 + 2) % 2 - 1);
  return inner + (1 - inner) * tri;
}
const SHAPES = [
  (t, p) => polygon(t, p, 3),        // triangle
  (t, p) => polygon(t, p, 4),        // square
  (t, p) => polygon(t, p, 5),        // pentagon
  (t, p) => polygon(t, p, 6),        // hexagon
  (t, p) => starShape(t, p, 5, 0.5), // 5-point star
];

export class Blob {
  constructor() {
    this.radius = CONFIG.BLOB_START_RADIUS;       // eased, visible radius
    this.targetRadius = CONFIG.BLOB_START_RADIUS;  // where size is heading

    // Ring points, stored as offsets from the (always-centered) blob origin.
    this.n = CONFIG.BLOB_POINTS;
    this.points = [];
    for (let i = 0; i < this.n; i++) {
      const ang = (i / this.n) * Math.PI * 2;
      this.points.push({ ang, ox: Math.cos(ang) * this.radius, oy: Math.sin(ang) * this.radius, vx: 0, vy: 0 });
    }

    this.time = 0;
    this.lookX = 1; this.lookY = 0;   // smoothed facing direction (for eyes)
    this.blinkTimer = CONFIG.BLINK_EVERY;
    this.blink = 0;                    // 0 open .. 1 shut

    this.jumpT = 0;                    // seconds left in the boost "hop"
    this.jumpMag = 1;                 // hop amplitude scale (bigger charge = bigger hop)
    this.jumpScale = 1;               // visual-only size multiplier (physics unchanged)

    this.morphT = 0;                   // seconds left in the bounce shape-morph
    this.morphDur = 1;                // total duration of the current morph
    this.morphStrength = 0;           // how strongly to snap to the shape (0..1)
    this.morphPhase = 0;              // random rotation of the shape
    this.shapeFn = SHAPES[0];         // currently selected shape function
  }

  // Kick off the boost hop: a quick crouch (shrink) then pop (overshoot) so a
  // boost reads like a little jump. Purely cosmetic — doesn't touch this.radius.
  jump(mag = 1) { this.jumpT = CONFIG.BOOST_JUMP_DURATION; this.jumpMag = mag; }

  // Bounce! Briefly deform into a random shape (star/square/triangle/…) that
  // springs back to round. `strength` scales with impact hardness.
  morphBounce(strength = 1) {
    this.shapeFn = SHAPES[(Math.random() * SHAPES.length) | 0];
    this.morphPhase = Math.random() * Math.PI * 2;
    this.morphDur = CONFIG.BOUNCE_MORPH_DURATION;
    this.morphT = this.morphDur;
    this.morphStrength = CONFIG.BOUNCE_MORPH_STRENGTH * Math.min(1, strength);
  }

  // Grow by absorbing area: the blob's own area gains a *fraction* of the eaten
  // object's area, then radius = sqrt(area/π). This keeps each bite a small,
  // consistent bump early and naturally tapers as you get big (no runaway).
  addAbsorbed(objRadius, growthMult = 1) {
    const objArea = Math.PI * objRadius * objRadius;
    const blobArea = Math.PI * this.targetRadius * this.targetRadius;
    // Area-based growth is naturally exponential (snacks scale with you + you eat
    // more per second as you grow), so late levels rush by. Taper growth-per-bite
    // with size to flatten the curve into steady pacing. 1.0 at start (early game
    // unchanged); shrinks as you grow.
    const paceComp = Math.min(1, Math.pow(CONFIG.BLOB_START_RADIUS / this.targetRadius, CONFIG.GROWTH_SIZE_TAPER));
    const newArea = blobArea + objArea * CONFIG.GROWTH_RATE * growthMult * paceComp;
    this.targetRadius = Math.min(CONFIG.MAX_RADIUS, Math.sqrt(newArea / Math.PI));
  }

  // Push the ring outward where something was just swallowed — a "digest" bulge.
  poke(dirX, dirY, strength) {
    for (const p of this.points) {
      const dot = (Math.cos(p.ang) * dirX + Math.sin(p.ang) * dirY);
      if (dot > 0.35) {
        const push = dot * strength;
        p.vx += Math.cos(p.ang) * push;
        p.vy += Math.sin(p.ang) * push;
      }
    }
  }

  // velX/velY: blob world velocity. accX/accY: blob world acceleration.
  update(dt, velX, velY, accX, accY) {
    const C = CONFIG;
    this.time += dt;

    // Ease visible size toward target.
    this.radius += (this.targetRadius - this.radius) * Math.min(1, C.GROWTH_EASE * dt);

    // Boost hop: sin over one full period → shrink first, then pop, back to 1.
    if (this.jumpT > 0) {
      this.jumpT = Math.max(0, this.jumpT - dt);
      const u = 1 - this.jumpT / C.BOOST_JUMP_DURATION;   // 0..1 over the hop
      this.jumpScale = 1 - C.BOOST_JUMP_SCALE * this.jumpMag * Math.sin(u * Math.PI * 2);
    } else {
      this.jumpScale = 1;
    }

    // Smooth facing direction from velocity (eyes look where you head).
    const speed = Math.hypot(velX, velY);
    if (speed > 20) {
      const nx = velX / speed, ny = velY / speed;
      this.lookX += (nx - this.lookX) * Math.min(1, 8 * dt);
      this.lookY += (ny - this.lookY) * Math.min(1, 8 * dt);
    }

    // Bounce shape-morph: the blend weight decays 1→0 so the ring's rest target
    // eases from the shape back to a circle (springs give the wobble on the way).
    let morphAmt = 0;
    if (this.morphT > 0) {
      this.morphT = Math.max(0, this.morphT - dt);
      morphAmt = this.morphStrength * (this.morphT / this.morphDur);
    }

    // --- Spring the ring toward its rest circle, with idle breathing ---
    const idle = C.IDLE_WOBBLE_AMP * Math.sin(this.time * C.IDLE_WOBBLE_SPEED);
    for (let i = 0; i < this.n; i++) {
      const p = this.points[i];
      // Blend the rest radius between the circle (1) and the current shape.
      const shapeMul = morphAmt > 0
        ? (1 - morphAmt) + morphAmt * this.shapeFn(p.ang, this.morphPhase)
        : 1;
      const rest = this.radius * shapeMul * (1 + idle * Math.sin(p.ang * 3 + this.time));
      const tx = Math.cos(p.ang) * rest;
      const ty = Math.sin(p.ang) * rest;

      // Radial spring back to rest position.
      p.vx += (tx - p.ox) * C.WOBBLE_STIFFNESS * dt;
      p.vy += (ty - p.oy) * C.WOBBLE_STIFFNESS * dt;

      // Inertia: when the blob accelerates, points lag behind -> directional jiggle.
      p.vx -= accX * C.INERTIA_WOBBLE * dt;
      p.vy -= accY * C.INERTIA_WOBBLE * dt;
    }

    // Neighbour smoothing keeps the outline coherent (no spikes).
    for (let i = 0; i < this.n; i++) {
      const p = this.points[i];
      const a = this.points[(i - 1 + this.n) % this.n];
      const b = this.points[(i + 1) % this.n];
      const mx = (a.ox + b.ox) * 0.5, my = (a.oy + b.oy) * 0.5;
      p.vx += (mx - p.ox) * C.WOBBLE_NEIGHBOR;
      p.vy += (my - p.oy) * C.WOBBLE_NEIGHBOR;
    }

    // Integrate + damp.
    for (const p of this.points) {
      p.vx *= C.WOBBLE_DAMPING;
      p.vy *= C.WOBBLE_DAMPING;
      p.ox += p.vx * dt;
      p.oy += p.vy * dt;
    }

    // Blink logic.
    this.blinkTimer -= dt;
    if (this.blinkTimer <= 0) { this.blinkTimer = C.BLINK_EVERY * (0.6 + Math.random() * 0.8); this.blink = 1; }
    this.blink = Math.max(0, this.blink - dt * 8);
  }

  // Returns the screen-space outline points with squash-&-stretch applied.
  // `scale` is the camera zoom (world px -> screen px).
  outline(cx, cy, velX, velY, scale) {
    const speed = Math.hypot(velX, velY);
    const squash = Math.min(1, speed / CONFIG.MAX_SPEED) * CONFIG.SQUASH_FACTOR;
    let dx = 1, dy = 0;
    if (speed > 1) { dx = velX / speed; dy = velY / speed; }

    const out = [];
    for (const p of this.points) {
      // Decompose offset along travel dir and perpendicular, then stretch.
      const along = p.ox * dx + p.oy * dy;
      const perp = -p.ox * dy + p.oy * dx;
      const a2 = along * (1 + squash);
      const p2 = perp * (1 - squash * 0.6);
      const ox = a2 * dx - p2 * dy;
      const oy = a2 * dy + p2 * dx;
      out.push({ x: cx + ox * scale, y: cy + oy * scale });
    }
    return out;
  }

  draw(ctx, cx, cy, skin, velX, velY, scale = 1) {
    const vis = scale * this.jumpScale;   // fold the cosmetic hop into the zoom
    const pts = this.outline(cx, cy, velX, velY, vis);
    const R = this.radius * vis;     // on-screen radius after zoom + hop

    // --- Soft drop shadow ---
    ctx.save();
    ctx.translate(0, R * 0.14);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    this.tracePath(ctx, pts);
    ctx.fill();
    ctx.restore();

    // --- Body fill (radial gradient for a gooey, lit look) ---
    const grad = ctx.createRadialGradient(
      cx - R * 0.3, cy - R * 0.4, R * 0.2,
      cx, cy, R * 1.15
    );
    grad.addColorStop(0, skin.core);
    grad.addColorStop(1, skin.edge);
    ctx.fillStyle = grad;
    this.tracePath(ctx, pts);
    ctx.fill();

    // Glossy rim highlight.
    ctx.lineWidth = Math.max(2, R * 0.06);
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    this.tracePath(ctx, pts);
    ctx.stroke();

    // Specular blob highlight, top-left.
    ctx.beginPath();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.ellipse(cx - R * 0.32, cy - R * 0.4, R * 0.26, R * 0.18, -0.5, 0, Math.PI * 2);
    ctx.fill();

    this.drawEyes(ctx, cx, cy, skin, vis);
  }

  drawEyes(ctx, cx, cy, skin, scale = 1) {
    const C = CONFIG;
    const R = this.radius * scale;
    // Perp axis for eye separation (relative to facing).
    const fx = this.lookX, fy = this.lookY;
    const px = -fy, py = fx;

    const eyeR = R * C.EYE_SIZE;
    const forward = R * C.EYE_FORWARD;
    const spread = R * C.EYE_SPACING;

    for (const side of [-1, 1]) {
      const ex = cx + fx * forward + px * spread * side;
      const ey = cy + fy * forward + py * spread * side;

      // White
      ctx.beginPath();
      ctx.fillStyle = '#ffffff';
      ctx.ellipse(ex, ey, eyeR, eyeR * (1 - this.blink * 0.9), 0, 0, Math.PI * 2);
      ctx.fill();

      // Pupil looks toward movement
      const pux = ex + fx * eyeR * C.PUPIL_LOOK;
      const puy = ey + fy * eyeR * C.PUPIL_LOOK;
      ctx.beginPath();
      ctx.fillStyle = skin.eye;
      ctx.arc(pux, puy, eyeR * 0.55 * (1 - this.blink), 0, Math.PI * 2);
      ctx.fill();

      // Sparkle
      ctx.beginPath();
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.arc(pux - eyeR * 0.18, puy - eyeR * 0.2, eyeR * 0.16 * (1 - this.blink), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Smooth closed Catmull-Rom path through the ring points.
  tracePath(ctx, pts) {
    const n = pts.length;
    ctx.beginPath();
    const mid0x = (pts[n - 1].x + pts[0].x) / 2;
    const mid0y = (pts[n - 1].y + pts[0].y) / 2;
    ctx.moveTo(mid0x, mid0y);
    for (let i = 0; i < n; i++) {
      const curr = pts[i];
      const next = pts[(i + 1) % n];
      const mx = (curr.x + next.x) / 2;
      const my = (curr.y + next.y) / 2;
      ctx.quadraticCurveTo(curr.x, curr.y, mx, my);
    }
    ctx.closePath();
  }
}
