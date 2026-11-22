import * as THREE from 'three';
import type { ColliderBox, FocusTarget } from '../types';

export interface ControlsOptions {
  camera: THREE.PerspectiveCamera;
  domElement: HTMLElement;
  isModalOpen: () => boolean;
  isEscaped: () => boolean;
  onFootstep: () => void;
  onFocusChange: (target: FocusTarget | null) => void;
  onDragLook?: () => void;
  onWalk?: () => void;
}

const EYE_HEIGHT = 1.68;
const PLAYER_RADIUS = 0.36;
const OCTAGON_BOUNDARY = 6.15;
const SPAWN_POS: [number, number, number] = [0, EYE_HEIGHT, 4.55];
const SPAWN_LOOK_AT: [number, number, number] = [0, 1.5, -0.5];
const MIN_PITCH = THREE.MathUtils.degToRad(-72);
const MAX_PITCH = THREE.MathUtils.degToRad(78);
const DRAG_THRESHOLD_PX = 4;

const OCTAGON_NORMALS: Array<{ x: number; z: number }> = [];
for (let i = 0; i < 8; i++) {
  const angle = (i * Math.PI) / 4;
  OCTAGON_NORMALS.push({ x: Math.cos(angle), z: Math.sin(angle) });
}

export class Controls {
  private readonly camera: THREE.PerspectiveCamera;
  private readonly domElement: HTMLElement;
  private readonly options: ControlsOptions;

  private readonly keys = new Set<string>();
  private colliders: ColliderBox[] = [];

  // Standing player pose
  private readonly playerPos = new THREE.Vector3(...SPAWN_POS);
  private readonly velocity = new THREE.Vector3();
  private yaw = 0;
  private pitch = -0.036;
  private targetYaw = 0;
  private targetPitch = -0.036;

  // Head-bob & footsteps
  private bobPhase = 0;
  private lastStepSign = 1;

  // Pointer drag state
  private pointerDown = false;
  private pointerId: number | null = null;
  private pointerStartX = 0;
  private pointerStartY = 0;
  private lastPointerX = 0;
  private lastPointerY = 0;
  private draggedDuringPress = false;
  private lastReleaseWasDrag = false;
  private cumulativeDragPath = 0;
  private invertDrag = false;
  private walkDistanceAccum = 0;

  // Focus mode state
  private activeFocus: FocusTarget | null = null;
  private readonly focusPos = new THREE.Vector3();
  private readonly focusLookAt = new THREE.Vector3();
  private focusBlend = 0; // 0 = standing, 1 = fully focused
  private focusPeekYaw = 0;
  private focusPeekPitch = 0;
  private targetFocusPeekYaw = 0;
  private targetFocusPeekPitch = 0;
  private readonly standSavedPos = new THREE.Vector3();
  private readonly standSavedQuat = new THREE.Quaternion();
  private readonly currentCamPos = new THREE.Vector3(...SPAWN_POS);
  private readonly currentCamQuat = new THREE.Quaternion();
  private readonly euler = new THREE.Euler(0, 0, 0, 'YXZ');
  private readonly tempMatrix = new THREE.Matrix4();
  private readonly tempQuat = new THREE.Quaternion();
  private readonly tempQuatPeek = new THREE.Quaternion();
  private readonly tempEulerPeek = new THREE.Euler(0, 0, 0, 'YXZ');
  private readonly tempForward = new THREE.Vector3();
  private readonly tempRight = new THREE.Vector3();
  private readonly tempMove = new THREE.Vector3();
  private readonly worldUp = new THREE.Vector3(0, 1, 0);

  // Bound event listeners
  private readonly onKeyDownBound: (e: KeyboardEvent) => void;
  private readonly onKeyUpBound: (e: KeyboardEvent) => void;
  private readonly onPointerDownBound: (e: PointerEvent) => void;
  private readonly onPointerMoveBound: (e: PointerEvent) => void;
  private readonly onPointerUpBound: (e: PointerEvent) => void;
  private readonly onContextMenuBound: (e: MouseEvent) => void;
  private readonly onBlurBound: () => void;

