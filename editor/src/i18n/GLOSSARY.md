# Translation glossary (D-036)

English is the source language: UI text in code is written in English, and the English string itself is the key (`t('Done')`). Dictionaries: `src/i18n/<lang>.json` — an object “English string → translation”, one per language including `ru.json`. Keys are all strings from `keys.json` (written by `node tools/i18n-scan.ts --keys`; next to each key is where it is used). Check: `npm test` (nothing missing, placeholders match).

A key may end in a `|context` suffix, e.g. `Open|verb` or `Rectangular|feminine`: the same English word that needs different translations. English shows only the part before `|`; the translation is written without the suffix.

## Rules
- **Short.** The UI is dense: a translation is no longer than the English, as far as the language allows. Hints are one or two short sentences (D-022).
- **Placeholders** `{0}`, `{1}` — the same ones, in the right place in the sentence. Plurals use ICU: `{0, plural, one {# lamp} other {# lamps}}`, with forms following the language's rules (en/de/nl/es/it/pt: `one`, `other`; fr: `one`, `many`, `other`; pl and ru: `one`, `few`, `many`, `other`; zh: `other` only). `#` is the number.
- **Form of address — as in Home Assistant itself in that language:** de — du, fr — vous, nl — je, es — tú, it — tu, pt (Brazil) — você, pl — impersonal or “ty”, as in HA, ru — polite plural imperatives, zh — neutral.
- **Quotes — the language's own:** de „…“, fr « … », pl „…”, ru «…», zh “…”, the rest "…" or «…», as is customary.
- **Units — metric, with the language's abbreviations:** cm, m, m². The code inserts the decimal separator.
- **Wall labels** (`TEMP.`, `HUM.`, `CO₂, PPM`, `POWER`…) — upper case and short.
- **Furniture:** names as in IKEA catalogues in that language; search tags (`tags`, words separated by spaces) — not literal, but the words people search with there (synonyms separated by spaces). Soft hyphens `­` in keys need not be repeated; long German words may get their own.
- **Do not translate:** Home Assistant, Home Twin, HACS, key names (Shift, Tab, Delete, ⌘Z), CO₂, PM2.5, ppm, `°`, `%`.

## Home Assistant terms
| en | de | fr | nl | es | zh | it | pl | pt |
|---|---|---|---|---|---|---|---|---|
| area | Bereich | pièce | ruimte | área | 区域 | area | obszar | área |
| entity | Entität | entité | entiteit | entidad | 实体 | entità | encja | entidade |
| dashboard | Dashboard | tableau de bord | dashboard | panel | 仪表盘 | plancia | dashboard | painel |
| card | Karte | carte | kaart | tarjeta | 卡片 | scheda | karta | cartão |
| light | Licht, Leuchte | lumière | lamp, licht | luz | 灯 | luce | światło | luz |
| sensor | Sensor | capteur | sensor | sensor | 传感器 | sensore | czujnik | sensor |
| switch | Schalter | interrupteur | schakelaar | interruptor | 开关 | interruttore | przełącznik | interruptor |

In French, both in HA and here, “pièce” is both an area and a room. If both appear in one sentence, the HA area is “zone Home Assistant”.

## Editor modes and steps
| en | de | fr | nl | es | zh | it | pl | pt |
|---|---|---|---|---|---|---|---|---|
| Plan | Grundriss | Plan | Plattegrond | Plano | 平面图 | Pianta | Plan | Planta |
| Furniture | Möbel | Mobilier | Meubels | Muebles | 家具 | Arredi | Meble | Móveis |
| Lights | Licht | Éclairage | Verlichting | Luces | 灯光 | Luci | Światło | Luzes |
| Sensors | Sensoren | Capteurs | Sensoren | Sensores | 传感器 | Sensori | Czujniki | Sensores |
| Room | Raum | Pièce | Kamer | Habitación | 房间 | Stanza | Pokój | Cômodo |
| Wall | Wand | Mur | Muur | Pared | 墙 | Parete | Ściana | Parede |
| Home view | Startansicht | Vue d'accueil | Startweergave | Vista inicial | 主视图 | Vista iniziale | Widok startowy | Vista inicial |
