// Whether an HA switch looks like it has a light behind it, by its name in any of the ten UI languages (D-036). Relays for
// lights are common (Sonoff, Aqara: in HA a switch, not a light), so the Lights list offers them as lights — "It's a light".
// A home has many other switches too: an air conditioner's options, sockets, a boiler, a valve. The list puts the ones that
// look like lights first and folds the ones that look like something else, so the light relays are seen at once.
import {re} from './fixtures.ts';

// a light: the word itself, its fittings, its kinds
const LIGHT = re(
  'свет|подсвет|освещ|бра(?![а-яё])|ламп|люстр|торшер|ночник|спот|light|lamp|led(?![a-z])|strip|chandelier|sconce|bulb|backlight|spot|licht|leuchte|beleucht|lumi[eè]re|éclairage|eclairage|luminaire|applique|lustre|luz|luces|l[aá]mpara|iluminaci|foco|luce|luci|lampad|illumina|verlicht|świat|swiat|oświetl|oswietl|podświetl|kinkiet|żyrandol|lâmpada|ilumina|lumin[aá]ria|灯|照明',
);
// something else, even with "light" in the name ("Air conditioner Light sensor", an AC's display "Lights")
const OTHER = re(
  'датчик|полотенц|towel|handtuch|serviette|toallero|scaldasalviette|handdoek|ręcznik|toalha|毛巾|сенсор|sensor|capteur|czujnik|传感|кондиц|conditioner|air ?con|klima|climat|clima|空调|термостат|thermostat|termostat|温控|розетк|socket|outlet|plug|steckdose|prise|enchufe|presa|stopcontact|gniazd|tomada|插座|котл|котёл|boiler|kessel|chaudi|caldera|caldaia|ketel|kocio|caldeira|锅炉|вытяжк|hood|extractor|dunst|hotte|campana|cappa|afzuig|okap|exaust|油烟|штор|curtain|blind|жалюз|vorhang|rideau|cortina|tenda|gordijn|zasłon|rolet|窗帘|клапан|valve|ventil|vanne|válvula|valvola|klep|zawór|阀|насос|pump|pumpe|pompe|bomba|pompa|泵|вентил|fan(?![a-z])|ventilat|lüfter|风扇|обогрев|heater|heizung|chauffage|calefac|riscald|verwarm|grzej|aquec|加热|сушит|dryer|beeper|buzzer|sleep|health|x-fan|reverse|измельч|disposer|чайник|kettle|кофе|coffee|увлажн|humidif|измельчител',
);

// German and Dutch join words ("Deckenlicht", "plafondlamp"), English too ("spotlight"): these are looked for inside words too
const LIGHT_INSIDE = /licht|leuchte|lamp|light/i;

/** 1: looks like a light, -1: looks like something else (that wins: "Light sensor"), 0: can't tell ("Relay 4-channel"). */
export function switchLightScore(name: string): number {
  if (OTHER.test(name)) return -1;
  return LIGHT.test(name) || LIGHT_INSIDE.test(name) ? 1 : 0;
}

/**
 * Whether an HA light is the backlight of a wall switch's own panel, not a light of the room: a light of the same device as
 * a relay (a switch), only on and off, with effects to choose (SonoffLAN's T5 and TX Ultimate: switch.…_1 is the relay of the
 * ceiling light, light.… the panel's glow, "Night Light", "Party"…, both named after the device). A light only on and off
 * without effects on a relay's device is a light on a channel of it (a Shelly with one channel set as a light): a light.
 */
export function isSwitchBacklight(
  colorModes: string[] | undefined,
  effects: unknown,
  onRelayDevice: boolean,
): boolean {
  const onOffOnly = !!colorModes?.length && colorModes.every(mode => mode === 'onoff');
  const hasEffects = Array.isArray(effects) && effects.length > 0;
  return onRelayDevice && onOffOnly && hasEffects;
}