  constructor(options: ControlsOptions) {
    this.camera = options.camera;
    this.domElement = options.domElement;
    this.options = options;

    this.setStandingLookAt(new THREE.Vector3(...SPAWN_LOOK_AT));
    this.syncCameraImmediate();

    this.onKeyDownBound = this.onKeyDown.bind(this);
    this.onKeyUpBound = this.onKeyUp.bind(this);
    this.onPointerDownBound = this.onPointerDown.bind(this);
    this.onPointerMoveBound = this.onPointerMove.bind(this);
    this.onPointerUpBound = this.onPointerUp.bind(this);
    this.onContextMenuBound = (e: MouseEvent) => e.preventDefault();
    this.onBlurBound = () => {
      this.keys.clear();
      this.pointerDown = false;
      this.pointerId = null;
    };

    window.addEventListener('keydown', this.onKeyDownBound);
    window.addEventListener('keyup', this.onKeyUpBound);
    window.addEventListener('blur', this.onBlurBound);
    this.domElement.addEventListener('pointerdown', this.onPointerDownBound);
    window.addEventListener('pointermove', this.onPointerMoveBound);
    window.addEventListener('pointerup', this.onPointerUpBound);
    window.addEventListener('pointercancel', this.onPointerUpBound);
    this.domElement.addEventListener('contextmenu', this.onContextMenuBound);
  }

  public setColliders(colliders: ColliderBox[]): void {
    this.colliders = colliders;
  }

  public addColliders(colliders: ColliderBox[]): void {
    this.colliders.push(...colliders);
  }

  public getFocusedStation(): string | null {
    return this.activeFocus?.id ?? null;
  }

  public isFocused(): boolean {
    return this.activeFocus !== null;
  }

  public isDragging(): boolean {
    return this.pointerDown && this.draggedDuringPress;
  }

  public wasLastPointerDrag(): boolean {
    return this.lastReleaseWasDrag;
  }

  public getCumulativeDragPath(): number {
    return this.cumulativeDragPath;
  }

  public isInvertDrag(): boolean {
    return this.invertDrag;
  }

  public setInvertDrag(inverted: boolean): void {
    this.invertDrag = inverted;
  }

  public isMovingOrTransitioning(): boolean {
    if (this.keys.size > 0 || this.pointerDown) return true;
    if (this.velocity.lengthSq() > 0.002) return true;
    if (Math.abs(this.targetYaw - this.yaw) > 0.0008) return true;
    if (Math.abs(this.targetPitch - this.pitch) > 0.0008) return true;
    if (Math.abs(this.targetFocusPeekYaw - this.focusPeekYaw) > 0.0008) return true;
    if (Math.abs(this.targetFocusPeekPitch - this.focusPeekPitch) > 0.0008) return true;
    const targetBlend = this.activeFocus ? 1 : 0;
    if (Math.abs(this.focusBlend - targetBlend) > 0.001) return true;
    return false;
  }

  public focusOn(target: FocusTarget | null): void {
    if (target) {
      if (!this.activeFocus) {
        this.standSavedPos.copy(this.currentCamPos);
        this.standSavedQuat.copy(this.currentCamQuat);
      }
      this.activeFocus = target;
      this.focusPos.copy(target.position);
      this.focusLookAt.copy(target.lookAt);
      this.focusPeekYaw = 0;
      this.focusPeekPitch = 0;
      this.targetFocusPeekYaw = 0;
      this.targetFocusPeekPitch = 0;
      this.velocity.set(0, 0, 0);
      this.options.onFocusChange(target);
    } else if (this.activeFocus !== null) {
      this.activeFocus = null;
      this.focusPeekYaw = 0;
      this.focusPeekPitch = 0;
      this.targetFocusPeekYaw = 0;
      this.targetFocusPeekPitch = 0;
      this.options.onFocusChange(null);
    }
  }

  public setCameraDirect(
    pos: [number, number, number] | THREE.Vector3,
    lookAt: [number, number, number] | THREE.Vector3
  ): void {
    if (this.activeFocus) {
      this.activeFocus = null;
      this.options.onFocusChange(null);
    }
    this.focusBlend = 0;
    this.velocity.set(0, 0, 0);

    const p = Array.isArray(pos) ? new THREE.Vector3(pos[0], pos[1], pos[2]) : pos.clone();
    const l = Array.isArray(lookAt)
      ? new THREE.Vector3(lookAt[0], lookAt[1], lookAt[2])
      : lookAt.clone();

    this.playerPos.copy(p);
    this.setStandingLookAt(l);
    this.syncCameraImmediate();
  }

