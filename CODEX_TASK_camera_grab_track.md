# Codex task: LEGO Builder — play-mode cameras, grab/carry, and real LEGO track geometry

## Context

Single-file WebGL app: `/Users/hub/projects/lego-builder/index.html` (~2340 lines, Three.js, no build step,
no framework, no git). Assets alongside it: `lego_bricks.glb`, `lego_props.glb`, `lego_minifig.glb`,
`lego_track.glb`. Serve the folder over HTTP and open `index.html` to test.

World scale is tiny: one stud pitch is `P`, the whole board is `GRID` cells, the minifig is
`FIG_H = 0.038` world units tall. Every camera distance below is in those units — read `CHASE_MIN`/
`CHASE_MAX` (line ~1286) before picking numbers, and don't assume metres.

**Start by reading these regions before changing anything:**

| What | Where |
| --- | --- |
| Track piece table (`TRACK`, ports, `RAIL = 2`) | lines ~316–335 |
| Ground plane / baseplate | line ~404 |
| Stud instancing (one draw call for the world) | line ~420 |
| Pointer handling, play-mode branch (`mode = 'chase'`) | lines ~940–1010, 1083–1155 |
| `handleTap` | line ~1123 |
| Chase camera state + clamps | lines ~1285–1286, 1370–1382 |
| Play physics (`blockedAt`, `groundAt`, `PASSABLE`) | lines ~1283–1360 |
| `setPlayMode` / `setTrainMode` | lines ~1461–1503 |
| Train camera views (`train.view` 0/1/2) — the existing multi-view precedent | lines ~1686–1694 |
| `initGeos` — where track GLB meshes become `DEFS` entries | lines ~2211–2224 |
| Debug handle exposed on `window` (use it to test) | line ~2314 |

There are five asks. Treat 1–3 as one coherent camera redesign, 4 as new interaction, 5 as a
geometry/asset problem. **Review first, then implement.** Report anything you find that the asks below
get wrong about the existing code.

---

## 1. Play-mode camera is clamped too high — let it drop to ground level and look up

Current behaviour (line ~1374):

```js
const phiCap = chase.dist > 0.25 ? Math.max(0.7, 1.45 - (chase.dist - 0.25) * 1.15) : 1.45;
chase.phi = Math.min(phiCap, Math.max(0.32, chase.phi));
```

`chase.phi` is the polar angle from +Y, so `1.45 rad ≈ 83°` — the camera can never get below the
minifig's eye line, and can never look upward at the mansion. The user wants to put the camera **down
at ground level looking up** at builds.

- Raise the cap so the camera can pass below horizontal (`phi > π/2`), e.g. up to ~2.5 rad, while
  keeping it from flipping through the pole or ending up under the baseplate (`camera.position.y`
  must stay above the ground plane at line ~404 plus a small epsilon).
- The existing distance-based `phiCap` exists for a real reason — the comment says a far, low camera
  "stares through walls". Don't just delete it. Decide whether to keep a softened version at long
  distance and allow the full range when pulled in close, and say in your report which you chose and why.
- Check `camera.near` and the perspective FOV: a camera at ground level looking up at a tall build will
  expose near-plane clipping at this world scale. Verify and fix if needed.
- Verify the look-at target (`play.y + 0.022`) still makes sense when the camera is below the fig —
  looking up may need the target raised, not the camera pitched.

## 2. Add a first-person (FPV) camera mode

Camera at the minifig's head, looking where the fig faces; the fig mesh hidden or head-culled so it
doesn't fill the frame. Mouse/touch drag should aim (yaw turns the fig or the view — pick one and be
consistent with how `stickV` movement is applied in the play physics loop), and pitch should have a
proper `±~85°` range so the user can look straight up at the mansion's upper floors.

## 3. Add a close "just behind the head" camera mode

Over-the-shoulder: much closer than the current default `chase.dist = 0.085`, sitting just behind and
slightly above the fig's head, with a wide pitch range. This is the mode the user wants for walking
around the mansion interior, so it must not clip through walls — see whether the existing collision
helpers (`blockedAt` / `groundAt`) can be reused to pull the camera in when a wall is between it and
the fig.

**For 1–3 together:** implement these as a proper camera-mode cycle, not three unrelated hacks. The
train already has exactly this pattern (`train.view` 0/1/2 at line ~1686) — follow it. Add a visible
control in the play-mode HUD (the buttons toggled in `setPlayMode`, line ~1466: `stick`, `jumpBtn`,
`minimap`, `stickZone`, `zoomBtns`) plus a keyboard shortcut, and make sure the mode survives
`setPlayMode(false)` → `setPlayMode(true)` and doesn't fight `setTrainMode`, which force-enables
`playMode` (line ~1488).

## 4. Grab / hold / pick up

There is currently **no carry or grab mechanic anywhere** in the file — grep for `carry|grab|pickup|
hold` returns nothing. Two related things are wanted, and the original request is ambiguous about which;
implement both and flag them separately in your report:

