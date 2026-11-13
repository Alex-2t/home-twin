// All distances are CSS pixels: plan zoom and Retina don't change the gesture threshold.
export const DRAG_HOLD_MS = 240;
export const DRAG_SLOP = 4;

// Direction in plan coordinates (Y up), cursor in screen coordinates (Y down).
export function axisCursor([x, y]) {
  const angle = ((Math.atan2(-y, x) * 180) / Math.PI + 180) % 180;
  return ['ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize'][Math.round(angle / 45) % 4];
}

// A hold only shows the grab; geometry changes only on movement beyond the threshold.
export function createDragGesture(showCursor) {
  let press = null,
    timer = null;
  const reveal = () => {
    if (press?.cursor) showCursor(press.cursor);
  };
  const end = () => {
    clearTimeout(timer);
    timer = null;
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