  public resetToSpawn(): void {
    this.walkDistanceAccum = 0;
    this.setCameraDirect(SPAWN_POS, SPAWN_LOOK_AT);
  }

  private setStandingLookAt(target: THREE.Vector3): void {
    const dir = target.clone().sub(this.playerPos).normalize();
    const yaw = Math.atan2(-dir.x, -dir.z);
    const pitch = THREE.MathUtils.clamp(
      Math.asin(THREE.MathUtils.clamp(dir.y, -0.999, 0.999)),
      MIN_PITCH,
      MAX_PITCH
    );
    this.yaw = yaw;
    this.targetYaw = yaw;
    this.pitch = pitch;
    this.targetPitch = pitch;
  }

  private syncCameraImmediate(): void {
    this.currentCamPos.copy(this.playerPos);
    this.euler.set(this.pitch, this.yaw, 0, 'YXZ');
    this.currentCamQuat.setFromEuler(this.euler);
    this.camera.position.copy(this.currentCamPos);
    this.camera.quaternion.copy(this.currentCamQuat);
    this.camera.updateMatrixWorld();
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (this.options.isModalOpen()) return;

    if (e.code === 'Escape') {
      if (this.activeFocus) {
        e.preventDefault();
        this.focusOn(null);
      }
      return;
    }

    if (
      e.code === 'KeyW' ||
      e.code === 'KeyA' ||
      e.code === 'KeyS' ||
      e.code === 'KeyD' ||
      e.code === 'ArrowUp' ||
      e.code === 'ArrowDown' ||
      e.code === 'ArrowLeft' ||
      e.code === 'ArrowRight'
    ) {
      // Pressing any movement key while zoomed into Focus Mode steps smoothly back out to free-roam
      if (this.activeFocus) {
        this.focusOn(null);
      }
      this.keys.add(e.code);
    }
  }

  private onKeyUp(e: KeyboardEvent): void {
    this.keys.delete(e.code);
  }

  private onPointerDown(e: PointerEvent): void {
    if (this.options.isModalOpen()) return;
    if (e.button !== 0 && e.button !== 2) return;

    this.pointerDown = true;
    this.pointerId = e.pointerId;
    this.pointerStartX = e.clientX;
    this.pointerStartY = e.clientY;
    this.lastPointerX = e.clientX;
    this.lastPointerY = e.clientY;
    this.draggedDuringPress = false;
    this.lastReleaseWasDrag = false;
    this.cumulativeDragPath = 0;
  }

  private onPointerMove(e: PointerEvent): void {
    if (!this.pointerDown || e.pointerId !== this.pointerId) return;
    if (this.options.isModalOpen()) return;

    const dx = e.clientX - this.lastPointerX;
    const dy = e.clientY - this.lastPointerY;
    this.lastPointerX = e.clientX;
    this.lastPointerY = e.clientY;

    this.cumulativeDragPath += Math.hypot(dx, dy);

    if (!this.draggedDuringPress && this.cumulativeDragPath >= DRAG_THRESHOLD_PX) {
      this.draggedDuringPress = true;
      this.domElement.style.cursor = 'grabbing';
      this.options.onDragLook?.();
    }

    if (!this.draggedDuringPress) return;

    // Default (invertDrag = false): natural 3D panorama grab-and-drag on laptop trackpad/mouse.
    // Dragging right pans the scene right under your pointer; dragging down pulls the dome into view.
    // When invertDrag = true: classic FPS look direction.
    const sign = this.invertDrag ? -1 : 1;
    const sensitivity = 0.0038;
    if (this.activeFocus) {
      const maxYawPeek = THREE.MathUtils.degToRad(16);
      const maxPitchPeek = THREE.MathUtils.degToRad(11);
      this.targetFocusPeekYaw = THREE.MathUtils.clamp(
        this.targetFocusPeekYaw + sign * dx * sensitivity * 0.65,
        -maxYawPeek,
        maxYawPeek
      );
      this.targetFocusPeekPitch = THREE.MathUtils.clamp(
        this.targetFocusPeekPitch + sign * dy * sensitivity * 0.65,
        -maxPitchPeek,
        maxPitchPeek
      );
    } else {
      this.targetYaw += sign * dx * sensitivity;
      this.targetPitch = THREE.MathUtils.clamp(
        this.targetPitch + sign * dy * sensitivity,
        MIN_PITCH,
        MAX_PITCH
      );
    }
  }

