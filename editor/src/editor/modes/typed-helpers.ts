// draw.ts's palette and ui.ts's section() with the types they have at run time, for the modes. Both modules are not typed yet,
// and what TypeScript infers from them is too narrow to use: the palette reads as {} (readPalette fills it from the CSS
// variables), and section() reads as taking only {open} and as giving Element | null. Once draw.ts and ui.ts are typed, the
// modes import these from there and this file goes.
import {pal as drawPalette} from '../draw.ts';
import {section as uiSection} from '../ui.ts';

/**
 * The plan's colours (draw.ts readPalette): the theme's CSS variables as they are written (--acc → acc, --furn-line →
 * furn_line), and whether the dark theme is on.
 */
export interface PlanPalette {
  cv: string;
  dot: string;
  room: string;
  room_line: string;
  wall: string;
  furn: string;
  furn_line: string;
  win: string;
  door: string;
  lamp: string;
  /** A number as text ('.45'). */
  glow: string;
  label: string;
  label2: string;
  /** The accent, and its light fill. */
  acc: string;
  acc2: string;
  bad: string;
  warn: string;
  guide: string;
  dark: boolean;
}

/** The same object draw.ts draws with, so it follows the theme as it changes. */
export const pal = drawPalette as PlanPalette;

/** A section's options (ui.ts section): the count beside its title, open at first, and a button in its title. */
export interface SectionOptions {
  count?: string | number;
  /** None: open; the user's own choice, once made, wins. */
  open?: boolean;
  /** The button: its label, what it does and its tooltip. */
  action?: [label: string, run: () => void, tip?: string];
}

/** A collapsible section of the side panel (ui.ts section): it is added to parent; the section's body is returned. */
export const section = uiSection as (
  parent: HTMLElement,
  key: string,
  title: string,
  options?: SectionOptions,
) => HTMLElement;
