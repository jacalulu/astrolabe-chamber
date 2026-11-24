import * as THREE from 'three';
import type {
  GameStateAPI,
  GameStateSnapshot,
  Interactable,
  InteractionContext,
  SoundEngineAPI,
  UIControllerAPI,
} from '../types';
import type { Controls } from './Controls';

const DEFAULT_MAX_REACH = 3.6;
const FAR_HINT_MAX_DISTANCE = 9.0;
const MAX_CLICK_DRAG_PATH_PX = 10;
const MAX_CLICK_DURATION_MS = 550;

interface PickResult {
  item: Interactable;
  distance: number;
}

export class InteractionSystem {
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2(-999, -999);
  private readonly interactables = new Map<string, Interactable>();
  private readonly interactableList: Interactable[] = [];
  private readonly stationHulls = new Map<string, Interactable>();
  private readonly stationScopedIds = new Set<string>();

  private hovered: Interactable | null = null;
  private hoveredInReach = false;

  // Deliberate click vs pan-drag tracking
  private pointerDownActive = false;
  private pointerDownId: number | null = null;
  private pointerDownTime = 0;
  private pointerDownLastX = 0;
  private pointerDownLastY = 0;
  private cumulativeDragPath = 0;
  private downInteractableId: string | null = null;

  private readonly onPointerDownBound: (e: PointerEvent) => void;
  private readonly onPointerMoveBound: (e: PointerEvent) => void;
  private readonly onPointerUpBound: (e: PointerEvent) => void;
  private readonly onPointerLeaveBound: () => void;
  private readonly onBlurBound: () => void;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.PerspectiveCamera,
    private readonly domElement: HTMLElement,
    private readonly controls: Controls,
    private readonly state: GameStateAPI,
    private readonly audio: SoundEngineAPI,
    private readonly ui: UIControllerAPI
  ) {
    this.onPointerDownBound = this.onPointerDown.bind(this);
    this.onPointerMoveBound = this.onPointerMove.bind(this);
    this.onPointerUpBound = this.onPointerUp.bind(this);
    this.onPointerLeaveBound = () => {
      this.pointer.set(-999, -999);
      this.clearHover();
    };
    this.onBlurBound = () => {
      this.resetPointerPress();
      this.clearHover();
    };

    this.domElement.addEventListener('pointerdown', this.onPointerDownBound);
    window.addEventListener('pointermove', this.onPointerMoveBound);
    window.addEventListener('pointerup', this.onPointerUpBound);
    window.addEventListener('pointercancel', this.onPointerUpBound);
    this.domElement.addEventListener('pointerleave', this.onPointerLeaveBound);
    window.addEventListener('blur', this.onBlurBound);
  }

  public register(items: Interactable[]): void {
    for (const item of items) {
      this.interactables.set(item.id, item);
      this.interactableList.push(item);
      item.object.userData.interactableId = item.id;

      if (item.stationId) {
        this.stationScopedIds.add(item.stationId);
        if (!item.focusOnly && item.focusTarget) {
          this.stationHulls.set(item.stationId, item);
        }
      }
    }
  }

  public listInteractables(): Array<{
    id: string;
    label: string;
    hint: string | null;
    cursor: string | null;
    maxDistance: number;
    stationId: string | null;
    focusOnly: boolean;
    enabled: boolean;
    hasFocusTarget: boolean;
  }> {
    const snap = this.state.get();
    return this.interactableList.map((item) => ({
      id: item.id,
      label: this.resolveLabel(item, snap),
      hint: this.resolveHint(item, snap),
      cursor: item.cursor ?? null,
      maxDistance: item.maxDistance ?? DEFAULT_MAX_REACH,
      stationId: item.stationId ?? null,
      focusOnly: Boolean(item.focusOnly),
      enabled: item.enabled ? item.enabled(snap) : true,
      hasFocusTarget: Boolean(item.focusTarget),
    }));
  }

  private resolveLabel(item: Interactable, snap: Readonly<GameStateSnapshot>): string {
    if (item.getLabel) return item.getLabel(snap);
    return typeof item.label === 'function' ? item.label(snap) : item.label;
  }

  private resolveHint(item: Interactable, snap: Readonly<GameStateSnapshot>): string | null {
    if (item.getHint) return item.getHint(snap) ?? null;
    if (!item.hint) return null;
    return typeof item.hint === 'function' ? item.hint(snap) : item.hint;
  }

  private isWithinReach(item: Interactable, distance: number): boolean {
    if (this.controls.getFocusedStation() !== null) {
      return true;
    }
    const maxReach = item.maxDistance ?? DEFAULT_MAX_REACH;
    return distance <= maxReach;
  }

  public getInteractable(id: string): Interactable | undefined {
    return this.interactables.get(id);
  }

  public createContext(): InteractionContext {
    return {
      state: this.state,
      audio: this.audio,
      ui: this.ui,
      focusOn: (target) => this.controls.focusOn(target),
      getFocusedStation: () => this.controls.getFocusedStation(),
    };
  }

  public triggerById(id: string): boolean {
    const item = this.interactables.get(id);
    if (!item) return false;
    const snap = this.state.get();
    if (item.enabled && !item.enabled(snap)) return false;
    this.executeInteraction(item);
    return true;
  }

  public focusById(id: string | null): boolean {
    if (id === null) {
      this.controls.focusOn(null);
      return true;
    }
    const direct = this.interactables.get(id);
    if (direct?.focusTarget) {
      this.controls.focusOn(direct.focusTarget);
      return true;
    }
    for (const item of this.interactableList) {
      if (item.focusTarget && item.focusTarget.id === id) {
        this.controls.focusOn(item.focusTarget);
        return true;
      }
    }
    return false;
  }

  private executeInteraction(item: Interactable): void {
    const lensWasInstalledBefore = this.state.get().telescopeLensInstalled;
    item.onInteract(this.createContext());
    this.recordDiscovery(item.id, lensWasInstalledBefore);
  }

  private recordDiscovery(id: string, lensWasInstalledBefore: boolean): void {
    const snap = this.state.get();
    if (id === 'desk_logbook' && !snap.hasReadLogbook) {
      this.state.update((s) => {
        s.hasReadLogbook = true;
      });
    } else if (id === 'wall_lunar_almanac' && !snap.hasViewedAlmanac) {
      this.state.update((s) => {
        s.hasViewedAlmanac = true;
      });
    } else if (id === 'wall_star_chart' && !snap.hasViewedStarChart) {
      this.state.update((s) => {
        s.hasViewedStarChart = true;
      });
    } else if (
      id === 'telescope_eyepiece' &&
      lensWasInstalledBefore &&
      !snap.hasLookedThroughTelescope
    ) {
      this.state.update((s) => {
        s.hasLookedThroughTelescope = true;
      });
    }
  }

  private updatePointerFromClient(clientX: number, clientY: number): boolean {
    const rect = this.domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    const nx = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ny = -((clientY - rect.top) / rect.height) * 2 + 1;
    if (nx < -1 || nx > 1 || ny < -1 || ny > 1) {
      this.pointer.set(-999, -999);
      return false;
    }
    this.pointer.set(nx, ny);
    return true;
  }

  private resetPointerPress(): void {
    this.pointerDownActive = false;
    this.pointerDownId = null;
    this.cumulativeDragPath = 0;
    this.downInteractableId = null;
  }

  private onPointerDown(e: PointerEvent): void {
    if (e.button !== 0) return;
    if (this.ui.isModalOpen()) return;

    this.updatePointerFromClient(e.clientX, e.clientY);
    this.pointerDownActive = true;
    this.pointerDownId = e.pointerId;
    this.pointerDownTime = performance.now();
    this.pointerDownLastX = e.clientX;
    this.pointerDownLastY = e.clientY;
    this.cumulativeDragPath = 0;

    const downHit = this.pickInteractable();
    this.downInteractableId = downHit ? downHit.item.id : null;
  }

  private onPointerMove(e: PointerEvent): void {
    if (this.pointerDownActive && e.pointerId === this.pointerDownId) {
      const dx = e.clientX - this.pointerDownLastX;
      const dy = e.clientY - this.pointerDownLastY;
      this.cumulativeDragPath += Math.hypot(dx, dy);
      this.pointerDownLastX = e.clientX;
      this.pointerDownLastY = e.clientY;

      if (this.cumulativeDragPath >= MAX_CLICK_DRAG_PATH_PX || this.controls.isDragging()) {
        this.clearHover();
        this.domElement.style.cursor = 'grabbing';
        return;
      }
    }

    if (e.target === this.domElement) {
      this.updatePointerFromClient(e.clientX, e.clientY);
    } else if (!this.pointerDownActive) {
      this.pointer.set(-999, -999);
      this.clearHover();
    }
  }

  private onPointerUp(e: PointerEvent): void {
    if (!this.pointerDownActive || e.pointerId !== this.pointerDownId) return;

    const elapsedMs = performance.now() - this.pointerDownTime;
    const dragPath = Math.max(this.cumulativeDragPath, this.controls.getCumulativeDragPath());
    const downId = this.downInteractableId;
    this.resetPointerPress();

    if (e.type === 'pointercancel' || e.button !== 0) return;
    if (this.ui.isModalOpen()) return;

    // Bulletproof deliberate-click invariants:
    // 1) cumulative drag path < 4px (any pan permanently cancels click)
    // 2) press duration < 350ms
    // 3) pointer pressed down AND released on the EXACT SAME interactable
    if (dragPath >= MAX_CLICK_DRAG_PATH_PX || this.controls.wasLastPointerDrag()) return;
    if (elapsedMs >= MAX_CLICK_DURATION_MS) return;
    if (downId === null) return;

    if (!this.updatePointerFromClient(e.clientX, e.clientY)) return;
    const upHit = this.pickInteractable();
    if (!upHit || upHit.item.id !== downId) return;

    if (!this.isWithinReach(upHit.item, upHit.distance)) {
      const label = this.resolveLabel(upHit.item, this.state.get());
      this.ui.showToast(`Walk closer to examine ${label}.`, 2200);
      return;
    }

    this.executeInteraction(upHit.item);
  }

  private isOuterStationHull(item: Interactable): boolean {
    return Boolean(item.focusTarget) && !item.focusOnly;
  }

  private pickInteractable(): PickResult | null {
    if (this.pointer.x < -1 || this.pointer.x > 1 || this.pointer.y < -1 || this.pointer.y > 1) {
      return null;
    }

    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.scene.children, true);
    const snap = this.state.get();
    const focusedStation = this.controls.getFocusedStation();
    const isFocused = focusedStation !== null;
    const focusedHasScopedItems =
      focusedStation !== null && this.stationScopedIds.has(focusedStation);
    const maxRayDist = isFocused ? 18 : FAR_HINT_MAX_DISTANCE;

    for (const hit of hits) {
      if (hit.distance > maxRayDist) break;
      const obj = hit.object;
      if (!obj.visible) continue;
      if (obj.userData.noRaycast) continue;
      if (obj instanceof THREE.Points || obj instanceof THREE.Line || obj instanceof THREE.Sprite) {
        continue;
      }

      // Walk up ancestors to resolve the active interactable for current mode (standing vs focused)
      let cur: THREE.Object3D | null = obj;
      let found: Interactable | null = null;
      let fallbackStationHull: Interactable | null = null;
      let blockedByNoRaycast = false;

      while (cur) {
        if (cur.userData?.noRaycast) {
          blockedByNoRaycast = true;
          break;
        }
        const id = cur.userData?.interactableId as string | undefined;
        if (id) {
          const candidate = this.interactables.get(id);
          if (candidate && (!candidate.enabled || candidate.enabled(snap))) {
            if (!isFocused) {
              // Standing / free-roam mode: skip focusOnly sub-parts so every multi-part station
              // acts as ONE unified target (no cursor flickering between rings & pedestal).
              if (candidate.focusOnly) {
                if (candidate.stationId && !fallbackStationHull) {
                  const hull = this.stationHulls.get(candidate.stationId);
                  if (hull && (!hull.enabled || hull.enabled(snap))) {
                    fallbackStationHull = hull;
                  }
                }
              } else {
                found = candidate;
                break;
              }
            } else {
              // Focus Mode: skip outer station hulls so dials, rings, sockets & pickups are cleanly clickable
              if (this.isOuterStationHull(candidate)) {
                // Keep walking / let transparent unified hitboxes pass through below
              } else if (focusedHasScopedItems) {
                if (candidate.stationId === focusedStation) {
                  found = candidate;
                  break;
                }
              } else {
                found = candidate;
                break;
              }
            }
          }
        }
        cur = cur.parent;
      }

      if (blockedByNoRaycast) continue;
      if (found) {
        return { item: found, distance: hit.distance };
      }
      if (!isFocused && fallbackStationHull) {
        return { item: fallbackStationHull, distance: hit.distance };
      }

      // Solid non-interactable geometry occludes objects behind it,
      // while invisible unified hitboxes (transparent + opacity < 0.25) pass rays through in Focus Mode.
      if (obj instanceof THREE.Mesh) {
        const mat = Array.isArray(obj.material) ? obj.material[0] : obj.material;
        if (
          mat &&
          'transparent' in mat &&
          mat.transparent &&
          'opacity' in mat &&
          (mat.opacity as number) < 0.25
        ) {
          continue;
        }
        return null;
      }
    }

    return null;
  }

  public update(_delta: number): void {
    const draggingNow =
      this.controls.isDragging() ||
      (this.pointerDownActive && this.cumulativeDragPath >= MAX_CLICK_DRAG_PATH_PX);

    if (this.ui.isModalOpen() || draggingNow) {
      this.clearHover();
      if (draggingNow && !this.ui.isModalOpen()) {
        this.domElement.style.cursor = 'grabbing';
      }
      return;
    }

    const hit = this.pickInteractable();
    if (!hit) {
      this.clearHover();
      return;
    }

    const inReach = this.isWithinReach(hit.item, hit.distance);
    if (hit.item !== this.hovered || inReach !== this.hoveredInReach) {
      this.hovered = hit.item;
      this.hoveredInReach = inReach;
    }

    const snap = this.state.get();
    const label = this.resolveLabel(hit.item, snap);
    if (inReach) {
      this.ui.setHoverPrompt(label, this.resolveHint(hit.item, snap));
      this.updateHoverCursor(hit.item);
    } else {
      this.ui.setHoverPrompt(label, 'Walk closer to examine');
      this.domElement.style.cursor = 'default';
    }
  }

  private updateHoverCursor(item: Interactable): void {
    const focusedId = this.controls.getFocusedStation();
    if (item.cursor === 'grab') {
      this.domElement.style.cursor = 'grab';
      return;
    }
    if (item.cursor === 'pointer') {
      this.domElement.style.cursor = 'pointer';
      return;
    }
    const isZoomableStation =
      Boolean(item.focusTarget) && focusedId !== item.focusTarget?.id;
    this.domElement.style.cursor = isZoomableStation ? 'zoom-in' : 'pointer';
  }

  private clearHover(): void {
    if (this.hovered) {
      this.hovered = null;
      this.hoveredInReach = false;
      if (!this.controls.isDragging()) {
        this.domElement.style.cursor = '';
      }
      this.ui.setHoverPrompt(null, null);
    }
  }

  public dispose(): void {
    this.clearHover();
    this.domElement.removeEventListener('pointerdown', this.onPointerDownBound);
    window.removeEventListener('pointermove', this.onPointerMoveBound);
    window.removeEventListener('pointerup', this.onPointerUpBound);
    window.removeEventListener('pointercancel', this.onPointerUpBound);
    this.domElement.removeEventListener('pointerleave', this.onPointerLeaveBound);
    window.removeEventListener('blur', this.onBlurBound);
  }
}