  private onPointerUp(e: PointerEvent): void {
    if (!this.pointerDown || e.pointerId !== this.pointerId) return;
    this.lastReleaseWasDrag =
      this.draggedDuringPress || this.cumulativeDragPath >= DRAG_THRESHOLD_PX;
    this.pointerDown = false;
    this.pointerId = null;
    this.draggedDuringPress = false;
    this.domElement.style.cursor = '';
  }

  public update(delta: number): void {
    const dt = Math.min(delta, 0.08);
    const modalOpen = this.options.isModalOpen();

    // Smooth look damping
    const lookSmooth = 1 - Math.exp(-15 * dt);
    this.yaw += (this.targetYaw - this.yaw) * lookSmooth;
    this.pitch += (this.targetPitch - this.pitch) * lookSmooth;

    this.focusPeekYaw += (this.targetFocusPeekYaw - this.focusPeekYaw) * lookSmooth;
    this.focusPeekPitch += (this.targetFocusPeekPitch - this.focusPeekPitch) * lookSmooth;

    // Movement when standing and no modal open (allow stepping away promptly as focus releases)
    let speedNorm = 0;
    if (!this.activeFocus && !modalOpen && this.focusBlend < 0.45) {
      let forwardInput = 0;
      let rightInput = 0;
      if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) forwardInput += 1;
      if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) forwardInput -= 1;
      if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) rightInput += 1;
      if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) rightInput -= 1;

      this.tempForward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
      this.tempRight.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));

      this.tempMove.set(0, 0, 0);
      this.tempMove.addScaledVector(this.tempForward, forwardInput);
      this.tempMove.addScaledVector(this.tempRight, rightInput);

      const maxSpeed = 2.85;
      if (this.tempMove.lengthSq() > 0.001) {
        this.tempMove.normalize().multiplyScalar(maxSpeed);
      }

      const accel = 1 - Math.exp(-11 * dt);
      this.velocity.x += (this.tempMove.x - this.velocity.x) * accel;
      this.velocity.z += (this.tempMove.z - this.velocity.z) * accel;

      this.playerPos.x += this.velocity.x * dt;
      this.playerPos.z += this.velocity.z * dt;

      this.resolveCollisions();

      const horizSpeed = Math.hypot(this.velocity.x, this.velocity.z);
      speedNorm = Math.min(horizSpeed / maxSpeed, 1);

      if (horizSpeed > 0.15) {
        this.walkDistanceAccum += horizSpeed * dt;
        if (this.walkDistanceAccum >= 0.18) {
          this.options.onWalk?.();
        }
      }

      if (speedNorm > 0.12) {
        this.bobPhase += dt * (6.8 + speedNorm * 2.4);
        const stepSign = Math.sin(this.bobPhase) >= 0 ? 1 : -1;
        if (stepSign !== this.lastStepSign && stepSign < 0) {
          this.options.onFootstep();
        }
        this.lastStepSign = stepSign;
      }
    } else {
      const decel = 1 - Math.exp(-12 * dt);
      this.velocity.multiplyScalar(1 - decel);
    }

    // Standing camera pose (with subtle head-bob)
    const bobY = speedNorm > 0.05 ? Math.sin(this.bobPhase * 2) * 0.022 * speedNorm : 0;
    const standPos = new THREE.Vector3(
      this.playerPos.x,
      this.playerPos.y + bobY,
      this.playerPos.z
    );
    this.euler.set(this.pitch, this.yaw, 0, 'YXZ');
    const standQuat = new THREE.Quaternion().setFromEuler(this.euler);

    // Focus transition blend
    const targetBlend = this.activeFocus ? 1 : 0;
    const focusRate = 1 - Math.exp(-8.5 * dt);
    this.focusBlend += (targetBlend - this.focusBlend) * focusRate;
    if (Math.abs(this.focusBlend - targetBlend) < 0.0005) {
      this.focusBlend = targetBlend;
    }

    if (this.focusBlend > 0.0001) {
      this.tempMatrix.lookAt(this.focusPos, this.focusLookAt, this.worldUp);
      this.tempQuat.setFromRotationMatrix(this.tempMatrix);

      // Apply subtle peek offset while focused
      if (Math.abs(this.focusPeekYaw) > 0.0001 || Math.abs(this.focusPeekPitch) > 0.0001) {
        this.tempEulerPeek.set(this.focusPeekPitch, this.focusPeekYaw, 0, 'YXZ');
        this.tempQuatPeek.setFromEuler(this.tempEulerPeek);
        this.tempQuat.multiply(this.tempQuatPeek);
      }

      const smoothT = this.focusBlend * this.focusBlend * (3 - 2 * this.focusBlend);
      this.currentCamPos.lerpVectors(standPos, this.focusPos, smoothT);
      this.currentCamQuat.slerpQuaternions(standQuat, this.tempQuat, smoothT);
    } else {
      this.currentCamPos.copy(standPos);
      this.currentCamQuat.copy(standQuat);
    }

    this.camera.position.copy(this.currentCamPos);
    this.camera.quaternion.copy(this.currentCamQuat);
  }

  private resolveCollisions(): void {
    const escaped = this.options.isEscaped();

    // 1. Resolve prop & architectural AABB colliders (circle vs AABB)
    for (const box of this.colliders) {
      const closestX = THREE.MathUtils.clamp(this.playerPos.x, box.minX, box.maxX);
      const closestZ = THREE.MathUtils.clamp(this.playerPos.z, box.minZ, box.maxZ);
      const dx = this.playerPos.x - closestX;
      const dz = this.playerPos.z - closestZ;
      const distSq = dx * dx + dz * dz;

      if (distSq < PLAYER_RADIUS * PLAYER_RADIUS) {
        if (distSq > 1e-6) {
          const dist = Math.sqrt(distSq);
          const overlap = PLAYER_RADIUS - dist;
          this.playerPos.x += (dx / dist) * overlap;
          this.playerPos.z += (dz / dist) * overlap;
        } else {
          const penLeft = Math.abs(this.playerPos.x - box.minX);
          const penRight = Math.abs(box.maxX - this.playerPos.x);
          const penMinZ = Math.abs(this.playerPos.z - box.minZ);
          const penMaxZ = Math.abs(box.maxZ - this.playerPos.z);
          const minPen = Math.min(penLeft, penRight, penMinZ, penMaxZ);
          if (minPen === penLeft) this.playerPos.x = box.minX - PLAYER_RADIUS;
          else if (minPen === penRight) this.playerPos.x = box.maxX + PLAYER_RADIUS;
          else if (minPen === penMinZ) this.playerPos.z = box.minZ - PLAYER_RADIUS;
          else this.playerPos.z = box.maxZ + PLAYER_RADIUS;
        }
      }
    }

    // 2. Octagonal rotunda boundary (allowing open South doorway balcony when escaped)
    const inSouthDoorway =
      escaped && Math.abs(this.playerPos.x) < 1.0 && this.playerPos.z > 5.5;

    if (inSouthDoorway) {
      this.playerPos.z = Math.min(this.playerPos.z, 10.4);
      if (this.playerPos.z > 6.4) {
        this.playerPos.x = THREE.MathUtils.clamp(this.playerPos.x, -2.0, 2.0);
      } else {
        this.playerPos.x = THREE.MathUtils.clamp(this.playerPos.x, -0.95, 0.95);
      }
      return;
    }

    for (const n of OCTAGON_NORMALS) {
      if (escaped && n.z > 0.99 && Math.abs(this.playerPos.x) < 0.95) {
        continue;
      }
      const proj = this.playerPos.x * n.x + this.playerPos.z * n.z;
      if (proj > OCTAGON_BOUNDARY) {
        const push = proj - OCTAGON_BOUNDARY;
        this.playerPos.x -= n.x * push;
        this.playerPos.z -= n.z * push;
      }
    }
  }

  public dispose(): void {
    window.removeEventListener('keydown', this.onKeyDownBound);
    window.removeEventListener('keyup', this.onKeyUpBound);
    window.removeEventListener('blur', this.onBlurBound);
    this.domElement.removeEventListener('pointerdown', this.onPointerDownBound);
    window.removeEventListener('pointermove', this.onPointerMoveBound);
    window.removeEventListener('pointerup', this.onPointerUpBound);
    window.removeEventListener('pointercancel', this.onPointerUpBound);
    this.domElement.removeEventListener('contextmenu', this.onContextMenuBound);
  }
}
