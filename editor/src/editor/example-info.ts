// What the examples are called and how they are grouped (D-062, D-113): the start screen's and the gallery's cards (flows.ts),
// and the list of homes the build publishes beside the page for other sites to show (build.ts, dist/showcase/). No DOM here.
import {N} from '../i18n/i18n.ts';
import type {GalleryKind} from './gallery.ts';

/** How an example is called on its card and which group it is in. */
export interface ExampleInfo {
  name: string;
  kind: 'flat' | 'style' | 'house';
  note?: string;
}

// The start screen's examples (D-062): three designer interiors first, the ten typical homes (demo/homes.ts, D-030), and “Demo home” — the build's own demo apartment
// when it is not one of them. note — said under the name (houses: only the ground floor is drawn, the editor is single-floor)
export const EXAMPLE: Record<string, ExampleInfo> = {
  demo: {name: N('Demo home'), kind: 'flat'},
  studio: {name: N('Studio'), kind: 'flat'},
  'one-bed': {name: N('One room + kitchen'), kind: 'flat'},
  'euro-two': {name: N('Open kitchen + bedroom'), kind: 'flat'},
  'old-two': {name: N('Two rooms, older block'), kind: 'flat'},
  family: {name: N('Family, three rooms'), kind: 'flat'},
  large: {name: N('Large, two bathrooms'), kind: 'flat'},
  altbau: {name: N('Period apartment'), kind: 'flat'},
  loft: {name: N('Loft'), kind: 'style'},
  minimal: {name: N('Minimalist'), kind: 'style'},
  japandi: {name: N('Japandi'), kind: 'style'},
  townhouse: {name: N('Townhouse'), kind: 'house', note: N('ground floor')},
  bungalow: {name: N('Bungalow'), kind: 'house'},
  house: {name: N('Detached house'), kind: 'house', note: N('ground floor')},
};
// An example's group as the gallery's filter chips name it (D-113).
export const GALLERY_KIND: Record<ExampleInfo['kind'], GalleryKind> = {
  flat: 'apartment',
  style: 'designer',
  house: 'house',
};
