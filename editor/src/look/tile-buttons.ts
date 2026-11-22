// The buttons on a room's tile in the overview (editor/look.ts tileMarkup): as many of the room's devices as fit, each its own
// button; when they do not all fit, alike ones go together, step by step, until they do (the owner, 2026-11-22: the
// hallway's skirting light had no button of its own, only the room's one bulb). First all the room's lamps become one
// button (off turns off what is on, on turns on the main light), then all its curtains one; what still does not fit opens
// the room's screen from a last "+N". Lights first, then curtains, then climate: the most used first.

/** One button on a room's tile. */
export type TileButton<Lamp, Cover, Climate> =
  | {kind: 'lamp'; lamp: Lamp}
  | {kind: 'lights'}
  | {kind: 'cover'; cover: Cover}
  | {kind: 'covers'}
  | {kind: 'climate'; device: Climate}
  | {kind: 'more'; count: number};

/** What a room has that a tile can show a button for. */
export interface TileDevices<Lamp, Cover, Climate> {
  lamps: Lamp[];
  covers: Cover[];
  climate: Climate[];
}

/** How many round buttons fit a row this wide, pixels, with this button size and gap. */
export function buttonsThatFit(rowWidth: number, button: number, gap: number): number {
  return Math.max(1, Math.floor((rowWidth + gap) / (button + gap)));
}

/** The room's buttons for a row that holds `room` of them, in their order: lights, curtains, climate, then "+N". */
export function tileButtons<Lamp, Cover, Climate>(
  devices: TileDevices<Lamp, Cover, Climate>,
  room: number,
): TileButton<Lamp, Cover, Climate>[] {
  const climate = devices.climate.map(device => ({kind: 'climate', device}) as const);
  const lampsApart = devices.lamps.map(lamp => ({kind: 'lamp', lamp}) as const);
  const coversApart = devices.covers.map(cover => ({kind: 'cover', cover}) as const);
  const lampsTogether = devices.lamps.length ? [{kind: 'lights'} as const] : [];
  const coversTogether = devices.covers.length ? [{kind: 'covers'} as const] : [];
  const steps: TileButton<Lamp, Cover, Climate>[][] = [
    [...lampsApart, ...coversApart, ...climate],
    [...lampsTogether, ...coversApart, ...climate],
    [...lampsTogether, ...coversTogether, ...climate],
  ];
  const fitting = steps.find(buttons => buttons.length <= room);
  if (fitting) return fitting;
  const together = steps[steps.length - 1];
  const shown = together.slice(0, Math.max(0, room - 1));
  return [...shown, {kind: 'more', count: together.length - shown.length}];
}
