# Ten typical homes — the basis for checking the catalog and the editor

**Verification status as of 2026-11-08:** the ten homes are now reference plans with HA data in `editor/demo/homes/` and a repeatable check in `npm test` (D-061; houses — the ground floor). The external statistics below belong to the original research and were not re-verified here.

Date: 2026-11-05. The owner: “my apartment is just an example, take about 10 typical apartments as the basis that will cover 90% of needs.” The owner's apartment (`3d_floor`) remains one of the examples, not the benchmark.

## Why these ten

- **Where Home Assistant users are.** The most HA app downloads are in Germany (about 21%), the US is second (12%) ([Appfigures, 2024](https://appfigures.com/resources/insights/20241220/2-home-automation-went-open-source-in-2024-a-big-year-for-home-assistant)). The Netherlands has the most installations per resident (community data, not verified). There is no exact per-country breakdown of installations in the open: [analytics.home-assistant.io](https://analytics.home-assistant.io/statistics) shows it only on a live dashboard.
- **House or apartment.** In the EU in 2023, 51.7% of people lived in houses and 47.7% in apartments. In the Netherlands 77–79% live in houses (including terraced ones); in EU cities 73% live in apartments, in rural areas 83% live in houses ([Eurostat, Housing in Europe](https://ec.europa.eu/eurostat/web/interactive-publications/housing)). In the US about 67% of housing is single-family homes, and another 19.5% is buildings with 5+ units ([Census ACS B25024 via HomeSnacks](https://www.homesnacks.com/us-housing-statistics/)).
- **Sizes.** The average apartment in Germany is 94 m² ([Destatis, 2024](https://www.destatis.de/DE/Presse/Pressemitteilungen/2025/09/PD25_336_31231.html)). A new single-family house in the US has a median of about 214 m² (2,299 sq ft, 2022), a new rental apartment about 100 m² ([NAA](https://naahq.org/node/3115), [PropertyShark](https://www.propertyshark.com/Real-Estate-Reports/size-of-new-built-homes-in-the-us)). In Russia two-room apartments are 39% of the housing stock, three-room ones 28% ([Rosstat via Kommersant](https://kommersant.ru/doc/3246818)).

Conclusion: among the HA audience, houses are at least as common as apartments. A set of apartments only would cover about half of the users. So the ten include six apartments, one older-building apartment and three houses. The “90%” figure is an estimate by housing type and size, not a measurement: the shares of HA users specifically by housing type are not published.

## The ten homes

| # | Type | Where typical | Area | Rooms | What it tests |
|---|---|---|---|---|---|
| 1 | Studio | new builds in Russia, EU and US cities | 25–35 m² | kitchen along a wall, living area, shower room with a washing machine | sofa bed, compact kitchen, everything in one volume |
| 2 | One-bedroom (separate kitchen) | Russia, EU | 35–45 m² | separate kitchen with a table, a room, combined bathroom with a bathtub, hallway | bedroom-living room in one room, wardrobe in the hallway |
| 3 | Euro two-room / 1-bedroom | new builds in Russia, EU, US | 45–60 m² | kitchen-living room with an island or peninsula, bedroom, bathroom, laundry niche, balcony | open kitchen, island with bar stools |
| 4 | Old-type two-room | panel and brick buildings in Russia, Eastern Europe | 44–55 m² | kitchen 6–9 m², living room, bedroom, separate bathroom and toilet, balcony | small kitchen, bathtub, gas water heater or boiler |
| 5 | Three-room family | Russia, Germany (3–4 Zimmer) | 65–85 m² | living room, bedroom, children's room, kitchen 9–12 m², bathroom and toilet, hallway | children's room: crib, bunk bed, desk, wall bars |
| 6 | Large apartment with two bathrooms | new builds in Russia, Germany, US | 90–120 m² | kitchen-living room, bedroom with a walk-in closet and its own bathroom, two children's rooms or a study, guest bathroom, laundry room | walk-in closet, double sink, “washer + dryer” stack |
| 7 | Older building with high ceilings | Altbau in the EU, Stalin-era buildings in Russia | 70–110 m² | large rooms, ceilings 3–3.5 m, bay window, kitchen with gas | **ceiling height**, irregularly shaped rooms |
| 8 | Terraced house / townhouse | Netherlands, Germany, UK | 110–140 m², 2–3 floors | floor 1: kitchen-dining-living room, guest toilet, hallway; floor 2: 3 bedrooms, bathroom; attic — study; garden | **floors**, staircase, attic slopes, garden furniture |
| 9 | Single-story house | US (ranch), EU (bungalow) | 130–200 m² | kitchen with an island, living room, 3 bedrooms, 2 bathrooms, laundry room, garage, terrace | garage (car, workbench, bicycles), boiler, electrical panel, terrace |
| 10 | Two-story house with a basement | US, Germany (Einfamilienhaus) | 160–250 m² | floor 1: living room, dining room, kitchen, study, guest toilet, utility room; floor 2: 3–4 bedrooms, master bedroom with a walk-in closet and bathroom; basement: equipment, gym, storage; garage | **floors and basement**, utility room, network cabinet, home gym |

## What is needed in furniture and what was missing

The furniture lists of the ten homes were checked against the catalog. Almost everything is there, including the whole list from [furniture-catalog.md](furniture-catalog.md). What was missing was added on 2026-11-05:

- **Garage and outdoors** (houses 8–10, balconies and terraces of apartments 3–6): car (passenger and crossover), bicycle, workbench, chest freezer, garden table (rectangular and round), garden chair, lounger, grill.
- **Home equipment** (4, 7, 9, 10 and many apartments): boiler (wall-mounted and floor-standing), electrical panel, network cabinet (floor-standing and wall-mounted). The panel and the network cabinet matter specifically for HA users: meters, server and router are there.
- **Double bowl** (6, 9, 10): for a vanity unit from 1.2 m — two sinks; for a kitchen sink — the “Double bowl” variant.

Not there yet — minor for furniture, important for lights and devices:
- ceiling fan with a light — common in the US, in HA it is both a fan and a light: it needs a form in the Lights mode;
- projector and screen for a home theater;
- a staircase is a structure, not furniture: it will appear together with floors.

## What the editor needs — the main thing for houses

The furniture for the ten homes now exists. What is missing is the editor itself:

1. **Floors** (houses 8–10, two-level apartments). Right now the plan is single-floor. Without floors a house can only be drawn floor by floor in different projects. NeonPlan supports floors ([competitors.md](competitors.md)). For the HA audience, where houses are at least as common as apartments, this is the main gap of the first version.
2. **Ceiling height** per plan, or better per room (house 7, attics, basements, US — 2.4–2.7 m). Per plan since D-NEXT (settings → "Ceiling height"; none set: 2.6 m, `WALL.height`); per room waits for floors and attics.
3. **Attic slopes** (8, 10) — rooms under the roof with a low wall.
4. **Terrace and garden** (8–10) — an open area without walls next to the house; right now it can only be drawn as a room with walls.

## How to check

Done on 2026-11-08 (D-061): each home is a plan in `editor/demo/homes/`; `editor/src/core/homes.test.js` checks rooms, openings, false “overlaps” and “blocks a door”, and the wizard's auto-placement of lights, sensors and devices; each opens from the editor's start screen to see the 3D (D-062). Houses 8–10 — the ground floor until floors exist.
