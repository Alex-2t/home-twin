// @ts-nocheck
// The plan in the 3D view: the parts the editor (editor/app.js) and the dashboard card (card-main.js) both hand to it.
import {buildPlan2d, openingCoords} from './geometry.ts';
import {wallDefaults} from './plan.ts';
import {isRun, runGeo} from './runs.ts';
import {layoutSensors} from './sensors.ts';
import {sideWall, wallBase} from './surfaces.ts';

// walls: the 2D wall plan, the openings that fit a wall, how many do not (hidden)
export function planWalls(plan) {
  const all = plan.openings.map(o => openingCoords(plan.rooms, o)),
    ops = all.filter(Boolean);
  return {
    g: buildPlan2d(plan.rooms, ops, {outer: wallDefaults(plan).outer}),
    ops,
    hidden: all.length - ops.length,
  };
}

// furniture as the view takes it: built-in runs with their shape, curtains and doors as open as HA says (live — devices.js: liveScene)
export const planFurniture = (plan, live) =>
  plan.furniture.map(f =>
    isRun(f) ? {...f, geo: runGeo(plan, f)} : live.open.has(f.id) ? {...f, open: live.open.get(f.id)} : f,
  );

// readings on the walls (D-033): ctx — sensors, areas, state (editor/app.js: sensorCtx); cam — the home view direction; moving — the one being dragged
export const planSpots = (plan, ctx, {cam, moving} = {}) =>
  !plan.sensors?.length
    ? []
    : layoutSensors(plan, ctx, {
        moving,
        cam,
        openings: plan.openings.map(o => openingCoords(plan.rooms, o)).filter(Boolean),
        baseOf: (r, i) => {
          const w = sideWall(r, i);
          return wallBase(w.k, w.tint);
        },
      });
