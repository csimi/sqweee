// ============================================================================
//  SQWEEE — TUNABLES
//  Everything you'd want to experiment with lives here. Tweak, save, reload.
//  Values are in screen/world pixels and seconds unless noted.
// ============================================================================

export const CONFIG = {
  // --- MOVEMENT / FEEL --------------------------------------------------------
  MAX_SPEED: 520,          // top roll speed (px/s) at full drag
  SPEED_ZOOM_COMP: 1,      // counter the camera zoom-out so ON-SCREEN speed stays
                           // constant as you grow. 1 = fully constant apparent
                           // speed; 0 = old behaviour (looks slower when big)
  STEER_GAIN: 0.22,        // how snappily velocity chases your input (0..1). Higher = twitchier
  COAST_DRAG: 0.55,        // Nape worldLinearDrag: how quickly you glide to a stop on release (lower = more slide)
  HEAVY_FACTOR: 0.35,      // how much bigger = heavier/slidier (0 = weight never changes)
  SPEED_CAP: 1150,         // hard ceiling on blob speed (px/s) so chained bounces can't go exponential
  BOUNCE_ELASTICITY: 0.3,  // base physics rebound off obstacles (Nape caps this at 1 = full mirror)
  KNOCKBACK: 2.5,          // launch speed when you RAM something too big (x impact speed). THE push-back knob
  KNOCKBACK_MIN_SPEED: 170,// you must hit at least this fast to get the big launch+stun (px/s)
  KNOCKBACK_NUDGE: 130,    // gentle separation for slow touches (no stun, keeps you in control)
  KNOCKBACK_STUN: 0.24,    // seconds your steering is ignored after a real ram, so the launch lands
  NUDGE_GAP: 3,            // how close (px) counts as "touching" for the anti-stuck outward drift

  // Boost: HOLD Space (or a second finger) to charge a slingshot, RELEASE to
  // fire along your CURRENT velocity (where you're going — after a bump/knockback
  // that isn't where you're facing). A quick tap = the minimum BOOST_SPEED.
  BOOST_SPEED: 460,        // minimum surge on a quick tap (px/s)
  BOOST_SPEED_MAX: 1080,   // surge at full charge (px/s) — the slingshot payoff
  BOOST_CHARGE_TIME: 0.65, // seconds of holding to reach full charge
  BOOST_COOLDOWN: 0.6,     // seconds between boosts so it can't be machine-gunned
  BOOST_MIN_SPEED: 40,     // below this you're "stopped"; boost then follows steer input instead
  BOOST_JUMP_SCALE: 0.2,   // "hop" visual: crouch to (1-this) then pop to (1+this) size
  BOOST_JUMP_DURATION: 0.4,// seconds the whole squash-then-pop hop takes
  BOOST_GRACE: 0.5,        // seconds after a boost where steering won't brake the surge
                           // (you can still turn) so the extra speed bleeds off via drag
  BOOST_CRASH_SHRINK: 0.8, // GREEDY BOOST: ram a too-big obstacle while boosting and
                           // you keep only this fraction of your grown size (and lose your streak)

  // Floating-joystick drag
  DRAG_MAX_DISTANCE: 120,  // finger travel (px) for full speed
  DRAG_DEADZONE: 8,        // ignore tiny jitters below this (px)

  // --- BLOB SHAPE / SOFT BODY -------------------------------------------------
  BLOB_START_RADIUS: 34,   // starting size (px)
  BLOB_POINTS: 18,         // ring resolution — more = smoother & softer, costs a little perf
  WOBBLE_STIFFNESS: 260,   // spring pulling each ring point back to its rest shape. Higher = firmer
  WOBBLE_DAMPING: 0.86,    // ring velocity retention per frame (0..1). Lower = settles faster
  WOBBLE_NEIGHBOR: 0.22,   // how much neighbours smooth each other — keeps the outline round
  INERTIA_WOBBLE: 0.055,   // jiggle strength when you change direction / bump. THE juice knob
  IDLE_WOBBLE_AMP: 0.02,   // gentle breathing amplitude while still (fraction of radius)
  IDLE_WOBBLE_SPEED: 2.2,  // breathing speed
  SQUASH_FACTOR: 0.16,     // how much the blob stretches along its travel direction

  // Eyes
  EYE_SPACING: 0.42,       // eye separation (fraction of radius)
  EYE_FORWARD: 0.26,       // how far the eyes sit toward the front
  EYE_SIZE: 0.24,          // eye radius (fraction of blob radius)
  PUPIL_LOOK: 0.4,         // how far pupils lean toward movement
  BLINK_EVERY: 4.2,        // average seconds between blinks

  // --- GROWTH / ABSORB --------------------------------------------------------
  ABSORB_RATIO: 0.92,      // you can eat objects with radius < blobRadius * this
  ABSORB_REACH_MULT: 0.3,  // suction halo beyond touching, as a fraction of YOUR radius (scales with
                           // you — a fixed px reach becomes negligible when big, making chains precise)
  GROWTH_RATE: 0.15,       // fraction of an eaten object's AREA added to yours. Lower = slower, gentler growth
  GROWTH_SIZE_TAPER: 1.5,  // growth-per-bite fades as (start/radius)^this. Area-based growth is naturally
                           // exponential (snacks scale with you), so late levels rush by; this flattens the
                           // curve for steady pacing. 1 at start (early game unchanged); higher = slower when big
  GROWTH_EASE: 6,          // how quickly visible size eases toward target (higher = snappier)
  ABSORB_PULL: 900,        // how fast a doomed object is sucked into you (px/s, accelerates)
  MAX_RADIUS: 260,         // soft cap so it never gets absurd

  // --- CAMERA ZOOM (view scales down as you grow so you never fill the screen) -
  // Reference/cap are FRACTIONS of the smaller screen dimension, not fixed px, so
  // the blob takes the same share of the viewport on a phone as on a desktop.
  ZOOM_REF_FRACTION: 0.1,       // blob shows at ~true size until its radius passes this fraction of the small screen dim
  ZOOM_STRENGTH: 0.8,           // 1 = apparent size stays constant; lower = still grows a little
  ZOOM_MAX_BLOB_FRACTION: 0.12, // hard cap: blob radius never exceeds this fraction of the small screen dim (mobile-safe)
  ZOOM_EASE: 3,                 // how smoothly the view eases toward the target zoom

  // --- WORLD / SPAWNING (endless, camera-culled) ------------------------------
  CELL_SIZE: 260,          // world grid cell size (px)
  SPAWN_RADIUS_CELLS: 4,   // how many cells around the camera stay populated
  OBJECTS_PER_CELL: 4,     // density
  OBJ_MIN_R: 8,            // absolute floor so nothing is ever sub-pixel
  // Object sizes scale with YOUR current size, so there are always snacks to eat
  // AND always bigger obstacles to bounce off — at every zoom level.
  BIG_CHANCE: 0.12,        // fraction of objects that spawn as too-big obstacles
  SNACK_DENSITY_FALLOFF: 1.5, // snacks thin out as (start/radius)^this as you grow. Obstacles use 2
                           // (constant on-screen count, anti-pin); LOWER here = more snacks to munch when big
  SNACK_MIN_MULT: 0.12,    // absorbable objects: this .. MAX times your radius
  SNACK_MAX_MULT: 0.55,
  OBSTACLE_MIN_MULT: 1.05, // obstacles: this .. MAX times your radius (always bigger than you)
  OBSTACLE_MAX_MULT: 2.0,
  CLEAR_RADIUS_MULT: 3.2,  // keep a bubble this many radii around you free of obstacles (anti-stuck)

  // --- COMBO / STREAK (chain bites before the timer drains to multiply growth) -
  COMBO_WINDOW: 1.7,       // seconds to grab the next bite before the streak resets
  COMBO_GROWTH_STEP: 0.14, // each extra chained bite adds this to the growth/score multiplier
  COMBO_MULT_CAP: 4,       // multiplier never exceeds this, however long the chain

  // --- PICKUPS (rare special bubbles — variable reward) -----------------------
  PICKUP_CHANCE: 0.05,     // fraction of snack-sized objects that become a special pickup
  GOLDEN_GROWTH_MULT: 7,   // a golden bubble is worth this many normal bites of growth
  MAGNET_DURATION: 6,      // seconds a magnet pickup pulls nearby snacks to you
  MAGNET_VIEW_FRACTION: 0.33, // magnet reach as a fraction of the smaller screen dimension. Pulls a
                             // zone AROUND you (keeps vacuuming as you roll), not the whole screen
  MAGNET_PULL_MULT: 9,     // reel-in speed = this × your radius per second, so it works when big too
  EXPLOSION_VIEW_FRACTION: 0.42, // bomb blast radius as a fraction of the smaller screen dimension
                             // (viewport-relative, so it clears the same visible chunk on any device)
  EXPLOSION_COMBO_GRACE: 4,  // seconds of combo window granted after a bomb — the blast clears the
                             // field, so give time to reach the next cluster before the streak dies

  // --- JUICE ------------------------------------------------------------------
  SHAKE_DECAY: 12,         // how fast screen-shake settles (higher = snappier)
  SHAKE_MAX: 22,           // clamp so a huge combo/crash can't nauseate
  BOUNCE_MORPH_DURATION: 0.6,  // seconds the "deform into a shape" lasts on a hard bounce
  BOUNCE_MORPH_STRENGTH: 0.8,  // 0..1 how strongly the blob snaps to the shape (1 = fully)

  // --- PROGRESSION (cosmetic only, nothing losable) ---------------------------
  LEVEL_RADIUS_STEP: 26,   // radius gained per size level (drives the size bar/level)
  // How many total objects you must absorb to unlock each skin, in order. Index 0
  // is the starting colour (0). Escalating gaps so later colours feel earned.
  // Tweak these to pace how fast new colours appear.
  SKIN_UNLOCK_AT: [0, 40, 100, 190, 320, 500, 750, 1100],

  // --- AUDIO ------------------------------------------------------------------
  SFX_VOLUME: 0.28,
};

