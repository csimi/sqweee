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

- **Touch:** drag anywhere — floating joystick. Direction = drag direction,
  speed = drag distance. Release to coast to a stop.
- **Desktop:** WASD / arrow keys.

## Where to tweak the feel

**All tunables live at the top of [`src/config.js`](src/config.js)** — clearly
labelled and commented. The ones worth playing with first:

| Constant | What it does |
|---|---|
| `INERTIA_WOBBLE` | the main "juice" knob — jiggle on turns/bumps |
| `WOBBLE_STIFFNESS` / `WOBBLE_DAMPING` | how firm vs. floppy the blob is |
| `SQUASH_FACTOR` | how much it stretches in the travel direction |
| `MAX_SPEED` / `STEER_GAIN` / `COAST_DRAG` | movement responsiveness & glide |
| `GROWTH_RATE` / `ABSORB_RATIO` | how fast you grow & what you can eat |
| `OBJECTS_PER_CELL` / `SPAWN_RADIUS_CELLS` | field density & how much world is live |

Blob colours/skins and object palettes are the `SKINS` / `OBJECT_COLORS` arrays
in the same file.

## Source map

- `src/config.js` — every tunable constant + skins.
- `src/game.js` — main loop, Nape physics wiring, absorb logic, HUD, particles.
- `src/blob.js` — the squishy soft-body blob (spring ring, eyes, squash, growth).
- `src/world.js` — endless camera-culled object field; Nape bodies for obstacles.
- `src/input.js` — floating joystick + keyboard.
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
