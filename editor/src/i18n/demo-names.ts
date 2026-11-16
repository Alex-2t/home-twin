// The examples' names in the UI language (D-120). An example's rooms, lamps, sensors, devices and scenes stand for the names a
// person gives in Home Assistant, and the demo files write them in English (the repository is English-only). Shown as they are,
// a Russian or German page reads "Kitchen blinds · Raised". Here they are looked up in src/i18n/demo/<lang>.json (the English
// name → its translation) when an example opens. A real home's names come from its own HA and are never touched; the build's own
// demo home (own.ts) neither. The names to translate are listed in src/i18n/demo/keys.json (node tools/demo-names.ts writes it).
import type {DemoHaData, Lang, PlanInput} from '../core/types.ts';
import de from './demo/de.json' with {type: 'json'};
import fr from './demo/fr.json' with {type: 'json'};
import nl from './demo/nl.json' with {type: 'json'};
import es from './demo/es.json' with {type: 'json'};
import zh from './demo/zh.json' with {type: 'json'};
import it from './demo/it.json' with {type: 'json'};
import pl from './demo/pl.json' with {type: 'json'};
import pt from './demo/pt.json' with {type: 'json'};
import ru from './demo/ru.json' with {type: 'json'};

/** A language's names: the English name → its translation. */
type NameDictionary = Partial<Record<string, string>>;

export const DEMO_NAME_DICTIONARIES: Record<Exclude<Lang, 'en'>, NameDictionary> = {
  de,
  fr,
  nl,
  es,
  zh,
  it,
  pl,
  pt,
  ru,
};

/** An example's own data: what its HA shows and its plan. */
export interface DemoNamedHome {
  HA: DemoHaData;
  DEMO: PlanInput;
}

/** Changes one name (the English one) into what is shown. */
type Rename = (name: string) => string;

// Every place an example holds a name a person would have given: HA's areas, lamps, switches, sensors, devices, the extra entities
// (scenes, scripts), an entity's own friendly name; the plan's rooms and the items with a name of their own. Ids, classes,
// states, units and catalog words are not names and are left as they are.
function renameHome<T extends DemoNamedHome>(home: T, rename: Rename): T {
  const HA = home.HA;
  const renamedAreas = Object.fromEntries(Object.entries(HA.areas).map(([id, name]) => [id, rename(name)]));
  const renamedEntities = HA.entities
    ? Object.fromEntries(
        Object.entries(HA.entities).map(([entity, state]) => {
          const friendlyName = state.attributes?.friendly_name;
          if (typeof friendlyName !== 'string') return [entity, state];
          return [entity, {...state, attributes: {...state.attributes, friendly_name: rename(friendlyName)}}];
        }),
      )
    : undefined;
  const renamedHA: DemoHaData = {
    ...HA,
    areas: renamedAreas,
    lights: HA.lights.map(light => ({...light, name: rename(light.name)})),
    ...(HA.switches ? {switches: HA.switches.map(item => ({...item, name: rename(item.name)}))} : {}),
    ...(HA.sensors ? {sensors: HA.sensors.map(sensor => ({...sensor, name: rename(sensor.name)}))} : {}),
    ...(HA.devices ? {devices: HA.devices.map(device => ({...device, name: rename(device.name)}))} : {}),
    ...(HA.extra ? {extra: HA.extra.map(item => ({...item, name: rename(item.name)}))} : {}),
    ...(renamedEntities ? {entities: renamedEntities} : {}),
  };
  const plan = home.DEMO;
  const renamedPlan: PlanInput = {
    ...plan,
    ...(plan.rooms
      ? {
          rooms: plan.rooms.map(room =>
            typeof room.name === 'string' ? {...room, name: rename(room.name)} : room,
          ),
        }
      : {}),
    ...(plan.furniture
      ? {
          furniture: plan.furniture.map(item =>
            typeof item.name === 'string' ? {...item, name: rename(item.name)} : item,
          ),
        }
      : {}),
  };
  return {...home, HA: renamedHA, DEMO: renamedPlan};
}

/** Every name an example holds, each once, in the order met. */
export function demoNames(home: DemoNamedHome): string[] {
  const names = new Set<string>();
  renameHome(home, name => {
    if (name.trim()) names.add(name);
    return name;
  });
  return [...names];
}

/** The example with its names looked up in this dictionary; a name it does not have stays English. */
export function translateDemo<T extends DemoNamedHome>(home: T, dictionary: NameDictionary): T {
  return renameHome(home, name => dictionary[name] || name);
}

/** The example with its names in this language. */
export function localizeDemo<T extends DemoNamedHome>(home: T, lang: Lang): T {
  if (lang === 'en') return home;
  return translateDemo(home, DEMO_NAME_DICTIONARIES[lang]);
}
