// Where the parts of an item drawn from parts (parts.ts) are, without three.js: each part's box in the item's own axes (x along
// its width, y up, z towards its front), as parts.ts draws it (box, cyl and sphere stand on their anchor, profile and lathe
// around it, tilt turns the part around its anchor), at the item's size on the plan (the 3D view stretches the parts to it).
// layout.ts uses them to tell whether a seat's parts at a table's top height stand over the top.
import type {FurnitureItem, Part, ShapePart, Vec3} from './types.ts';

/** A box in the item's axes, metres: x0…x1 along its width, y0…y1 up from the floor, z0…z1 towards its front. */
export interface PartBox {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  z0: number;
  z1: number;
}

// The most copies a repeat makes (parts.ts LIMITS.repeat).
const MOST_COPIES = 50;

/** The parts with repeats made into their copies, each copy moved by the repeat's step. */
function shapesOf(parts: readonly Part[]): ShapePart[] {
  const shapes: ShapePart[] = [];
  for (const part of parts) {
    if (part.kind !== 'repeat') {
      shapes.push(part);
      continue;
    }
    const copies = Math.min(Math.max(0, Math.floor(part.count)), MOST_COPIES);
    for (let copy = 0; copy < copies; copy++)
      for (const shape of shapesOf([part.part])) {
        const at: Vec3 = [
          shape.at[0] + part.step[0] * copy,
          shape.at[1] + part.step[1] * copy,
          shape.at[2] + part.step[2] * copy,
        ];
        shapes.push({...shape, at});
      }
  }
  return shapes;
}

/** A shape's box around its anchor, before its tilt: [x0, x1, y0, y1, z0, z1]. */
function ownBox(shape: ShapePart): [number, number, number, number, number, number] {
  switch (shape.kind) {
    case 'box': {
      const [width, height, depth] = shape.size;
      return [-width / 2, width / 2, 0, height, -depth / 2, depth / 2];
    }
    case 'cyl': {
      const radius = Math.max(shape.r, shape.r2 ?? shape.r);
      return [-radius, radius, 0, shape.h, -radius, radius];
    }
    case 'sphere': {
      const [scaleX, scaleY, scaleZ] = shape.scale || [1, 1, 1];
      return [
        -shape.r * scaleX,
        shape.r * scaleX,
        0,
        2 * shape.r * scaleY,
        -shape.r * scaleZ,
        shape.r * scaleZ,
      ];
    }
    case 'profile': {
      const xs = shape.points.map(point => point[0]);
      const ys = shape.points.map(point => point[1]);
      return [
        Math.min(...xs),
        Math.max(...xs),
        Math.min(...ys),
        Math.max(...ys),
        -shape.depth / 2,
        shape.depth / 2,
      ];
    }
    case 'lathe': {
      const radius = Math.max(...shape.points.map(point => point[0]));
      const ys = shape.points.map(point => point[1]);
      return [-radius, radius, Math.min(...ys), Math.max(...ys), -radius, radius];
    }
  }
}

/** A point turned by a part's tilt, degrees around x, y and z in three.js's order (XYZ: z first, then y, then x). */
function tilted([x, y, z]: Vec3, tilt: Vec3): Vec3 {
  const [aroundX, aroundY, aroundZ] = tilt.map(degrees => (degrees * Math.PI) / 180);
  const x1 = x * Math.cos(aroundZ) - y * Math.sin(aroundZ);
  const y1 = x * Math.sin(aroundZ) + y * Math.cos(aroundZ);
  const x2 = x1 * Math.cos(aroundY) + z * Math.sin(aroundY);
  const z2 = -x1 * Math.sin(aroundY) + z * Math.cos(aroundY);
  const y3 = y1 * Math.cos(aroundX) - z2 * Math.sin(aroundX);
  const z3 = y1 * Math.sin(aroundX) + z2 * Math.cos(aroundX);
  return [x2, y3, z3];
}

/** The boxes of an item's parts at its size on the plan; an item not drawn from parts has none. */
export function partBoxes(item: FurnitureItem): PartBox[] {
  const parts = item.parts;
  if (!parts?.parts?.length) return [];
  const scaleX = item.w / (parts.w || item.w);
  const scaleY = item.h / (parts.h || item.h);
  const scaleZ = item.d / (parts.d || item.d);
  const boxes: PartBox[] = [];
  for (const shape of shapesOf(parts.parts)) {
    const [x0, x1, y0, y1, z0, z1] = ownBox(shape);
    const corners: Vec3[] = [];
    for (const x of [x0, x1]) for (const y of [y0, y1]) for (const z of [z0, z1]) corners.push([x, y, z]);
    const turned = shape.tilt ? corners.map(corner => tilted(corner, shape.tilt!)) : corners;
    const xs = turned.map(corner => (corner[0] + shape.at[0]) * scaleX);
    const ys = turned.map(corner => (corner[1] + shape.at[1]) * scaleY);
    const zs = turned.map(corner => (corner[2] + shape.at[2]) * scaleZ);
    boxes.push({
      x0: Math.min(...xs),
      x1: Math.max(...xs),
      y0: Math.min(...ys),
      y1: Math.max(...ys),
      z0: Math.min(...zs),
      z1: Math.max(...zs),
    });
  }
  return boxes;
}
