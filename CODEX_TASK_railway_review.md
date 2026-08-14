# Codex task: LEGO Builder — review the railway system

## Context

Single-file WebGL app: `/Users/hub/projects/lego-builder/index.html` (~3,800 lines, Three.js from a CDN,
no build step, no framework, no git). `lego-builder.html` is a byte-identical copy — whatever you change
in one, mirror into the other. Assets alongside: `lego_bricks.glb`, `lego_props.glb`, `lego_minifig.glb`,
`lego_track.glb`. Serve the folder over HTTP and open `index.html`.

Everything is in **studs** (`P = 0.008` world units) and **plates** (`PH = 0.0032`). A brick is 3 plates,
rail top sits at `RAIL = 2` plates, a locomotive is **18 plates tall**. Do not assume metres.

The railway world is `WORLDS.railyard` ("🛤 Railway Junction"), generated at runtime by `genRailyard`.

---

## The owner's instructions, verbatim

These are the requirements as given, in order. Reproduced exactly, typos and all, because the wording
matters — read them as the spec, not my paraphrase of it.

> build a more comples railway system with forks and elevations buttons to control the forks needs to use
> 200 railway pieces and fully functional

> the train is so dumb thrre is a carriage in front of the loco ... and the track is useless look abd
> think anout what you are doing there needs to be muktiple lopps no stops big elevation/ bridges the
> traons can run underneath also keep trying to be netter and strive for a proper system

> make the outer circuit bigger so the high section is longer

> the track still is silly you have parts it running through create a prompt for codex to review

> no way rhe track runs through it in parts you need to mention that and mention that you cannot see the
> error and what you have done so far for review

Distilled requirements: **200 railway pieces**, forks with **buttons to control them**, **multiple
loops**, **no stops**, **big elevation/bridges with trains running underneath**, and it must be **fully
functional** — a proper system, not something that merely passes a checklist.

---

## THE DEFECT — track running through track. Confirmed.

The owner reported this three times before it was found. **They were right and my checks were wrong.**

`genRailyard` builds a flyover: a chord leaves the outer circuit through a point, climbs five ramps to 30
plates, runs six bridge decks across the middle, and descends five ramps to rejoin the circuit. The level
deck section has proper clearance. **The ramps do not.**

At **two places the climbing ramp passes directly over a ground-level running straight with a vertical
gap of 6 plates**:

| Upper piece | Lower piece | Gap | Location (studs) |
| --- | --- | --- | --- |
| `track_ramp` | `track_straight` | **6 plates** | x 152, z 49 |
| `track_ramp` | `track_straight` | **6 plates** | x 152, z 271 |

A locomotive is 18 plates tall and needs ~20 plates of clearance. At 6 plates **the ramp physically
intersects the running line**, and a train on the lower track would drive straight through it. Visually
the ramp deck cuts across the ground track at near-zero height. This is at **both** approaches to the
flyover, which is why it is so noticeable.

The other 8 crossings on the layout are fine (≥20 plates — those are the deck section doing its job).

**Root cause to confirm:** the chord starts climbing from the point on the outer circuit, but the
first nested circuit is inset only 32 studs, so the chord crosses it while still on the first ramp and
barely off the ground. The generator never checks vertical clearance at crossings — it only ever checked
the *deck* height, never the ramps.

## Second defect — the piers

Of the 200 railway pieces, **60 are piers and only 142 are running track**. A footprint sweep gives 101
intersecting pairs, dominated by piers:

| Pair | Pairs | Meaning |
| --- | --- | --- |
| `track_pier × track_pier` | 66 | Piers sharing a cell — **12 piers** sit where a pier already was |
| `track_half × track_pier` | 16 | Piers standing on running track |
| `track_curve_big × track_straight` | 12 | Bounding-box only — the arc fills part of its 32×32 tile |
| `track_pier × track_straight` | 6 | Piers standing on running track |
| `track_pier × track_ramp` | 1 | Pier inside a ramp |

Per piece: **12 piers are duplicates in an occupied cell** and **15 piers overlap ground-level running
track**. The cause is the padding loop at the end of `genRailyard`, which tops the count up to 200 by
dropping extra piers along the ramps and decks; it wraps repeatedly over the same few parents and
re-plants into cells already used.

**The 200-piece target is being met with scenery rather than railway.** That is the deeper issue. Either
the target should be filled with real track — more circuit, longer viaduct, extra running lines — or it
should be dropped. Give a recommendation.

---

## What I got wrong — read this before trusting any check below

I ran three detection passes. **The first two returned "clean" and were both wrong.** Understanding why
matters, because the same blind spots will hide other faults.

1. **Bounding-box sweep over all pieces.** Found the pier problems but reported no `ramp × straight`
   clash. Both pieces have `base = 0`, so their boxes do overlap — this should have caught it. Worth
   working out why it didn't; I suspect I only reported the top grouped pairs and lost it in the noise.

2. **Centre-line sampling, 3.5-stud threshold.** Returned zero clashes. **Wrong: a track deck is 8 studs
   wide**, so two lines 5 studs apart overlap physically while this test calls them clean. The threshold
   was smaller than the pieces being tested.

