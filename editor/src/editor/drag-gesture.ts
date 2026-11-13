import type {Vector} from '../core/types.ts';

// All distances are CSS pixels: plan zoom and Retina don't change the gesture threshold.
export const DRAG_HOLD_MS = 240;
export const DRAG_SLOP = 4;

/** The pointer fields the gesture reads. */
export type GesturePointer = Pick<PointerEvent, 'pointerId' | 'clientX' | 'clientY'>;

/** A press that may become a drag: begin on the press, move on each move (true: it is a drag now), end when it is over. */
export interface DragGesture {
  /** cursor: the grab's cursor to show after a hold or on the drag; null: none. */
  begin(e: GesturePointer, cursor: string | null): void;
  move(e: GesturePointer): boolean;
  end(): void;
}

interface Press {
  id: number;
  x: number;
  y: number;
  cursor: string | null;
  moved: boolean;
}

// Direction in plan coordinates (Y up), cursor in screen coordinates (Y down).
export function axisCursor([x, y]: Vector): string {
  const angle = ((Math.atan2(-y, x) * 180) / Math.PI + 180) % 180;
  return ['ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize'][Math.round(angle / 45) % 4];
}

// A hold only shows the grab; geometry changes only on movement beyond the threshold.
export function createDragGesture(showCursor: (cursor: string | null) => void): DragGesture {
  let press: Press | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const reveal = (): void => {
    if (press?.cursor) showCursor(press.cursor);
  };
  const end = (): void => {
    clearTimeout(timer);
    timer = undefined;
    press = null;
    showCursor(null);
  };
  return {
    begin(e, cursor) {
      end();
      press = {id: e.pointerId, x: e.clientX, y: e.clientY, cursor, moved: false};
      timer = setTimeout(reveal, DRAG_HOLD_MS);
    },
    move(e) {
      if (!press || e.pointerId !== press.id) return false;
      if (!press.moved && Math.hypot(e.clientX - press.x, e.clientY - press.y) < DRAG_SLOP) return false;
      press.moved = true;
      clearTimeout(timer);
      reveal();
      return true;
    },
    end,
  };
}
