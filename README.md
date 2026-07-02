# sqweee 🫠

### ▶ [**Play it here**](https://csimi.github.io/sqweee/)

A casual **roll & absorb** blob game. You're a soft, wobbly slime in the
centre of the screen; the world scrolls under you as you roll around an endless
field, absorbing anything smaller than you and growing. Chain bites fast to build
a combo — how high can you streak?

Built as an installable **PWA** with plain HTML5 Canvas + **[nape-js](https://github.com/NewKrok/nape-js)**
for real rigid-body physics (movement, momentum, and bump/squish against
too-big obstacles). The blob's squishy soft-body look is a spring-coupled ring
driven by the physics body's motion.

## Run it

```bash
npm install        # already done if you're reading this
npm run dev        # dev server with hot reload
```

Open the printed **Local** URL on desktop. To play on your **phone**, make sure
the phone is on the same Wi-Fi and open the printed **Network** URL (e.g.
`http://192.168.x.x:5173/`). From the phone browser menu you can "Add to Home
Screen" to install it as an app.

Production build (static files in `dist/`, works offline via service worker):

```bash
npm run build
npm run preview    # serves the built app, also on the Network URL
```

## Controls

| Input | Action |
|---|---|
| **Drag anywhere** (touch) · **WASD / arrows** (desktop) | **Roll** — direction & speed follow the drag; release to coast to a stop |
| **Space** (desktop) · **second finger** (touch) | **Boost** — *hold to charge* a slingshot, *release to fire* |

- Boost launches you along the way you're **actually moving** — so a boost mid-bounce
  rides the knockback, not the way you're facing. Standing still, it goes where you steer.
- The longer you hold, the bigger the surge (a quick tap is a small nudge).
- **Greedy boost:** ram a too-big obstacle *while boosting* and you bounce off but
  shrink a little and lose your streak — so time it.

## Gameplay

- **Absorb & grow** — roll over anything smaller than you to eat it and grow. Things
  bigger than you are obstacles: bump them and you bounce off, briefly squishing into a
  random shape (star, square, triangle…). Everything scales with you, so there are always
  snacks to eat and obstacles to dodge at every size.
- **Combos** — chain bites before the timer drains to build a multiplier (up to **×4**)
  that boosts your growth. Your **best streak** is saved locally and shown on the start screen.
- **Pickups** — rare glowing bubbles worth chasing:
  - **★ Golden** — a big burst of growth (worth ~7 normal bites).
  - **⌾ Magnet** — vacuums nearby snacks straight into you for a few seconds.
  - **✷ Bomb** — detonates, popping every snack around you at once (and keeping the combo alive through the blast).
- **Skins** — unlock new blob colours as your total absorbed climbs.

Installable as a **PWA** — "Add to Home Screen" on mobile, or install from the address bar on desktop.

## Where to tweak the feel

**All tunables live at the top of [`src/config.js`](src/config.js)** — clearly
labelled and commented. The ones worth playing with first:

| Constant | What it does |
|---|---|
| `INERTIA_WOBBLE` | the main "juice" knob — jiggle on turns/bumps |
| `WOBBLE_STIFFNESS` / `WOBBLE_DAMPING` | how firm vs. floppy the blob is |
| `SQUASH_FACTOR` | how much it stretches in the travel direction |
| `MAX_SPEED` / `STEER_GAIN` / `COAST_DRAG` | movement responsiveness & glide |
| `GROWTH_RATE` / `GROWTH_SIZE_TAPER` | how fast you grow & how steady the pacing stays as you get big |
| `SNACK_DENSITY_FALLOFF` | how many snacks stay around to munch as you grow (obstacles stay sparse) |
| `BOOST_SPEED` / `BOOST_SPEED_MAX` / `BOOST_CHARGE_TIME` | boost surge from a tap vs. a full charge |
| `COMBO_WINDOW` / `COMBO_MULT_CAP` | streak timing & max growth multiplier |
| `PICKUP_CHANCE` / `GOLDEN_GROWTH_MULT` / `MAGNET_*` / `EXPLOSION_*` | how often pickups spawn & how strong each is |

Blob colours/skins, object palettes, and pickup styles are the `SKINS` /
`OBJECT_COLORS` / `PICKUPS` exports in the same file.

## Source map

- `src/config.js` — every tunable constant + skins.
- `src/game.js` — main loop, Nape physics wiring, absorb logic, HUD, particles.
- `src/blob.js` — the squishy soft-body blob (spring ring, eyes, squash, growth).
- `src/world.js` — endless camera-culled object field; Nape bodies for obstacles.
- `src/input.js` — floating joystick + keyboard, and the charged boost (Space / two-finger).
- `src/audio.js` — tiny WebAudio blip/chime synth.

## Performance notes

Only cells within `SPAWN_RADIUS_CELLS` of the camera exist; the rest is culled.
Only obstacles *bigger* than you get a Nape physics body (so collisions are
real); small pellets are lightweight data absorbed by proximity. Off-screen
objects are skipped when drawing. Targets a smooth 60fps on mid-range phones.

## Next thing I'd polish

**Add a soft "impact ring" + brief camera-zoom pulse the instant you swallow
something bigger than a pellet** — that single beat of feedback is what turns
"eating dots" into "*devouring*," and it's the highest feel-per-line upgrade from
where the prototype is now.