3. **Centre-line sampling, 7.5-stud threshold + height filter `|Δy| < 2.5` plates.** Still returned zero.
   **Wrong for a different reason:** the height filter *excluded exactly this defect*. A ramp 6 plates
   above a straight has `Δy = 6`, so the test discarded it as "not touching" when 6 plates is nowhere
   near enough for a train to pass. I was testing for geometric intersection when the real requirement is
   **clearance**.

The fault was only found on the fourth attempt, by sampling every running centre-line, finding all
places where one line passes within a deck-width of another in plan, and then asking *how big is the
vertical gap* rather than *do they touch*. That is the check that should exist permanently.

**I could not see this by eye until I had the coordinates.** The layout looks plausible from above; the
clash is only obvious from a low angle at the flyover approaches. Assume there may be more faults of this
kind that neither I nor these checks have caught — finding them is part of this task.

## What is verified good — challenge it if you disagree

Measured from the console, not eyeballed:

1. **Exactly 200 railway pieces** (`DEFS[type].cat === 'track'`, excluding the two `train_*` vehicles).
2. **Zero unpaired rail ends.** Every `trackGraph` entry has ≥2 ports. Nothing dead-ends.
3. **The train never stops** on either point setting — stepped 3,000+ studs through `stepAlong` with
   `blocked` never true, points straight and both points thrown.
4. **Throwing the points reroutes it** over the flyover; the traversed set includes `track_bridge`.
5. **The loco leads** the carriage when parked and when running.

## Where the code is

| What | Line |
| --- | --- |
| `TRACK` piece table (ports, lines, arcs, `RAIL`) | 371 |
| Points (`track_switch_r/l`, `fork: true`) | 385 |
| `buildTrackGraph` — ports keyed by `x,z,y` | 2148 |
| `pathGeom` / `pathLen` / `pathPoint` — per-route straight or arc | 2161–2185 |
| `neighbourAt` — skips the whole piece, not just one port | 2186 |
| `stepAlong` — walks the network; reads `b.thrown` at a fork's toe | 2197 |
| `localPath` / `entryHeading` — direction of travel into a piece | 3155–3172 |
| `makeTurtle` — lays a piece from the previous piece's exit port | 3173 |
| **`genRailyard` — the layout generator, and where both defects live** | **3206** |
| `WORLDS.railyard` registration | 3312 |
| Switch geometry (`buildTrackGeo` cases) | 3547 |
| `throwSwitch` / `refreshSwitchHud` — point controls | 1886 / 1909 |

`window.app` exposes `genRailyard, loadWorld, WORLDS, TRACK, DEFS, placed, trackGraph, buildTrackGraph,
stepAlong, poseAt, footprint, throwSwitch, nearbyForks, makeTurtle, entryHeading, setTrainMode, train`.
Every claim above is reproducible from the console.

## Intentional — don't "fix" these

- **Curves are 90° at 8- and 16-stud radius.** Real LEGO is 22.5° at 40-stud radius. The comment at line
  ~366 explains why: this app snaps to a stud grid with 90° rotations. Changing it breaks every saved
  layout and `railway-source.json`.
- **A track piece's whole footprint is marked occupied** (`rect(w, d, h, 1)`), even though the deck is
  open between sleepers, so the minifig can walk over track instead of falling down every gap.
- **Sleepers sit on a 4-stud pitch with 2-stud gaps** — real LDraw 53401 geometry, verified against the
  part file. Baseplate showing through is correct.
- **Points are two routes sharing a toe**: ports 0 and 2 are at the same position and `stepAlong` picks
  the route from `b.thrown`. `neighbourAt` skips the whole piece rather than one port, or a point hands
  the train back to itself.

## What to deliver

1. **Fix the ramp clearance.** Every crossing on the layout must clear a locomotive (≥20 plates) or not
   cross at all. Options: start the climb earlier so the chord is high before it meets the first circuit;
   move the nested circuits clear of the approaches; or route the chord where it crosses nothing until
   it is up. Say which you chose and why.
2. **Fix the piers** so no piece intersects another, and so piers support the deck rather than pad a
   number.
3. **Add a permanent check** on `window.app` — something like `app.auditTrack()` returning every crossing
   with its vertical gap, plus any intersecting pairs — so this cannot silently regress. Given three of
   my four checks were wrong, the check itself needs to be right: test **clearance**, not just contact,
   and use the real 8-stud deck width.
4. **A recommendation on the 200-piece target**: keep and fill with real track, or drop.
5. **Your own review of the design.** Numbers can pass while the thing still reads as silly. Two points
   on a 200-piece layout is thin when a full `fork` implementation exists. There are no stations, no
   passing loops, no junctions between the concentric circuits. If it needs restructuring, propose it
   before building it.

## Constraints

- One file, no build step. Match the surrounding style: short lowercase helpers, terse `//` comments that
  explain *why*.
- Don't break: `undo`/`redo` (`pushOp`/`commit`), the `v: 3` save format and its `RECENTRE` migration,
  the other worlds (`village_grand` 50,000 bricks, `village_two` 8,581), train mode, the minifig walking
  over track, or the point controls.
- Mirror every change into `lego-builder.html`.
- Verify by running it. The bar: load the world, start the train, step it several thousand studs, confirm
  it never blocks, and confirm every crossing clears a train.
