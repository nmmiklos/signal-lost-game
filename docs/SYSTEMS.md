# SIGNAL LOST: procedural stealth contracts

Shared module contracts for the second implementation pass. All positions below are plain `{x,z}` unless explicitly Three.js Vector3. No module imports main.js. No external assets. Small, independent modules; no framework.

## Layout: src/layout.js

`generateLayout(seed)` returns `{seed,bounds,spawn,exit,enemySpawn,rooms,obstacles,tasks,hidingSpots,patrolRoutes}`. Deterministic integer/string seed. Bounds `minX:-15,maxX:15,minZ:-25,maxZ:5`. A 3x3 pressure-room grid: centers x=-10,0,10 and z=0,-10,-20. Spawn `{x:0,z:2}`, exit `{x:0,z:3.6}`, enemySpawn in a distant room. Internal walls have doorways >=3 units; a randomized spanning tree guarantees connectivity, with extra loop doors. Obstacles plain Box3-like `{min:{x,y,z},max:{x,y,z},kind:'wall'|'locker'|'crate'}`. All clearance/path tests use creature radius 0.46, player 0.32. Spawn, objective approach positions, hiding exits and enemy spawn must be clear.

`tasks`: three objects `{id,kind,title,position,approach,duration}` using exactly one each `valve`, `fuse`, `uplink`; distributed in different rooms away from spawn. Rendering faces +Z; approach = position z+1.5. `hidingSpots`: 4-6 `{id,position,exitPosition,rotation}`; position inside a locker, exitPosition outside its front (+Z), rotation=0. Locker collider covers position, not exitPosition. `rooms`: `{id,x,z,width:10,depth:10}`. `patrolRoutes`: 2 arrays of waypoints, each closed (last-to-first must also be collision-safe) with >=4 points; every segment clearLine(...,obstacles,0.46). Use existing findPath for connected routes. All route points outside inflated obstacles. Export no Three.js dependency.

## Environment: src/world.js

`createWorld(scene,layout)` returns `{root,spawn:Vector3,exit:{position:Vector3,mesh},tasks:[{...layoutTask,position:Vector3,mesh,light}],hidingSpots:layout.hidingSpots,obstacles:layout.obstacles,bounds:layout.bounds,update(dt,time,completedIds:Set),dispose()}`. Builds procedural industrial station from descriptors. No second independent layout logic. Signage and visuals distinguish valve/fuse/uplink. Lockers visibly usable, slit and HIDE marker. Perimeter geometry outside bounds. Preserve atmospheric industrial art direction and portholes. Reasonable light count and drawcalls. dispose removes root and disposes unique geometry/materials/textures. Geometry does not add invisible obstacles absent from layout.

## AI: src/ai.js

Pure JS. `createBrain(layout)` returns mutable `{position:{x,z},yaw,stage,seesPlayer,...}` starting at enemySpawn, patrol stage. `updateBrain(brain,dt,{player,hidden,noises,obstacles,bounds,patrolRoutes,completed})` mutates and returns `{stage,seesPlayer,danger,caught,moving}`. `blindBrain(brain,seconds)` applies 5s blindness, slow movement, no vision/catch. Stages `patrol`, `notice`, `search`, `chase`, `blinded`. Follow generated closed patrol routes; route to points via findPath and moveWithCollisions (radius .46), never move straight through a wall. Hearing events `{position,radius,kind}`; wall attenuation, no global player knowledge. Sight forward cone + close peripheral range with clearLine. Notice investigates last heard position. Chase only follows visible player or saved last-seen position; losing sight leads search then patrol. Hidden players cannot be seen/caught; parent prohibits entering a locker while visibly watched. Blindness permits a getaway. No timers, DOM, Three.js, audio or RNG nondeterminism required.

## Objectives and hiding: src/objectives.js