- **Hold and pick up the player.** In build mode, `mode = 'dragFig'` (line ~958) already drags the
  minifig. Confirm whether that works and feels like picking the fig up; if it's broken or only slides
  it along the ground, make it a real grab — lift, carry, drop with placement snapping to the surface
  under the cursor via `groundAt`.
- **Hold and pick up bricks to move them, from inside play mode.** In play mode the single-pointer
  path is hard-wired to `mode = 'chase'` and returns early (lines ~945–952), so taps never reach
  `handleTap`. Add a play-mode grab: the fig picks up a nearby brick, carries it (parented to the hand
  or floating in front), and places it back on the grid. This must go through the existing
  `pushOp` / `commit` / `indexRemove` undo-and-occupancy machinery — a carried brick must leave and
  re-enter `cellIndex` correctly, or collision and `groundAt` will desync. Do not bypass `commit()`.

Respect the existing pointer state machine (`pointers`, `mode`, `two`, `longTimer`) — including the
phantom-touch guard at line ~941 — rather than adding a parallel listener.

## 5. Train track must look like real LEGO track — you can see the baseplate through it

**This is the one the user is most unhappy with, and specifically asked for real research rather than a
guess.** Right now a track piece renders as a solid slab. Real LEGO track is an open frame: separate
sleepers with large gaps between them, so the green baseplate underneath shows through between every
sleeper. That show-through is the whole visual signature and it is currently missing.

Do the research properly before touching geometry. Look at actual reference images and part data for
LEGO train track (BrickLink / Rebrickable / Bricks in Motion / the official 60205 track pack) and
establish, with sources:

- Straight-piece footprint in studs, and the rail gauge (centre-to-centre spacing of the two rails).
- Sleeper count per straight, sleeper width, and the size of the gap between sleepers — the gap is the
  point of this task, so get it right.
- Rail cross-section and how far the rail top sits above the baseplate.
- Curve radius and arc angle for real track, and how that reconciles with this codebase, which
  deliberately does **not** use real geometry: see the comment at lines ~316–320, which says real curves
  are 22.5° at 40-stud radius but this app uses a 90° quarter-turn at 8-stud radius so a loop closes on
  one 32×32 board. Do not silently "fix" that to real dimensions — it would break every saved layout in
  `railway-source.json` and the port table in `TRACK`. If you think it should change, argue for it
  separately.
- Colour: the correct grey for modern plastic track, and note that older eras were blue (4.5V/12V) and
  dark grey with metal rail tops (9V). State which era you're matching.

Treat every dimension above as something to verify from a source, not to accept from this document.

Then work out **where the solid look actually comes from** and fix it at the right layer:

- The meshes are loaded from `lego_track.glb` via `fetchGLB` → `parseGLB` → `initGeos` (lines
  ~2211–2224, 2228–2253). If the GLB itself contains solid slabs, no amount of in-page code fixes it —
  the geometry has to be rebuilt. There is **no generator script for the GLB in this folder**, so say
  clearly whether the fix requires regenerating the asset, and if so propose building track geometry
  procedurally in JS instead (rails + sleepers from box geometries, merged), which keeps the app
  self-contained.
- Check whether the track piece's `DEFS` entry (`rect(w, d, h, 1)`, line ~2222) marks all 8×16 cells as
  occupied, which would both hide the baseplate visually and let the stud instancer or ground logic
  treat the whole footprint as solid. See the stud instancing at line ~420 and the ground plane at ~404.
- Confirm the fig can walk over/between track and the train still rides it (`bogiePose`, `stepAlong`,
  `RAIL = 2`) after any geometry change.

Deliver track where, standing in play mode at ground level (ask 1), the green baseplate is clearly
visible through the gaps between sleepers.

---

## Constraints

- Everything is one file with no build step. Keep it that way; match the surrounding code style, comment
  density, and naming (short lowercase helpers, terse `//` comments explaining *why*).
- Do not break: undo/redo (`pushOp`/`commit`), the save format consumed by `loadWorld`, the existing
  layouts in `mansion-source.json` / `railway-source.json` / `demos-source.json`, train mode, or the
  minimap.
- `index.html` and `lego-builder.html` are byte-identical copies (verified with `diff`). Whatever you
  change in one, mirror into the other, or the two will drift.
- Test by actually running it: serve the folder, enter play mode, and confirm each of the five asks
  visually. The `window` debug handle at line ~2314 (`select, undo, redo, cam, chase, play,
  setPlayMode, THREE, scene, DEFS, pools, commit`) lets you drive the camera from the console.

## Deliverable

1. A review of the current implementation against the five asks — what's genuinely restricting the
   camera, what's missing entirely, and what the real root cause of the solid-looking track is.
2. Your LEGO track research with sources and concrete numbers, before any geometry work.
3. The implementation, with each ask verified in the running app and anything you couldn't do called
   out explicitly.
