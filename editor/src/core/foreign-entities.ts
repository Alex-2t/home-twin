// A plan drawn against another Home Assistant (our site's demo, D-134) and taken into this one: what it ties to entities this
// HA does not have is not of this home. Lights from the list that were never placed go; a placed one stays where it is as a
// lamp without an entity, like the lamps the AI build saw (seen-lamps.ts), so linking it to one of this home's lights works
// the usual way. Readings and devices of entities this HA lacks go; the items they were on (curtains, an aircon) stay.
// Rooms need nothing here: their areas are checked against this HA anyway (app.ts syncAreas).
import type {Plan, PlanLight} from './types.ts';

/** Whether this Home Assistant has the entity. */
type HasEntity = (entity: string) => boolean;

/** A light this HA does not have: it names an entity (a light, a group or a relay's switch) that is not here. */
function isForeignLight(light: PlanLight, hasEntity: HasEntity): boolean {
  if (!light.entity) return false;
  return !hasEntity(light.entity);
}

/** A placed light of another HA, kept as a lamp without an entity: its place and form stay, nothing of that HA does. */
function asLampWithoutEntity(light: PlanLight): PlanLight {
  const lamp = {...light};
  delete lamp.entity;
  delete lamp.members;
  delete lamp.relay;
  delete lamp.area;
  return lamp;
}

function keepOwnLights(lights: PlanLight[], hasEntity: HasEntity): PlanLight[] {
  const kept: PlanLight[] = [];
  for (const light of lights) {
    if (!isForeignLight(light, hasEntity)) kept.push(light);
    else if (light.placed) kept.push(asLampWithoutEntity(light));
    // a foreign light never placed: nothing of it to keep
  }
  // a part of a fitting that went is a light of its own again
  const ids = new Set(kept.map(light => light.id));
  return kept.map(light => {
    if (!light.with || ids.has(light.with)) return light;
    const own = {...light};
    delete own.with;
    return own;
  });
}

/** The plan with only what this Home Assistant has; the plan given is not changed. */
export function dropForeignEntities(plan: Plan, hasEntity: HasEntity): Plan {
  const sensors = plan.sensors.filter(sensor => hasEntity(sensor.entity));
  const sensorIds = new Set(sensors.map(sensor => sensor.id));
  return {
    ...plan,
    lights: keepOwnLights(plan.lights, hasEntity),
    // a reading that hung below one that went starts its own column
    sensors: sensors.map(sensor => {
      if (!sensor.under || sensorIds.has(sensor.under)) return sensor;
      const own = {...sensor};
      delete own.under;
      return own;
    }),
    sensorSkip: plan.sensorSkip.filter(hasEntity),
    devices: plan.devices.filter(device => hasEntity(device.entity)),
  };
}
