// Plan version history (as in Figma and Google Docs): snapshots at meaningful moments, not on every mouse move.
// When: a wizard step is completed ('step'), before a major edit ('before': auto-layout, merging or deleting
// a room, rotating the plan, opening a file, restoring a version) and every few edits ('auto': every third, or the first after
// 10 minutes), plus on opening the editor — what the plan looked like at the end of the previous session. Identical to the latest
// version — not written. Each single edit is undone by ⌘Z (history.ts); a version is a point to come back to.
// Stored per project in storage (ver:<project>), up to 100 versions. Over that an autosave goes, never a step's or a “before”
// one: the one closest in time to the version after it, so the recent hour stays dense and older work thins out but stays.
// “Same version” ignores wizard marks (onboarding): starting a step is not a new plan version.
// No DOM here: the window is versions-panel.ts.
import type {Plan} from '../core/types.ts';
import type {KeyValueStore} from './idb.ts';
import type {UnderlaySnapshot} from './underlay.ts';

export const VER_MAX = 100;
export const AUTO_MS = 10 * 60e3;
/** An autosave every this many edits. */
export const EDITS_PER_AUTO = 3;

/** Why a version was kept: a guided step passed, before a big edit, or every few edits. */
export type VersionKind = 'step' | 'before' | 'auto';

/** A kept version of the plan. */
export interface PlanVersion {
  id: string;
  /** When, ms. */
  at: number;
  kind: VersionKind;
  /** The step or the edit it was kept for ('split', 'merge', 'restore'…); null: none. */
  what: string | null;
  /** The plan as JSON. */
  plan: string;
  photo: UnderlaySnapshot | null;
}

/** What a snapshot is kept with: why, for what, the photo's placement, and when (none: now). */
export interface VersionOptions {
  kind?: VersionKind;
  what?: string | null;
  photo?: UnderlaySnapshot | null;
  at?: number | null;
}

/** The plan's versions in storage (ver:<project>), newest first. */
export interface Versions {
  list(): PlanVersion[];
  /** The open project's versions are read. */
  ready(): Promise<void>;
  /** Another project: its versions. */
  open(pid: string | null | undefined): Promise<void>;
  /** Keeps the plan as it is now; null: the same as the latest, or another project. Only its id is read; the rest is kept as JSON. */
  add(plan: Pick<Plan, 'id'>, o?: VersionOptions): Promise<PlanVersion | null>;
  /** An edit was done (counted for the autosave). */
  edited(): void;
  /** An autosave is due: none yet, three edits since the latest version, or an edit and the latest is 10 minutes old. */
  due(): boolean;
}

export function createVersions({
  store = null,
  now = () => Date.now(),
}: {store?: KeyValueStore | null; now?: () => number} = {}): Versions {
  let id: string | null = null;
  let list: PlanVersion[] = [];
  let ready: Promise<void> = Promise.resolve();
  // edits since the latest version was kept (or found the same as the plan)
  let editsSince = 0;
  const save = (): Promise<void> =>
    store && id ? store.batch([['put', 'ver:' + id, list]]).catch(() => {}) : Promise.resolve();
  // extras: the autosave closest in time to the version after it (never the newest); with no autosave, the oldest version
  const trim = (): void => {
    while (list.length > VER_MAX) {
      let drop = -1;
      let smallestGap = Infinity;
      for (let i = 1; i < list.length; i++) {
        if (list[i].kind !== 'auto') continue;
        const gap = list[i - 1].at - list[i].at;
        if (gap < smallestGap) {
          smallestGap = gap;
          drop = i;
        }
      }
      if (drop < 0) drop = list.length - 1;
      list.splice(drop, 1);
    }
  };
  const sig = (json: string): string => {
    // a plan this module wrote as JSON
    const p = JSON.parse(json) as Partial<Plan>;
    delete p.onboarding;
    return JSON.stringify(p);
  };
  const V: Versions = {
    list: () => list,
    ready: () => ready,
    // another project — its versions
    open(pid) {
      id = pid || null;
      list = [];
      editsSince = 0;
      ready =
        store && id
          ? store
              .get('ver:' + id)
              .then(v => {
                // This module writes the list (save above); its entries are not checked.
                if (id === pid) list = Array.isArray(v) ? (v as PlanVersion[]) : [];
              })
              .catch(() => {})
          : Promise.resolve();
      return ready;
    },
    // snapshot of the plan right now (before the first await: “before an edit” must stay “before”); null — already exists or another project
    add(plan, {kind = 'auto', what = null, photo = null, at = null} = {}) {
      const json = JSON.stringify(plan);
      const pid = plan?.id;
      const when = at ?? now();
      return ready.then(async () => {
        if (!id || pid !== id) return null;
        editsSince = 0;
        // same as the latest: it was a plain autosave, and now there is a reason (a step, “before an edit”) — label it with that
        if (list[0] && (list[0].plan === json || sig(list[0].plan) === sig(json))) {
          if (list[0].kind !== 'auto' || kind === 'auto') return null;
          list[0] = {...list[0], kind, what};
          await save();
          return list[0];
        }
        const v: PlanVersion = {
          id: when.toString(36) + Math.random().toString(36).slice(2, 6),
          at: when,
          kind,
          what,
          plan: json,
          photo,
        };
        list = [v, ...list].sort((a, b) => b.at - a.at);
        trim();
        await save();
        return v;
      });
    },
    edited: () => {
      editsSince += 1;
    },
    // is an autosave due: no version yet, enough edits since the latest, or an edit and the latest is 10 minutes old
    due: () =>
      !list.length || editsSince >= EDITS_PER_AUTO || (editsSince > 0 && now() - list[0].at >= AUTO_MS),
  };
  return V;
}
