# HINODE: Last-Mile Japan - project status

## Milestone
M2 "Delivery loop v1" - DONE (17 Oct 2026).
M3 "Extreme graphics + world" - IN PROGRESS (checkpoint Hinode-M3-wip3, 21 Oct 2026).

## M3 progress
- [x] Save/load (autosave, backup slot, corrupted-save recovery). Title menu.
- [x] Real-time sun shadows: 2048 shadow map (1024 on software GPUs), 3x3 soft PCF, texel-snapped so edges don't shimmer, culls objects outside the sun's view. Markers and the fake blob shadow don't cast.
- [ ] Post-processing: HDR buffer, bloom, tone mapping, vignette.
- [ ] Better materials (fresnel, roughness, ambient occlusion) + day/night cycle.
- [ ] More realistic rider/NPC models + better animations.
- [ ] Rideable vehicles (Chiyo's bike, then cars with proper handling).
- [ ] Bigger world (more districts).
- [ ] Talkable NPCs (dialogue).
- [ ] Atmosphere: weather, ambient audio.

## What works (verified in Chromium, software rendering)
- M1: boot under a subpath, residential quarter (95 houses), walk/run/jump, third-person camera, collision, gamepad mapping.
- Depot (Chiyo's old shop) with the delivery board, pickup counter and Chiyo's parked bike (bike not rideable yet).
- House addresses and resident families on every lot; two red postboxes.
- Delivery board (E): slips with pickup, destination, recipient, note, pay, XP, time limit, difficulty, distance, basket slots. Story jobs carry a 物語 seal.
- Job states: available -> accepted -> carried -> delivered, plus cancel / late / expired / depot-closed.
- Basket capacity 3 slots; heavy parcels 2 slots and slow you down (x0.8). Fragile goods lose condition on hard hits and pay less.
- Rewards: quick bonus x1.2, late x0.6, money, XP, levels, trust. 8 authored story jobs (with unlock chain) + generated daily jobs.
- Game clock 08:00-22:00 (1 game-min per real sec), 21:00 warning, end-of-day summary, Day 2+ with fresh board.
- HUD: time, money, level/XP, trust, active jobs, E prompts, on-screen waypoint arrow, toasts. 3D gem + ring markers.
- Journal (Tab): active jobs with Track/Cancel, logbook, career stats.
- Parcels visibly stacked on the rider's back.

## Files (M2 additions)
js/data/{names,jobs}.js, js/world/{depot,marker}.js, js/game/{career,jobs,interact}.js,
js/ui/{dom,hud,board,journal,summary}.js, css/ui.css; edits to main.js, input.js, player.js, neighborhood.js, index.html.

## Tests
- `node tests/jobs.unit.mjs` - 35/35 pass (delivery logic).
- `node tests/save.unit.mjs` - 24/24 pass; `node tests/save.mjs` - 24/24 pass (browser save/load).
- `node tests/e2e.mjs` - 21/21 pass (movement, collision, camera, soak, resize, no console errors).
- Diagnostics: `tests/perf_probe.mjs` (fps shadows on/off), `tests/shadow_shot.mjs` (on/off screenshots).
- Resize test now waits for frames to advance (up to 20 s) instead of a fixed 1.2 s sleep, because CPU-renderer speed varies.
- `node tests/delivery.mjs` - 33/33 pass (board, accept, collect, deliver, pay, journal, postbox, fragile, heavy, expiry, day end, layout, no console errors).

## Known limits / unverified
- Only tested with SwiftShader (CPU). Real-GPU frame rate unverified. Shadows roughly halve CPU-renderer fps (6.8 -> 4.2 fps at 640x400); expected to be fine on a real GPU.
- Hand-written WebGL2 renderer, no engine (no network in the build sandbox), all models procedural.
- No bicycle/car riding yet. One district only. No audio, weather or day/night lighting yet.
- Story text is short; residents have one line each so far.

## Next task
M3 graphics chunk 2: HDR post-processing (bloom + tone mapping + vignette), then day/night cycle.

## Update - HDR post-processing (M3-wip4)
- [x] HDR post-processing: RGBA16F scene buffer, 4-level bloom (soft knee, threshold 1.05), ACES in post, vignette, warm grade, dither. Falls back to in-shader ACES if float buffers are unsupported.
- [x] NaN guards (normalize + HDR output + bloom prefilter).
- Diagnostic: tests/post_shot.mjs (post on/off, bloom off, HDR bad-pixel count = 0).
- Tests: e2e 21/21, save.mjs 24/24.
- Note: bloom is subtle in the static golden-hour daytime view (max HDR about 1.5). It will show much more with day/night (sun, street lights, lit windows).
- NEXT: dynamic day/night cycle.

## Update - Day/night cycle (M3-wip5)
- [x] js/world/daynight.js: keyframed time of day from the game clock (morning, midday, golden hour, sunset, blue hour, night). Sun arcs east to west; moon takes over after dark with a fade so shadows never pop.
- [x] Street lamps light the ground (8 nearest lamps, warm pools, fade with distance). 16 lamps collected from poles + alley lanterns.
- [x] Windows/signs glow at night and feed the bloom.
- Diagnostic: tests/time_shot.mjs (6 times of day, no errors). e2e 21/21, save.mjs 24/24.
- Note: /tmp/ghp is wiped when the sandbox restarts; recreate with `mkdir -p /tmp/ghp && ln -sfn /data/hinode /tmp/ghp/hinode`.
- NEXT: talkable NPCs, then a drivable car, then a bigger world, then weather + audio.

## M3-wip6 — Talkable NPCs (done)
- `js/data/cast.js`: 8 residents (hayashi, ogawa, chiyo, tanaka, yui, murakami, sora, endo) with schedules, looks, first/greet/chat/about/work/bye lines.
- `js/game/npcs.js`: procedural bodies per look (hats: bun/cap/bucket/scarf/police, glasses, collar, tie, apron, kid head scale), idle sway, turn-to-face + wave on approach, soft body push, speech-bubble marker until talked to today, schedules from clock. Spawn nudged out of walls via collision.resolve. Talk state in localStorage `hinode.npc` {met, last}.
- `js/ui/talk.js` + `.talk` styles in panels.css: typed line, 4 replies (chat / work / about / bye), keys E/Space/Enter, 1-4, Esc. First chat each day = +1 trust.
- main.js: `'talk'` mode; delivery prompts beat Talk prompts; NPCs drawn after markers.
- Tests: `tests/npc.mjs` (port 8130) 11/11; e2e 21/21; save 24/24.
- Next: drivable car (+ simple traffic) -> bigger world -> rain + audio.

## M3-wip7: drivable car + traffic (DONE)
- js/game/vehicles.js: low-poly vehicle builder (coupe / kei / sedan + taxi sign), separate wheel + brake-light meshes.
- js/game/car.js: player car (Hinode coupe). Bicycle-model steering (lock shrinks with speed), throttle/brake/reverse, Space handbrake drift (rear grip drop), 5-speed gear + rpm readout, body pitch/roll, wheel spin + steer, brake lights, night headlights (feeds the lamp pool), crash impact -> jobs.impact (fragile parcels), 2-pass circle collision vs walls/NPCs/traffic, chase camera assist + speed FOV. E to get in (within 2.9 m) / out (only under ~11 km/h, driver side first).
- js/game/traffic.js: 4 AI cars (taxi, 2 kei, sedan) on one-way loops, left-hand traffic. Pure pursuit, slow for corners, brake for cars / the player car / pedestrians ahead, nudge the on-foot player, pause after being hit.
- main.js: car/traffic wired into play tick, prompts (Drive / Get out), camera target, draw, setMode speedo visibility, test hook (car, traffic). On-foot player can't walk through the parked car. If the player gets teleported while driving (new day/load), they're auto-ejected.
- css/hud.css: .speedo (bottom right).
- Tests: tests/car.mjs 16/16 (port 8131). npc 11/11, e2e 21/21, save 24/24 still green. tests/boot_errs.mjs = debug helper that prints boot errors.
- Bugs fixed during the chunk: taxi stripe colour passed as hex string (boot crash); car overlapping walls at corners (now 2 collision passes).
- Not done yet: car position isn't saved (resets to the depot each load), no engine audio, no skid marks/smoke, traffic only on the existing small road loop, models are still low-poly.
- Next: wip8 bigger world (more streets/lamps, longer traffic loops), then wip9 rain + audio.

## M3-wip8 — realistic car (procedural modeller)
- No Blender/DCC tool or internet in the sandbox, so js/game/vehicles.js is now a code-side modeller: ~100 lofted cross-sections per body, welded area-weighted smooth normals, lathed tyres (bulged sidewall + tread grooves), deep-dish 5-twin-spoke rims, brake discs, panel-gap seams, handles, mirrors, plates, exhaust tips, wheel-well liners.
- renderer.js WORLD_FS: negative vertex alpha = material code (-1 clearcoat paint w/ flake + fresnel, -2 glass, -3 chrome, -4 rubber, -5 satin metal) with fake env reflection (envRefl), sun glint and night lamp glints.
- LOD: buildVehicle(..., {lod:0.3}) -> ~3.3k body / 654 wheel tris (full: ~22.7k / 3.7k). Traffic + parked player car swap to LOD beyond 30 m. SwiftShader fps 0.5 -> 1.5.
- tests: car 16/16, npc 11/11 (talk check now waits for typewriter text), e2e 21/21, save 24/24. New: tests/car_shot.mjs (showroom montage), tests/lod_check.mjs, tests/run1.sh, tests/bg.sh (background runner — long runs were killing the sandbox).
- Not verified: real-GPU fps, how it actually looks on cam's screen (could not view the final renders, pixel stats only).
- Next: rain + wet roads (uWet already in shader), WebAudio synth (engine/horn/rain/ambience/footsteps), bigger world.

## M3-wip9 — Rain, storms, wet roads (DONE)
- js/world/weather.js (new): Weather class. Deterministic daily forecast (~60% of days get one shower, 1.2–4 game hours, between 09:00 and 18:00). Cloud cover → rain → ground wetness, with smooth ramps; ground dries ~90 s after the rain stops. `?weather=rain|storm|clear` URL override.
- Storm look: greyed sky/fog, dimmer sun, thicker fog (lighter at night so streetlamps still read), slight exposure lift.
- renderer.js: GPU rain (7000 camera-following streaks, additive, density follows rain strength, near/far fade); wet-ground shader on non-vehicle surfaces: darkened albedo, value-noise puddles, animated raindrop ripples, Fresnel sky reflection with a water-film floor, sun glint, stretched streetlamp reflections at night.
- main.js: weather.update in tick, weather.apply after time of day; exposed in the test hook.
- Tests: tests/rain_shot.mjs 10/10 (storm vs same-storm dry road isolates the wet shader: night sd 33→44, max 189→222). Regressions: car 16/16, npc 11/11, save 24/24, e2e 21/21 (186 s). New tests/regress.sh runs tests one at a time in the background.
- Next: wip10 audio (WebAudio synth), then houses/map realism + bigger world.

## M3-wip10: animated menu + settings (DONE, tests below)
- js/ui/cinematic.js (new): title fly-through, 6 shots (dawn Asahi-dori, morning Minato, aerial orbit, golden-hour depot, storm night, late night lane), each with its own time of day + forced weather, dip-to-black between shots, captions. Stops on leaving the title and restores ?weather / forecast.
- js/ui/menu.js rewrite: same API + data-act / data-set names. Letterbox bars, drifting petals, rotating sun rays, staggered title letters, sign slide-ins + shine. Settings tabs: Controls (sensitivity, invert Y, first-person), Graphics (Low/Medium/High/Ultra + description, FOV 50-100, FPS counter), Comfort (reduce motion). New defaults fpv:false, quality:'high', fov:65.
- renderer.js: QUALITY presets + setQuality() (resolution scale, shadow size, post on/off, rain density, draw distance, car LOD distance). Ultra = 150% supersampled, 4K shadows, 320 m draw, 12k rain.
- camera.js: first person (eye height 1.62 + head bob on foot; right-hand-drive cockpit in the car with free look). V toggles in game.
- main.js: settings wiring, V key, cockpit camera, chunk culling uses r.drawDist, title uses the cinematic clock.
- css/menu.css rewrite (keeps reduced-motion rules).
- tests/menu_shot.mjs (port 8135): 21/21. Shots: menu_title.png, menu_title2.png, menu_settings.png, fpv_foot.png, fpv_car.png.
- Next: wip11 houses/map realism + bigger world, wip12 audio.

## M3-wip11: houses + world realism pass (DONE, tests below)
- renderer.js WORLD_FS: material codes for static geometry (vertex alpha -0.05*id: plaster, kawara tile, wood, block, asphalt, glass, concrete, metal, grass) with per-material roughness, procedural surface detail (grain, tile courses, mortar, aggregate), fresnel + env reflection on glass, wet-aware.
- neighborhood.js / geometry.js: houses rebuilt with framed + mullioned windows, sills, deeper eaves, gutters, AC units, varied materials; night windows only partly lit, flicker cur = 0.92 + 0.3*sin.
- js/data/glyphs.js (baked from Noto Sans JP Bold by tests/bake_glyphs.py): 182 glyphs, 4103 rects, for real kanji/kana signs drawn as geometry.
- js/world/tokyo.js (new, NOT wired in yet): neon Shinjuku-style district east of town (Yasukuni-dori avenue, Kabukicho gate, scramble crossing, Omoide Yokocho lantern alleys, JR viaduct + Ogado bridge, konbini, pachinko, koban, vertical signs, billboards, big screen, skyline). Node smoke build: 62 chunks, ~490k verts, 461 coloured lamps, 127 shops, 0 NaN.
- house_shot.mjs (port 8134): 7/7, detail +13-36% vs wip10; night warm windows 0.11%.
- Test fixes (timing only, game logic unchanged): car.mjs headlight check waits for frames; save.mjs second quit click fires directly (slow SwiftShader frames let the 5 s confirm expire during Playwright's stability wait).
- Regressions: car 16/16, npc 11/11, e2e 21/21, rain_shot 10/10, menu_shot 21/21, save 24/24.
- Next: wire Tokyo in (east wall gap, far flag, 16 coloured lamp slots in renderer), traffic/crowds/jobs downtown, then audio.


## M3-wip12: Tokyo (Shinjuku-at-night district) wired in

**What changed**
- `js/world/tokyo.js` is now built by `neighborhood.js` ("Lighting up Shinjuku" on the loading bar). District spans x 82.2..270, z -104..104, east of the town.
- Town east wall has a 7.4 m gap at z 0 (Asahi-dori) that leads onto Yasukuni-dori; the east hedge leaves a matching opening. Side hedges fixed (were rotated 90 deg, looked like comb teeth).
- World bounds are per-axis now (`world.bounds`); the car clamp uses them, so you can drive into Tokyo.
- Coloured lights: 16 lamp slots (8 on Low) with a colour per lamp (`[x,y,z,w,r,g,b]`); neon pinks/cyans/greens light walls, the road and the car paint. Headlights are cool white.
- Wet-road reflections: the strongest lamp counts fully, the rest at 35%, then a soft roll-off, so a puddle under a dozen signs no longer clips to white (rain-shot clipping 11.7% -> 3.2%).
- Far-chunk flag widened for Tokyo (skyline beyond x 280 always drawn).

**Tests (wip12)**
- tokyo_shot (new, port 8136): 14/14. Gap open, walls closed, kerb 0.15 walkable, car bounds 270, 127 shops, 462/478 coloured lamps, 16 coloured lamps reaching the shader; avenue/scramble/yokocho/rain/aerial/day shots all render, no console errors.
- car 16/16, npc 11/11 (test now waits for the typewriter instead of a fixed sleep), rain_shot 10/10, save 24/24, menu_shot 21/21.
- e2e: not yet re-run on wip12 at time of packing.
- Perf: not measured on a real GPU. SwiftShader test runs are ~1.7-2x slower than wip11 (menu 152 -> 293 s, save 108 -> 182 s). Tokyo adds ~490k verts. If it's heavy on real hardware, trim chunk (3,-1) (yokocho + viaduct) and window panes first.

**Next**
- e2e + perf A/B on wip12.
- Tokyo life: traffic paths + taxis, crowds, downtown delivery jobs (`world.tokyo.shops`), HUD street names, animated train/big screens/neon flicker, signal cycling.
- Car should respect kerbs (resolve ignores the 0.15 step).
- Audio pass (engine, rain, city ambience, crossing chime).

## M3-wip13a: Shinjuku gameplay (Tokyo jobs + Tokyo traffic)
- Every open Tokyo shop (120; shutters excluded) is a delivery place `shop:<i>` with a door spot (interact r 1.7), a name ("Izakaya 鳥よし", "Hinode Mart"...), a jp label and a street address from TK_ROADS (fallback names for the back streets; yokocho stalls -> Omoide Yokocho).
- Daily board: 5 extra Shinjuku jobs per day from a separate RNG (ids `t<day>-<n>`), spliced into the pool so ~1-2 show on the 6-slot board. Town jobs are unchanged (same RNG, same ids).
  - Supplies: depot -> shop (sake, noodles, karaoke mic, neon transformer, block ice...)
  - Takeout Run: food shop -> house in town
  - Across Shinjuku: shop -> shop
  - Same limit/xp formulas, floor reward 300; they pay well because they're far.
- Traffic: PATHS exported; `lanes()` helper offsets road-centre loops into the left lane. Four Shinjuku loops (tk-a..tk-d) with 7 cars, mostly taxis.
- Tests: new tests/city.mjs (port 8137) 11/11, covering shop places/addresses, the board, a full collect->deliver at a shop, and 7 Tokyo cars moving and staying in lane (max 2.29 m off the centre line). /data/tk_paths.mjs: all 4 loops clear of collision and kerbs. jobs.unit 35/35, save.unit 24/24, car 16/16.
- e2e: the old "cannot leave the town edge" check sprinted into the new Asahi-dori gap. It now tests the wall at z 20, plus a new check that the gap leads into Shinjuku.
- Still not done: Tokyo pedestrians/crowds, audio, car-vs-kerb collision, real-GPU FPS numbers.