// Blob skins — unlocked in order as you grow. {name, core, edge, eye}
export const SKINS = [
  { name: 'Slime',     core: '#7ef0c8', edge: '#2fbf9b', eye: '#0d2b2b' },
  { name: 'Bubblegum', core: '#ff9ecb', edge: '#e5589a', eye: '#3a1030' },
  { name: 'Blueberry', core: '#8fb8ff', edge: '#4d79e6', eye: '#101a3a' },
  { name: 'Tangerine', core: '#ffc36e', edge: '#f0902f', eye: '#3a2410' },
  { name: 'Grape',     core: '#c69bff', edge: '#8a4fe6', eye: '#26103a' },
  { name: 'Limeade',   core: '#c6f06e', edge: '#8ac72f', eye: '#243a10' },
  { name: 'Coral',     core: '#ff8f7e', edge: '#e5533f', eye: '#3a1610' },
  { name: 'Frost',     core: '#a8f0ff', edge: '#4fc7e6', eye: '#10323a' },
];

// Small palette for scattered objects so the field looks lively.
export const OBJECT_COLORS = [
  '#ffd166', '#ef8354', '#8ac926', '#4cc9f0', '#f15bb5',
  '#b5179e', '#90be6d', '#f9c74f', '#7bdff2', '#ff99c8',
];

// Special pickups. `kind` is stamped on the object; each has a signature colour
// and a glyph drawn on top so they read as "not just a snack".
export const PICKUPS = {
  golden: { color: '#ffcf3f', glyph: '★' },  // big growth + streak boost
  magnet: { color: '#57b6ff', glyph: '⌾' },  // auto-pull nearby snacks
  boom:   { color: '#ff6b4a', glyph: '✷' },  // explosion: pops every snack nearby
};
export const PICKUP_KINDS = Object.keys(PICKUPS);
