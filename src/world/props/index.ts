import * as THREE from 'three';
import type { GameStateSnapshot, PropModuleResult, TextureBundle } from '../../types';
import { buildWritingDesk } from './WritingDesk';
import { buildTelescope } from './Telescope';
import { buildStarChartStation } from './StarChartStation';
import { buildOrrery } from './Orrery';
import { buildExitDoor } from './ExitDoor';

export {
  buildWritingDesk,
  buildTelescope,
  buildStarChartStation,
  buildOrrery,
  buildExitDoor,
};

export function buildAllProps(textures: TextureBundle): PropModuleResult {
  const group = new THREE.Group();
  group.name = 'ObservatoryHeroProps';

  const modules: PropModuleResult[] = [
    buildWritingDesk(textures),
    buildTelescope(textures),
    buildStarChartStation(textures),
    buildOrrery(textures),
    buildExitDoor(textures),
  ];

  for (const mod of modules) {
    group.add(mod.group);
  }

  const interactables = modules.flatMap((m) => m.interactables);
  const colliders = modules.flatMap((m) => m.colliders);

  const update = (elapsed: number, delta: number, state: Readonly<GameStateSnapshot>): void => {
    for (const mod of modules) {
      mod.update(elapsed, delta, state);
    }
  };

  return {
    group,
    interactables,
    colliders,
    update,
  };
}
