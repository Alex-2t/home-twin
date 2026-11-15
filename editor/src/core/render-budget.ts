// What the 3D view spends on the GPU per frame (D-115): when the sun's shadow map is drawn again, and how sharp a frame is while
// the camera moves. Pure logic, so it can be tested without WebGL; scene.ts applies it.

/**
 * When the sun's shadow map is drawn again. Drawing it re-renders every shadow caster, about as many draw calls as the frame
 * itself; but the sun and the home stay put while the camera turns (the sun follows the view only once it is still). So the map
 * is drawn when something changed — the plan, furniture, lamps, the time of day, the sun's place, a facade or tall piece hidden
 * or shown for the view — and not for a frame that only moves the camera.
 */
export class ShadowSchedule {
  private stale = true;

  /** Something in the scene changed: the next frame draws the shadow map again. */
  markChanged(): void {
    this.stale = true;
  }

  /** Whether this frame draws the shadow map; asking clears it. */
  takeUpdate(): boolean {
    const update = this.stale;
    this.stale = false;
    return update;
  }
}

/** How sharp the frames are: the renderer's pixel ratio at rest, and the lower one used while the camera moves. */
export interface MotionResolutionOptions {
  fullRatio: number;
  movingRatio: number;
  /** How long the camera has to be still before the frame is drawn sharp again, ms. */
  settleMs: number;
  /** A drawn frame followed by a longer wait for the next one than this (ms) was slow: the GPU held the page back. */
  slowFrameMs: number;
  /** How many slow moving frames in a row lower the resolution. */
  slowFramesToDrop: number;
}

export const MOTION_RESOLUTION: Omit<MotionResolutionOptions, 'fullRatio' | 'movingRatio'> = {
  settleMs: 150,
  slowFrameMs: 22,
  slowFramesToDrop: 3,
};

/**
 * The pixel ratio frame by frame. At rest: the full one. While the camera moves the frames start sharp; when they come too
 * slowly (the GPU cannot fill all the pixels at the display's rate) the ratio drops to the moving one for the rest of that move
 * and for the moves after it, until the scene changes (reset). Once the camera has been still for settleMs the frame is sharp
 * again. A fast GPU never sees a blurred frame; a slow one sees one only while the view moves.
 */
export class MotionResolution {
  private readonly options: MotionResolutionOptions;
  private lowered = false;
  private lastMovingAt: number | null = null;
  private slowFramesInARow = 0;

  constructor(options: MotionResolutionOptions) {
    this.options = options;
  }

  /** The scene changed (another plan): the next move tries the full ratio first again. */
  reset(): void {
    this.lowered = false;
    this.slowFramesInARow = 0;
  }

  /** Whether the moves are drawn at the lower ratio. */
  get isLowered(): boolean {
    return this.lowered;
  }

  /**
   * The pixel ratio for the frame at `now` (ms). moving: the camera moved since the last frame; sinceDrawnMs: how long the page
   * waited since the last frame that was drawn (null when the last frame drew nothing).
   */
  ratioFor(now: number, moving: boolean, sinceDrawnMs: number | null): number {
    const {fullRatio, movingRatio, settleMs, slowFrameMs, slowFramesToDrop} = this.options;
    if (movingRatio >= fullRatio) return fullRatio;
    if (!moving) {
      const settled = this.lastMovingAt === null || now - this.lastMovingAt >= settleMs;
      return this.lowered && !settled ? movingRatio : fullRatio;
    }
    this.lastMovingAt = now;
    if (sinceDrawnMs !== null) {
      const slow = sinceDrawnMs > slowFrameMs;
      this.slowFramesInARow = slow ? this.slowFramesInARow + 1 : 0;
    }
    if (this.slowFramesInARow >= slowFramesToDrop) this.lowered = true;
    return this.lowered ? movingRatio : fullRatio;
  }
}