Pure JS. `createObjectives(tasks)` returns mutable state; `updateObjectives(state,dt,{targetId,holding,pressed})` returns `{completed:[],noises:[]}` (new completions and noise events this tick). Task interactions: valve hold for duration (~4s); fuse THREE distinct E presses (not frames, release required); uplink E starts unattended ~8s transmission, progresses even when not targeted, emits periodic noise. State has `.tasks` array, each descriptor plus `{progress:0..1,complete:false,started:false,steps:0}`. `taskPrompt(task)` returns compact interaction text. `nearestHidingSpot(player,spots,range=1.8)` returns descriptor or null by distance to exitPosition. `canEnterHiding({seesPlayer,stage,distance})` returns false while enemy sees player nearby (<=14), true when occluded/blinded. Do not own camera or key input. Noise event radius 8-14 according task. Repair completion refills one flash charge (parent).

## Flashbang: src/flashbang.js

`createFlashbang(scene)` returns `{throw(origin:Vector3,direction:Vector3):boolean,update(dt,{obstacles}):Array<blast>,reset(),dispose()}`. Blast `{position:{x,y,z},radius:9,duration:5}`. Throw visible physical grenade; fuse ~1.1s, bounded wall/floor bounce, one short light pulse, no full-screen strobe. Parent controls charges (3 max), cooldown, sound, noise radius26, and checks clearLine and range before blindBrain. No flashlight beam remains. Respect reduced-motion preference for lightpulse. No imports except three and logic if needed. Avoid obsolete grenade meshes after completion.

## Sound: src/audio.js

Keep existing Soundscape API. Add cues `flash`, `throw`, `notice`, `chase`, `hide`, `task`, `fuse`, `uplink`, `valve`; optional `stage`, `hidden`, `crouched` update fields. No early AudioContext before user gesture. Safe gains. Sound-driven stealth has audible stage transitions and low crouch footsteps. No file assets.

## UI: index.html, src/style.css

Preserve required IDs menu/start/mute/game/hud/pause/resume/restart-pause/ending/ending-title/ending-description/restart/error/interact/interact-text/hold-fill/crosshair/objective/hint/relay-count. Repurpose `relay-count` as objective count; add `flash-count`, `noise-fill`, `stealth-status`, `seed-value`, `flash-overlay`. Remove battery IDs/labels and F light instructions. Controls F flashbang / C crouch / E interact-hide / WASD / shift. State body classes `.playing`, `.is-hidden`, `.is-crouched`, `.is-danger`; --danger variable. Touch actions forward/backward/left/right/sprint/flash/interact/crouch; parent owns bindings. Tiny HUD, no long explanatory text. Mobile header mute must remain fully in viewport.

## Parent integration: src/main.js, src/logic.js, README.md

Parent owns integrating all modules, regenerating world each new run with a fresh seed, noise events from movement, E rising edges, C toggle, F charges/cooldown. No battery/flashlight gameplay. Crouch slower/quieter; hiding disables movement, muffles audio, restricted but functional view and E exits to clear exitPosition. Enter while enemy not watching; cannot magically vanish in its face. Generated route is only patrol knowledge, noise/vision update targets. Ambient personal fill is allowed, not a weapon. Win once three alternative tasks completed and E at exit. Existing mouse lock fallback retained. Query `?test=1` exposes `window.__game`: run (elapsed,won,lost,hiddenId,crouched,flashCharges,completed:Set), world, camera, creature, brain, objectives, begin/pause/resume/aim, renderer.

## QA

Pure tests for hundreds of layout seeds, safe loop closure, all objectives and locker exits connected. AI tests for sound -> notice, sight -> chase, occlusion -> search, no supernatural tracking, hidden safety, blindness expiry. Objective tests distinct presses/autonomous uplink/hold cancellation. Browser smoke covers all task types, flash use, hiding enter/exit, generated restart, win/loss, drag look, touch/mobile. Do not claim Firefox tested: external launch was blocked by environment. Headless Chromium path may be supplied using PLAYWRIGHT_CHROMIUM_EXECUTABLE.
