// The plan in the 3D view: the parts the editor (editor/app.js) and the dashboard card (card-main.js) both hand to it.
import {buildPlan2d, openingCoords} from './geometry.ts';
import {wallDefaults} from './plan.ts';
import {isRun, runGeo} from './runs.ts';
import {layoutSensors} from './sensors.ts';
import {sideWall, wallBase} from './surfaces.ts';
import type {LiveScene} from './devices.ts';
import type {RunGeo} from './runs.ts';
import type {PlacedSensor} from './sensors.ts';
import type {FurnitureItem, Plan, PlacedOpening, SensorContext, Vector, WallPlan} from './types.ts';

/** The walls for the 3D view (planWalls): the 2D wall plan, the openings that fit a wall, how many do not. */
export interface PlanWalls {
  g: WallPlan;
  ops: PlacedOpening[];
  hidden: number;
}
/** An item as the 3D view takes it: a built-in run with its shape, a cover as open as HA says (0–1). */
export type SceneItem = FurnitureItem & {geo?: RunGeo | null; open?: number};

// walls: the 2D wall plan, the openings that fit a wall, how many do not (hidden)
export function planWalls(plan: Pick<Plan, 'rooms' | 'openings' | 'wall'>): PlanWalls {
  const all = plan.openings.map(o => openingCoords(plan.rooms, o));
  const ops = all.filter((o): o is PlacedOpening => Boolean(o));
  return {
    g: buildPlan2d(plan.rooms, ops, {outer: wallDefaults(plan).outer}),
    ops,
    hidden: all.length - ops.length,
  };
}

// furniture as the view takes it: built-in runs with their shape, curtains and doors as open as HA says (live — devices.js: liveScene)
export const planFurniture = (
  plan: Pick<Plan, 'rooms' | 'furniture'>,
  live: Pick<LiveScene, 'open'>,
): SceneItem[] =>
  plan.furniture.map((f): SceneItem =>
    isRun(f) ? {...f, geo: runGeo(plan, f)} : live.open.has(f.id) ? {...f, open: live.open.get(f.id)} : f,
  );

// readings on the walls (D-033): ctx — sensors, areas, state (editor/app.js: sensorCtx); cam — the home view direction; moving — the one being dragged
export const planSpots = (
  plan: Pick<Plan, 'rooms' | 'openings' | 'furniture' | 'lights'> & Partial<Pick<Plan, 'sensors'>>,
  ctx: Pick<SensorContext, 'sensors' | 'state'>,
  {cam, moving}: {cam?: Vector | null; moving?: string} = {},
): PlacedSensor[] =>
  !plan.sensors?.length
    ? []
    : layoutSensors(plan, ctx, {
        moving,
        cam,
        openings: plan.openings
          .map(o => openingCoords(plan.rooms, o))
          .filter((o): o is PlacedOpening => Boolean(o)),
        baseOf: (r, i): string => {
          const w = sideWall(r, i);
          return wallBase(w.k, w.tint);
        },
      });
