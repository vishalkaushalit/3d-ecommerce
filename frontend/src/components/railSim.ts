/**
 * Rail physics, ported from the Garuda 2026 rail (garuda2026.offwg.com/rail).
 *
 * One simulation owns every hanger. Each hanger is a body on a 1D rail with a
 * position, velocity and "home" slot. Shirts are solid: their width depends on
 * how far they are turned (thin edge-on, wide face-on), so turning one shirt to
 * face you, or dragging one into its neighbors, physically pushes the others.
 * Everything is integrated in fixed 240 Hz substeps, so it feels the same at
 * any refresh rate. Nothing here touches React; it is stepped once per frame.
 */

export const REST_YAW = Math.PI / 2; // edge-on, hanging on the rail
export const FACE_YAW = Math.PI; // turned to face the camera
const EDGE_HALF = 0.04; // half the width of a shirt seen edge-on
const FACE_HALF = 0.29; // half the width of a shirt seen face-on
const TILT_LIMIT = 0.9;
const ARM = 0.4; // hook-to-center length of the pendulum
const SUBSTEP = 1 / 240;

export type Hanger = {
  x: number;
  vx: number;
  ax: number;
  home: number;
  tilt: number; // side swing (pendulum) around the hook
  tiltV: number;
  sway: number; // tiny front/back idle sway
  swayV: number;
  yaw: number;
  yawV: number;
  yawTarget: number;
  lift: number;
  pushed: boolean;
  free: boolean;
  seed: number;
};

