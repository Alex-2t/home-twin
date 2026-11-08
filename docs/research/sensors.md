# Sensor readings on walls: which sensors to take

**Review of 2026-11-07:** the sensor-selection research keeps its context; the current interface is a separate mode and `plan.sensors` per D-034. The earlier description of chips at a room from D-033 is not the current interface. Values still come from mockHA; readiness is in [status.md](../status.md).

Date: 2026-11-05. The decision is D-033 in the [decision log](../decisions.md).

## The owner's question
Take all sensors with a numeric value, or how?

## Answer: not all — only room climate
A Home Assistant user has hundreds of numeric sensors: battery level, signal strength, socket power and energy, voltage, chip temperature, uptime. Writing everything on the wall would produce a dump of numbers. So we pick on our own only the room's air readings:

| Reading | device_class | We write it ourselves | Value assessment |
|---|---|---|---|
| Temperature | `temperature` | yes | no assessment |
| Humidity | `humidity` | yes | 30–60% is normal, outside it — attention (ASHRAE) |
| CO₂ | `carbon_dioxide` | yes | up to 1000 ppm is normal, 1000–2000 — ventilate, above — bad (Umweltbundesamt) |
| PM2.5 | `pm25` | if selected | up to 15 µg/m³ is normal (WHO, 24 h), above 35 — bad (EPA, 24 h) |

Other air-related classes also exist in HA: `pm1`, `pm10`, `volatile_organic_compounds`, `aqi`, `illuminance`, `sound_pressure`, `pressure`. Those come later, on request.

## How a room's sensor is chosen
The order is the same as for the HA area card:
1. **The area's own sensor in HA.** Since area registry version 1.8, an area has the fields `temperature_entity_id` and `humidity_entity_id`. The user sets them in the area settings, in the “Linked sensors” section. `config/area_registry/list` returns both fields. HA checks that it is a sensor of the right class.
2. **Otherwise — the sensors of the room's area.** We skip:
   - service ones (`entity_category: diagnostic`, which HA uses for signal, battery and the like) and hidden ones;
   - sensors “not about the room's air” — by name: device and chip temperature, refrigerator, boiler, outdoors, heated floor.

   The HA area card takes the median of all sensors of the class. So a wrong sensor (for example, a device temperature) spoils the number there, and the forum advises hiding it ([issue 21049](https://github.com/home-assistant/frontend/issues/21049)). We do not take a median; we pick one sensor.
3. **Among several,** first comes the sensor whose device measures several readings: that is a climate sensor, not a socket. On a tie — the one with a plausible value.
4. **The user decides** (D-034): this way only the “Show recommended” suggestion is chosen. In the “Sensors” mode, any sensor can be placed on a wall, both climate and other numeric ones (via the “All sensors” button), each with its own place.

## How competitors do it
- **NeonPlan 3D** — free, open source (MIT). Readings are shown in four places, nowhere on walls (checked against the README, CHANGELOG and the `docs/manual.md` guide):
  - **heat map** — the “Show ▾” menu at the bottom left, the Temp. / Humidity / CO₂ modes tint room floors by area sensors, with a color scale on the side;
  - **Values mode** — paints nothing, writes temperature, humidity and CO₂ as numbers under the room name (available since 1.11.1);
  - **device labels** — a sensor icon above the floor with a value; each device has its own setting: “Auto”, “Always show”, “No watts”, “Hide”;
  - **room panel** — opens when a room is clicked, with a list of the area's devices, sensors included.

  “Room climate” sets which sensors provide the room's temperature, humidity and CO₂. In “Auto” mode the area's sensors and those placed in the room are taken, except device temperatures (3D printer, heat pump supply). If there is no sensor, the thermostat's `current_temperature` / `current_humidity` is used. How the numbers and labels are drawn — in the 3D scene itself or as an overlay — and what happens with several sensors, the documentation does not say.
- **HA area card**: shows temperature and humidity by default. With several sensors — the median; for power and energy — the sum.

## What sets us apart
Numbers are written right on the room's wall, like paint. The place is chosen automatically: a free stretch of wall without windows, doors, tall furniture and wall lamps. When the 3D view rotates, the label moves to the wall better visible from the camera. The user can drag the label on the plan, and then it stays in place.

## Later
- Thermostat and air conditioner as a fallback temperature source: `current_temperature` of `climate.*`, as in NeonPlan.
- Heat map — the room floor tinted by temperature or CO₂.
- Alerts: window open, leak, motion.

## Sources
- HA area registry, fields `temperature_entity_id` and `humidity_entity_id`: [area_registry.py](https://github.com/home-assistant/core/blob/dev/homeassistant/helpers/area_registry.py), [config/area_registry.py](https://github.com/home-assistant/core/blob/dev/homeassistant/components/config/area_registry.py).
- HA area card — median, default classes: [home-assistant.io/dashboards/area](https://www.home-assistant.io/dashboards/area/).
- Sensor classes and units: [contributors.home-assistant.io — sensor](https://contributors.home-assistant.io/core/entities/sensor/).
- NeonPlan 3D: [README](https://github.com/Mastershort/neonplan3d), [CHANGELOG](https://github.com/Mastershort/neonplan3d/blob/main/CHANGELOG.md).
- CO₂: EN 16798-1 categories (absolute 950 / 1200 / 1750 ppm, [VELUX](https://www.velux.com/deic/ventilation/indoor-air-quality)); the 1000 ppm threshold is a Umweltbundesamt recommendation ([DGUV](https://dguv.de/medien/ifa/en/pub/rep/pdf/reports2016/rep_indoor_air/chapter_12_4_1.pdf)).
- Humidity: ASHRAE 30–60% and 40–60%, sources differ ([BOMA](https://bomabestfieldguide.org/field-guide-for-sustainable-buildings/a2-2-relative-humidity/?seq_no=2), [Building Science](https://www.buildingscience.com/documents/reports/rr-0203-relative-humidity/view)).
- PM2.5: WHO — 15 µg/m³ per 24 h, 5 per year ([ASHRAE EHC](https://www.ashrae.org/file%20library/communities/committees/standing%20committees/environmental%20health%20committee%20(ehc)/emerging-issue-brief-pm.pdf)).
