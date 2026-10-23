# Swell Rider

A small three.js jet ski game. You ride across choppy open water, launch off the swells, and race five AI rivals around a buoy course with kicker ramps.

## Controls

| Input | Action |
| --- | --- |
| W / ↑ | Throttle |
| S / ↓ | Brake / reverse (in the air: backflip) |
| A D / ← → | Steer (in the air: spin) |
| Shift | Boost (refills over time, plus a bonus for tricks and rings) |
| Space | Hop |
| T / 🏁 | Restart the race (in free ride: back to the start line) |
| Enter | Race again (on the finish screen) |
| M | Mute |
| R | Reset |

On touch devices you get an on-screen stick and HOP / BOOST buttons.

Hit a swell at speed to get air. Fly through the gold rings, and land clean (nose level, facing forward) to build your combo.

## Race mode

Press **RACE** on the title screen (or Enter / W / Space) to line up on a six-ski grid behind the start arch against five AI riders: MARLIN, RIPTIDE, CORAL, GULL and BARNACLE. You start fifth. After a 3-2-1 countdown it's **3 laps**. Pass the gates in order; the first rider back through the arch after lap 3 wins.

- **Rivals** run on the same `Player` physics as you. They get the same swells, the same ramp pops and the same landings (they can wipe out too). They follow the course centerline in their own lanes, slow for the bends, line up on every ramp from ~120 m out, steer the nose with small air spins while airborne, and boost on the straights. They differ in cornering skill, engine power and aggression. RIPTIDE leans in on you when you're side by side; GULL gives you room. A gentle catch-up keeps the pack close: rivals get up to +10% power when they're behind you and -6% when far ahead.
- **Bumping**: every ski is a capsule. Overlapping skis get pushed apart and trade momentum along the contact normal with an impulse (equal mass, slightly bouncy). Off-centre hits also spin both hulls, and there's a bit of scrub friction. Skis can fly over each other. Bumps make spray, a hull knock and camera shake when you're involved.
- **HUD**: your position (e.g. `2ND /6`), the race clock and a live standings list with time gaps. The lap counter shows `n/3`. Rivals show as coloured dots on the minimap and have name tags with their position over their heads.
- **Finish screen**: your place, total time, best lap and score (with a place bonus), plus a results table that keeps updating as the rivals finish. Your ski drives itself on a cool-down lap behind it. **RACE AGAIN** or **FREE RIDE**.
- Progress only counts up to the next gate you have actually been through, so skipping a gate never moves you up the order. A rival that gets wedged somewhere or knocked way off course is put back on the line just before the gate it needs. It blinks for a moment and can't collide while it does.
- **FREE RIDE** is the original solo mode: no rivals, endless timed laps, open water.

## Race course

Right ahead of where you spawn there's a start/finish arch. Ride through it and the lap clock starts. The course is a loop of about 1.7 km marked by pairs of orange buoys. It has a tight hairpin, a chicane, a long fast sweeper and an S-bend. Pass the gates in order: the next one glows yellow and has a spinning chevron over it. Then come back through the arch to finish the lap.

- **Ramps**: four floating kicker ramps sit on the straights. The faster you hit one, the bigger the jump (about 2-3 s of air and 8-15 m high, more with boost). Their sides and back are solid.
- **Timing**: the HUD shows the current lap time, your best lap and your last lap. At each gate you get a split against your best lap (green = ahead, red = behind). Your best lap and its splits are saved in `localStorage`.
- **Help**: the minimap marks the course, the ramps (blue), the next gate (yellow) and you. If you skip a gate you get a MISSED GATE warning, and the lap only counts once you go back for it. A WRONG WAY warning shows if you ride the course backwards.
- The swells are a bit gentler over the course, so you can make the turns. They build back to full size out in the open water, where you can still roam freely.

## Develop

```sh
npm install
npm run dev      # local dev server
npm run build    # static site -> dist/
npm run preview  # serve dist/ locally
```

## Deploy

`npm run build` writes a fully static site to `dist/` (`index.html` plus `assets/`). Every path is relative, so you can upload the contents of `dist/` to any static host, at the site root or in a sub-folder (e.g. `yoursite.com/games/swell-rider/`). It needs no server code.

## How it works

- `src/waves.js` holds the single wave definition. The same sum of sharpened sine swells is compiled to GLSL for the water mesh and evaluated in JS for the physics, so the ski rides exactly the surface you see.
- `src/player.js` handles the arcade physics. The ski sticks to the water while the water's vertical acceleration is weaker than gravity. When a crest falls away faster than that, you're airborne, with a little extra launch.
- `src/particles.js` has the pooled spray, mist and foam particles, plus a foam wake ribbon draped on the waves.
- `src/track.js` is the race course. A closed Catmull-Rom centerline is sampled every 2 m. Gates are placed automatically at every corner apex and then at most 95 m apart. It also builds the corner marker buoys, the start arch and the ramps, and runs the lap/gate logic (segment crossing, interpolated to the physics step). The ramps are extra ground for the physics: `Player.heightAt` takes the higher of the water and the deck, and the lip gives a speed-dependent pop. `src/racehud.js` draws the timer, splits, minimap and wrong-way warning.
- `src/ai.js` is the AI rider. It outputs the same `{ throttle, steer, boost, hop }` a human produces: pure pursuit on a look-ahead point in its lane, corner speed from the tightest curvature in its braking window, ramp alignment, dodging and air control. `src/race.js` has the grid, countdown, per-rider gate tracking and progress, ranking, rescues and the capsule bump physics. `src/collide.js` is ski-vs-scenery collision, shared by every ski.
- `src/audio.js` synthesizes the engine, water, wind, splash, chime, hull-bump and rival-engine sounds with WebAudio, so there are no audio files.
