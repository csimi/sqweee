// ============================================================================
//  WORLD — endless, camera-culled field of absorbable objects.
//  Only cells near the camera exist. Bigger-than-you objects get a real Nape
//  STATIC body so you physically bump/squish against them; once you outgrow
//  one, its body is removed and it becomes absorbable. Small objects are pure
//  data (no physics body) for performance.
// ============================================================================

import { CONFIG, OBJECT_COLORS, PICKUPS, PICKUP_KINDS, PICKUP_TOTAL_WEIGHT } from './config.js';

// Pick a pickup kind by its spawn weight (rarer effects have smaller weights).
function pickPickupKind(rng) {
  let roll = rng() * PICKUP_TOTAL_WEIGHT;
  for (const k of PICKUP_KINDS) {
    roll -= PICKUPS[k].weight || 1;
    if (roll < 0) return k;
  }
  return PICKUP_KINDS[PICKUP_KINDS.length - 1];
}

// Deterministic per-cell RNG so a cell regenerates the same way if revisited.
function mulberry32(seed) {
  return function next() {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class World {
  // `nape` is the bundle of classes { Body, BodyType, Circle, Vec2 }.
  // `obstacleMaterial` makes bigger-than-you objects bouncy so you're shoved back.
  constructor(space, nape, obstacleMaterial) {
    this.space = space;
    this.nape = nape;
    this.obstacleMaterial = obstacleMaterial;
    this.objects = [];            // flat list of live objects
    this.cells = new Map();       // cellKey -> array of objects in that cell
  }

  cellKey(cx, cy) { return cx + ',' + cy; }

  // Build the objects for one grid cell.
  spawnCell(cx, cy, blobRadius, blobX, blobY) {
    const { CELL_SIZE, OBJECTS_PER_CELL, OBJ_MIN_R, BIG_CHANCE,
            SNACK_MIN_MULT, SNACK_MAX_MULT, OBSTACLE_MIN_MULT, OBSTACLE_MAX_MULT,
            CLEAR_RADIUS_MULT, SNACK_DENSITY_FALLOFF } = CONFIG;
    const rng = mulberry32((cx * 73856093) ^ (cy * 19349663));
    const key = this.cellKey(cx, cy);
    const list = [];
    const obstacles = [];   // placed obstacles in this cell, to keep them apart
    const shrink = CONFIG.BLOB_START_RADIUS / blobRadius;   // ≤1, smaller as you grow
    const pos = () => ({ x: (cx + rng()) * CELL_SIZE, y: (cy + rng()) * CELL_SIZE });
    const snackR = () => Math.max(OBJ_MIN_R, blobRadius * (SNACK_MIN_MULT + rng() * (SNACK_MAX_MULT - SNACK_MIN_MULT)));
    const drawCount = (expected) => Math.floor(expected) + (rng() < expected - Math.floor(expected) ? 1 : 0);

    // Objects scale with you (area ∝ radius²). OBSTACLES thin out as 1/radius² so
    // the field's obstacle coverage stays constant (open, never wall-to-wall or
    // you'd get pinned). SNACKS have no body and can't pin you, so they thin out
    // more gently (SNACK_DENSITY_FALLOFF<2) — keeping plenty to munch as you grow.
    const nObstacles = drawCount(OBJECTS_PER_CELL * BIG_CHANCE * Math.min(1, shrink ** 2));
    const nSnacks = drawCount(OBJECTS_PER_CELL * (1 - BIG_CHANCE) * Math.min(1, shrink ** SNACK_DENSITY_FALLOFF));

    // Obstacles first (they may get demoted to snacks if they'd trap you).
    for (let i = 0; i < nObstacles; i++) {
      const { x, y } = pos();
      const r = blobRadius * (OBSTACLE_MIN_MULT + rng() * (OBSTACLE_MAX_MULT - OBSTACLE_MIN_MULT));
      // Never spawn an obstacle inside your personal bubble (you'd get boxed in),
      // nor touching another obstacle (a concave notch you can wedge into) — demote
      // those to a harmless snack.
      const dist = Math.hypot(x - blobX, y - blobY);
      let overlaps = false;
      for (const ob of obstacles) {
        if (Math.hypot(x - ob.x, y - ob.y) < ob.r + r + blobRadius * 2.2) { overlaps = true; break; }
      }
      if (dist < blobRadius * CLEAR_RADIUS_MULT + r || overlaps) {
        this.addObject(list, key, x, y, snackR(), rng, blobRadius, false);
      } else {
        obstacles.push({ x, y, r });
        this.addObject(list, key, x, y, Math.max(OBJ_MIN_R, r), rng, blobRadius, true);
      }
    }

    // Then the snacks.
    for (let i = 0; i < nSnacks; i++) {
      const { x, y } = pos();
      this.addObject(list, key, x, y, snackR(), rng, blobRadius, false);
    }

    this.cells.set(key, list);
  }

  // Create one object, attach a body if it's an un-eatable obstacle, and register it.
  addObject(list, key, x, y, r, rng, blobRadius, isObstacle) {
    // Rarely, an eatable snack is actually a special pickup. Never obstacles.
    let kind = null;
    let color = OBJECT_COLORS[(rng() * OBJECT_COLORS.length) | 0];
    if (!isObstacle && rng() < CONFIG.PICKUP_CHANCE) {
      kind = pickPickupKind(rng);
      color = PICKUPS[kind].color;
    }

    const obj = {
      x, y, r,
      color,
      kind,                    // null for a normal object; else 'golden'|'magnet'|'boom'
      wobblePhase: rng() * Math.PI * 2,
      absorbable: r < blobRadius * CONFIG.ABSORB_RATIO,
      absorbing: false,        // currently being sucked in
      body: null,
      cellKey: key,            // back-ref so consume() finds its cell in O(1)
    };
    if (!obj.absorbable) this.attachBody(obj);
    list.push(obj);
    this.objects.push(obj);
  }

  // Give an object a real Nape static body so the blob collides with it.
  attachBody(obj) {
    const { Body, BodyType, Circle, Vec2 } = this.nape;
    const body = new Body(BodyType.STATIC, new Vec2(obj.x, obj.y));
    body.shapes.add(new Circle(obj.r, undefined, this.obstacleMaterial));
    body.space = this.space;
    obj.body = body;
  }

  removeBody(obj) {
    if (obj.body) { obj.body.space = null; obj.body = null; }
  }

  despawnCell(key) {
    const list = this.cells.get(key);
    if (!list) return;
    for (const obj of list) {
      this.removeBody(obj);
      const idx = this.objects.indexOf(obj);
      if (idx >= 0) this.objects.splice(idx, 1);
    }
    this.cells.delete(key);
  }

  // Permanently remove a single object (after it's absorbed).
  consume(obj) {
    this.removeBody(obj);
    const idx = this.objects.indexOf(obj);
    if (idx >= 0) this.objects.splice(idx, 1);
    const list = this.cells.get(obj.cellKey);
    if (list) {
      const li = list.indexOf(obj);
      if (li >= 0) list.splice(li, 1);
    }
  }

  // Keep only cells near the camera; spawn missing ones; update absorbable flags.
  // `radiusCells` grows when the camera zooms out so the view stays filled.
  // `absorbRatio` is normally CONFIG.ABSORB_RATIO, but a frenzy pickup raises it
  // past 1 so even too-big obstacles turn edible for its duration.
  update(camX, camY, blobRadius, radiusCells, absorbRatio = CONFIG.ABSORB_RATIO) {
    const { CELL_SIZE, SPAWN_RADIUS_CELLS } = CONFIG;
    const ccx = Math.floor(camX / CELL_SIZE);
    const ccy = Math.floor(camY / CELL_SIZE);
    const R = radiusCells || SPAWN_RADIUS_CELLS;

    // Despawn far cells.
    for (const key of [...this.cells.keys()]) {
      const [kx, ky] = key.split(',').map(Number);
      if (Math.abs(kx - ccx) > R || Math.abs(ky - ccy) > R) this.despawnCell(key);
    }

    // Spawn near cells.
    for (let gx = ccx - R; gx <= ccx + R; gx++) {
      for (let gy = ccy - R; gy <= ccy + R; gy++) {
        if (!this.cells.has(this.cellKey(gx, gy))) this.spawnCell(gx, gy, blobRadius, camX, camY);
      }
    }

    // As the blob grows (or a frenzy raises the ratio), obstacles become
    // absorbable and drop their bodies. When a frenzy ends, any still-too-big
    // object that survived reverts to a solid obstacle and gets its body back.
    for (const obj of this.objects) {
      const canEat = obj.r < blobRadius * absorbRatio;
      if (canEat && !obj.absorbable) {
        obj.absorbable = true;
        this.removeBody(obj);
      } else if (!canEat && obj.absorbable && !obj.absorbing) {
        obj.absorbable = false;
        this.attachBody(obj);
      }
    }
  }
}