const createHanger = (x: number, index: number): Hanger => ({
  x,
  vx: 0,
  ax: 0,
  home: x,
  tilt: 0,
  tiltV: 0,
  sway: 0,
  swayV: 0,
  yaw: REST_YAW,
  yawV: 0,
  yawTarget: REST_YAW,
  lift: 0,
  pushed: false,
  free: false,
  seed: index * 1.7 + 0.3,
});

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export class RailSim {
  hangers: Hanger[];
  hovered: Hanger | null = null;
  grabbed: Hanger | null = null;
  selected: Hanger | null = null;
  /** "Sweep": a hand pressed on an empty part of the rail pushes the shirts it meets. */
  hand: { x: number; prev: number } | null = null;
  grabOffset = 0;
  grabTarget = 0;
  /** Yaw of the shirt on the stage (detail view); snaps to front/back when released. */
  stageYaw = FACE_YAW;
  stageYawV = 0;
  spinning = false;
  turnTo: number | null = null;
  /** Extra turn from the page's rotate button. */
  rotationOffset = 0;
  walls = { min: -1.73, max: 1.73 };
  /**
   * true:  Garuda's behavior. A dragged or thrown shirt glides, and it and the
   *        shirts it pushed stay where they stop (that spot becomes their new home).
   * false: after you let go, every shirt springs back to its original slot.
   * The reset button always restores the original layout.
   */
  keepWhereDropped = true;
  t = 0;
  onClack?: (strength: number) => void;

  constructor(homes: number[]) {
    this.hangers = homes.map(createHanger);
  }

  /** New slots (resize, reset). With animate, the shirts glide there. */
  setHomes(homes: number[], animate: boolean) {
    this.hangers.forEach((hanger, index) => {
      hanger.home = homes[index] ?? hanger.home;
      hanger.free = false;
      if (!animate) {
        hanger.x = hanger.home;
        hanger.vx = 0;
      }
    });
  }

  halfWidth(hanger: Hanger) {
    return EDGE_HALF + (FACE_HALF - EDGE_HALF) * Math.pow(Math.abs(Math.cos(hanger.yaw)), 1.4);
  }

  /** The hanger under a point on the rail plane (rail-local x, world y). */
  pick(x: number, y: number, railY: number) {
    if (y > railY + 0.1 || y < railY - 0.9) return null;
    let best: Hanger | null = null;
    let bestDistance = Infinity;
    for (const hanger of this.hangers) {
      if (hanger === this.selected) continue;
      const distance = Math.abs(hanger.x - x);
      if (distance < Math.max(this.halfWidth(hanger), 0.07) && distance < bestDistance) {
        best = hanger;
        bestDistance = distance;
      }
    }
    return best;
  }

  hover(hanger: Hanger | null) {
    this.hovered = this.grabbed || this.selected ? null : hanger;
  }

  grab(hanger: Hanger, x: number) {
    this.grabbed = hanger;
    this.grabOffset = hanger.x - x;
    this.grabTarget = hanger.x;
    this.hovered = null;
  }

  dragTo(x: number) {
    if (this.grabbed) this.grabTarget = x + this.grabOffset;
    if (this.hand) this.hand.x = x;
  }

  sweep(x: number) {
    this.hand = { x, prev: x };
  }

  release() {
    const hanger = this.grabbed;
    if (hanger) {
      // Throw it with the speed it still had toward the finger.
      hanger.vx = clamp(hanger.vx + (this.grabTarget - hanger.x) * 7, -3.2, 3.2);
      hanger.free = this.keepWhereDropped;
    }
    this.grabbed = null;
    this.hand = null;
    for (const other of this.hangers) {
      if (other.pushed) {
        other.free = this.keepWhereDropped;
        other.pushed = false;
      }
    }
  }

  open(hanger: Hanger) {
    const wasFront =
      this.selected !== null &&
      Math.cos(Math.round((this.turnTo ?? this.stageYaw) / Math.PI) * Math.PI) > 0;
    this.selected = hanger;
    this.hovered = null;
    this.stageYawV = 0;
    this.turnTo = null;
    // Start the stage turn from the shirt's current yaw, so it never spins the long way.
    const base = wasFront ? 0 : FACE_YAW;
    this.stageYaw = base + Math.round((hanger.yaw - base) / (2 * Math.PI)) * 2 * Math.PI;
  }

  close() {
    this.selected = null;
    this.turnTo = null;
    this.spinning = false;
  }

  /** Drag on the stage shirt: add spin velocity. */
  spin(velocity: number) {
    this.stageYawV += velocity;
    this.turnTo = null;
  }

  /** Tap on the stage shirt: turn half a turn toward the tapped side. */
  flip(direction: 1 | -1) {
    if (!this.selected) return;
    const nearest = Math.round((this.turnTo ?? this.stageYaw) / Math.PI) * Math.PI;
    this.turnTo = nearest + direction * Math.PI;
  }

  step(delta: number) {
    const elapsed = Math.min(Math.max(delta, 0), 0.05);
    const steps = Math.max(1, Math.ceil(elapsed / SUBSTEP));
    const dt = elapsed / steps;
    for (let i = 0; i < steps; i++) this.substep(dt);
  }

  private substep(dt: number) {
    this.t += dt;
    if (dt <= 0) return;

    // Where each shirt wants to face: edge-on, face-on when hovered, leaning while dragged.
    for (const hanger of this.hangers) {
      if (hanger === this.selected) continue;
      hanger.yawTarget = hanger === this.hovered ? FACE_YAW : REST_YAW;
      if (hanger === this.grabbed) hanger.yawTarget = REST_YAW + clamp(-hanger.vx * 1.2, -0.5, 0.5);
    }

    // Move along the rail.
    for (const hanger of this.hangers) {
      if (hanger === this.selected) continue;
      const previousVelocity = hanger.vx;
      let force = 0;
      if (hanger === this.grabbed) force += 120 * (this.grabTarget - hanger.x) - 21 * hanger.vx;
      else if (!hanger.free) force += 5.5 * (hanger.home - hanger.x) * (this.hand ? 0 : 1);
      hanger.vx += force * dt;
      hanger.vx *= Math.exp(-(hanger === this.grabbed ? 0 : hanger.free ? 1.7 : 3.2) * dt);
      hanger.x += hanger.vx * dt;
      hanger.ax = (hanger.vx - previousVelocity) / dt;
    }

    // A sweeping hand shoves whatever it reaches.
    if (this.hand) {
      const handX = this.hand.x;
      const handVelocity = (handX - this.hand.prev) / dt;
      for (const hanger of this.hangers) {
        if (hanger === this.selected) continue;
        const reach = this.halfWidth(hanger) + 0.012;
        const offset = hanger.x - handX;
        const side = Math.sign(handVelocity || offset || 1);
        if (Math.abs(offset) < reach && Math.sign(offset || 1) === side) {
          hanger.vx = Math.max(Math.abs(hanger.vx), Math.abs(handVelocity)) * side;
          hanger.x = handX + side * reach;
          hanger.pushed = true;
        }
      }
      this.hand.prev = handX;
    }

    // Shirts are solid: separate overlaps and pass momentum along the row.
    const onRail = this.hangers.filter((hanger) => hanger !== this.selected);
    for (let pass = 0; pass < 4; pass++) {
      for (let i = 0; i < onRail.length - 1; i++) {
        const left = onRail[i];
        const right = onRail[i + 1];
        const minimum = this.halfWidth(left) + this.halfWidth(right);
        const distance = right.x - left.x;
        if (distance >= minimum) continue;
        const leftMoves = left === this.grabbed ? 0 : 1;
        const rightMoves = right === this.grabbed ? 0 : 1;
        const total = leftMoves + rightMoves || 1;
        const overlap = minimum - distance;
        left.x -= overlap * (leftMoves / total);
        right.x += overlap * (rightMoves / total);
        const closing = left.vx - right.vx;
        if (closing > 0) {
          const impulse = (1.25 * closing) / total;
          left.vx -= impulse * leftMoves;
          right.vx += impulse * rightMoves;
          if (closing > 0.12 && pass === 0) this.onClack?.(Math.min(1, closing / 1.5));
          if (left === this.grabbed || right === this.grabbed || left.pushed || right.pushed) {
            if (left !== this.grabbed) left.pushed = true;
            if (right !== this.grabbed) right.pushed = true;
          }
          if (left.free || right.free) left.free = right.free = true;
        }
      }
      // Rail ends: stop with a small bounce.
      for (const hanger of onRail) {
        const half = this.halfWidth(hanger);
        const min = this.walls.min + half;
        const max = this.walls.max - half;
        if (hanger.x < min) {
          hanger.x = min;
          if (hanger.vx < 0) {
            if (hanger.vx < -0.2) this.onClack?.(Math.min(1, -hanger.vx / 1.5));
            hanger.vx *= -0.2;
          }
        }
        if (hanger.x > max) {
          hanger.x = max;
          if (hanger.vx > 0) {
            if (hanger.vx > 0.2) this.onClack?.(Math.min(1, hanger.vx / 1.5));
            hanger.vx *= -0.2;
          }
        }
      }
    }

    // A thrown shirt that has stopped makes that spot its new home.
    for (const hanger of this.hangers) {
      if (hanger.free && hanger !== this.grabbed && Math.abs(hanger.vx) < 0.025) {
        hanger.free = false;
        hanger.home = hanger.x;
      }
    }

    // Swing, idle sway and turning.
    for (const hanger of this.hangers) {
      const onStage = hanger === this.selected;
      const acceleration = onStage ? 0 : hanger.ax;
      hanger.tiltV +=
        (-24.525 * Math.sin(hanger.tilt) -
          ((0.55 * acceleration) / ARM) * Math.cos(hanger.tilt) -
          2.6 * hanger.tiltV) *
        dt;
      hanger.tilt += hanger.tiltV * dt;
      if (Math.abs(hanger.tilt) > TILT_LIMIT) {
        hanger.tilt = Math.sign(hanger.tilt) * TILT_LIMIT;
        if (hanger.tilt * hanger.tiltV > 0) hanger.tiltV = 0;
      }
      const breeze =
        0.012 * Math.sin(this.t * 0.7 + hanger.seed) + 0.008 * Math.sin(this.t * 1.9 + hanger.seed * 3.1);
      hanger.swayV += (-24.525 * Math.sin(hanger.sway) - 2.2 * hanger.swayV + breeze) * dt;
      hanger.sway += hanger.swayV * dt;

      if (onStage) {
        this.stepStage(dt);
        hanger.yawV += (60 * (this.stageYaw + this.rotationOffset - hanger.yaw) - 14 * hanger.yawV) * dt;
      } else {
        hanger.yawV += (46 * (hanger.yawTarget - hanger.yaw) - 8.5 * hanger.yawV) * dt;
      }
      hanger.yaw += hanger.yawV * dt;
      hanger.lift += ((hanger === this.hovered ? 0.012 : 0) - hanger.lift) * Math.min(1, dt * 8);
    }

    this.contact(onRail, dt);
  }

  private stepStage(dt: number) {
    this.stageYawV *= Math.exp(-2.4 * dt);
    if (this.turnTo !== null && !this.spinning) {
      const error = this.turnTo - this.stageYaw;
      this.stageYawV += (24 * error - 6.6 * this.stageYawV) * dt;
      if (Math.abs(error) < 0.004 && Math.abs(this.stageYawV) < 0.03) {
        this.stageYaw = this.turnTo;
        this.stageYawV = 0;
        this.turnTo = null;
      }
    }
    this.stageYaw += this.stageYawV * dt;
    // Once a spin slows down, settle on the nearest front or back.
    if (this.turnTo === null && !this.spinning && Math.abs(this.stageYawV) < 1.4) {
      const nearest = Math.round(this.stageYaw / Math.PI) * Math.PI;
      this.stageYawV += (nearest - this.stageYaw) * 9 * dt;
      this.stageYawV *= Math.exp(-3 * dt);
    }
  }

  /** Swinging hems knock into their neighbors and push them a little. */
  private contact(onRail: Hanger[], dt: number) {
    const soft = (value: number) => 0.42 * Math.tanh(value / 0.42);
    const hem = (hanger: Hanger) => hanger.x + 0.55 * Math.sin(soft(hanger.tilt));
    const hemVelocity = (hanger: Hanger) => hanger.vx + 0.55 * Math.cos(soft(hanger.tilt)) * hanger.tiltV;
    for (let i = 0; i < onRail.length - 1; i++) {
      const left = onRail[i];
      const right = onRail[i + 1];
      const overlap = (this.halfWidth(left) + this.halfWidth(right)) * 0.92 - (hem(right) - hem(left));
      if (overlap <= 0) continue;
      const push = Math.max(0, 1500 * overlap + 50 * (hemVelocity(left) - hemVelocity(right))) * dt;
      const swing = (0.85 * push) / 0.55;
      const slide = 0.15 * push;
      left.tiltV -= swing;
      right.tiltV += swing;
      if (left !== this.grabbed) left.vx -= slide;
      if (right !== this.grabbed) right.vx += slide;
    }
  }
}
