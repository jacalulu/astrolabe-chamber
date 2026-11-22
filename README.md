# The Astrolabe Chamber

*Royal Observatory, 1898* — an atmospheric 3D Victorian celestial observatory escape room built with **TypeScript**, **Three.js**, and **Vite**.

## Premise

You answered Master Astronomer Dr. Alistair Vance's urgent midnight telegram to the Royal Observatory — only to find him vanished and the ironbound Astrolabe Door bolted behind you. Explore the grand octagonal rotunda beneath a star-filled alpine sky, examine Dr. Vance's logbook and celestial charts, recover three missing brass-and-gemstone artifacts, and align five interlocking astronomical instruments to unseal the door before midnight.

## Highlights

- **100% Procedural PBR Assets & Lighting**: Custom Canvas PBR textures (`map`, `bumpMap`, `roughnessMap`) for dark walnut wainscoting, inlaid obsidian-emerald marble, hammered verdigris copper dome, brushed astronomical brass, and gold-engraved zodiac/star plates, lit by a custom HDR `PMREMGenerator` light probe, volumetric moonlight shafts, and filmic ACES + subtle `UnrealBloomPass` post-processing.
- **Five Interlocking 3D Mechanical Puzzles**:
  1. **Writing Desk & 4-Dial Lunar Cryptex Box** — Decode Dr. Vance's logbook and the Framed Lunar Almanac to unlock the Sapphire Objective Lens.
  2. **Great Equatorial Telescope** — Fit the Sapphire Lens into the objective housing, dial the equatorial coordinates, and observe the northern star triad through the optical eyepiece.
  3. **Backlit Star Chart Lectern & Curio Cabinet** — Trace the celestial triad across crystal star-nodes to unlock the Curio Cabinet and retrieve the Saturn Brass Gear.
  4. **Central Brass Orrery** — Seat Saturn's Gear on the exposed brass spindle and align Earth, Mars, and Saturn to the Great Conjunction to open the radiant Sun core and reveal the Obsidian Star Key.
  5. **Grand Arched Astrolabe Exit Door** — Insert the Obsidian Star Key into the central hub and align all three engraved brass rings to unseal the doors onto the moonlit alpine balcony.
- **Procedural Web Audio Synthesizer**: Synthesized ambient midnight mountain wind, 1 Hz brass regulator clock escapement, and tactile mechanical foley (gears, latches, chimes, oak doors, footsteps) with zero external audio files.
- **Battery-Conscious Rendering**: DPR capped at `1.5×`, throttled shadow-map updates, automatic pause when the browser tab is hidden, and adaptive 60 fps active / ~18 fps idle & modal cadence.

## Controls

| Action | Input |
| --- | --- |
| Walk | `W A S D` or Arrow Keys |
| Look Around 360° | Click & Drag (toggle *Invert Drag Look* in the Controls menu) |
| Inspect / Interact | Short Click on reachable stations, dials, rings, sockets, or charts |
| Equip Artifact | Click a slot in the bottom Artifact Tray (`1`–`3`) |
| Step Back from Focus Mode | `Esc`, `W A S D`, or the top `← Step Back` button |

## Getting Started

```bash
npm install
npm run dev
```

Open the local URL printed by Vite (typically `http://localhost:5173`).

### Production Build

```bash
npm run build
npm run preview
```

## Project Structure

```text
src/
├── main.ts                  # Bootstrap, smart render loop & debug hooks
├── types.ts                 # Shared state, interaction & texture contracts
├── engine/
│   ├── SceneManager.ts      # WebGLRenderer, camera, shadows & resize handling
│   ├── PostProcessing.ts    # EffectComposer, UnrealBloom & filmic color grade
│   ├── Controls.ts          # Octagonal walking, collision, drag-look & Focus Mode
│   ├── InteractionSystem.ts # Unified station vs focus-subpart raycasting & click guard
│   └── GameState.ts         # Reactive game state store, inventory & timer
├── assets/
│   ├── ProceduralTextures.ts# Procedural PBR material maps & astronomical plates
│   └── EnvironmentMap.ts    # Procedural observatory HDR PMREM reflection probe
├── world/
│   ├── ObservatoryRoom.ts   # 6.8m octagonal rotunda, bookcases, dome & wall instruments
│   ├── Atmosphere.ts        # GLSL night sky, crescent moon, god-rays & dust motes
│   └── props/               # WritingDesk, Telescope, StarChartStation, Orrery, ExitDoor
├── ui/
│   ├── HUD.ts               # Midnight Summons, Lead ribbon, Focus bar & Artifact tray
│   ├── PuzzleOverlays.ts    # Native <dialog> Logbook, Almanac, Star Chart, Eyepiece & Journal
│   └── styles.css           # Victorian brass & obsidian-glass styling
└── audio/
    └── SoundEngine.ts       # Procedural Web Audio ambience & mechanical foley
```
