// Six stages D-041; states D-042; the card and the path strip D-043. Confirmation and deferral are stored in the plan.
// Next goes forward along the path; the summary lists what is unfinished. “Run setup” returns to the first unfinished step.
import {t, N} from '../i18n/i18n.ts';
import {icon} from './icons.ts';
import {stepFacts, stepStatus, recordStep} from './wizard-state.ts';
import {find} from './ui.ts';
import type {OnboardingStepId} from '../core/types.ts';
import type {BannerItem, Editor, PathStep, PathStepStatus} from './editor-types.ts';

/** The guided path (D-041–D-043): which step is on, the path strip, going forward and back. */
export interface WizardPath {
  /** The step on now; null: the path is not running. */
  cur(): PathStep | null;
  status(step: OnboardingStepId): PathStepStatus;
  done(step: OnboardingStepId): boolean;
  /** Marks the step started (others: nothing). */
  enter(step: PathStep): void;
  /** "Run setup": the first step not passed, else the end. */
  resume(): void;
  /** The questions before the summary: show the devices, show the readings. */
  askDevices(): void;
  ask(): void;
  /** The step is done (defer: for later): on to the next one. */
  after(from: OnboardingStepId, o?: {defer?: boolean}): void;
  canBack(): boolean;
  back(): void;
  go(step: OnboardingStepId): void;
  /** The summary. */
  finale(): void;
  /** The path strip for the card; null: the path is not running. */
  el(): HTMLElement | null;
}

/** A mode that may have something to show in its step (devices, sensors). */
interface OptionalStepMode {
  available?(): boolean;
}

export const MAND: Array<[OnboardingStepId, string]> = [
  ['rect', N('Outline')],
  ['split', N('Rooms')],
  ['open', N('Windows & doors')],
  ['names', N('Link rooms')],
  ['furniture', N('Furniture')],
  ['lights', N('Lights')],
];
// The view for the card is part of “Sensors” (their first tile), there is no separate item (the owner, 2026-11-07).
// “Devices” (D-048) — air conditioners, curtains, door/window sensors; asked about before sensors.
export const OPT: Array<[OnboardingStepId, string, string]> = [
  ['devices', N('Devices'), 'airVent'],
  ['sensors', N('Sensors on walls'), 'thermo'],
];
const ALL = [...MAND, ...OPT];
const nameOf = (k: PathStep): string => t(ALL.find(s => s[0] === k)?.[1] || k);
const isStep = (k: PathStep): k is OnboardingStepId => ALL.some(s => s[0] === k);
const statusName = (s: PathStepStatus): string =>
  s === 'confirmed'
    ? t('Done')
    : s === 'deferred'
      ? t('For later')
      : s === 'in_progress'
        ? t('In progress')
        : t('Not started');

export function createPath(ed: Editor): WizardPath {
  // Its members are set below, before it is returned.
  const P = {} as WizardPath;
  const id = (): string | undefined => ed.plan.id;
  const state = () => ed.wizard.get(id()) || {};
  // Old “passed” marks are carried over once. A partial result stays deferred.
  const migrate = () => {
    if (ed.plan.onboarding) return;
    ed.plan.onboarding = {steps: {}};
    for (const [k] of ALL)
      if (ed.hints?.count('pass:' + id() + ':' + k) > 0)
        recordStep(ed.plan, k, stepFacts(ed.plan, k).complete ? 'confirmed' : 'deferred');
  };
  const save = () => ed.history?.amend(ed.plan);
  // which step the wizard is on now: the step key, 'fin' — “Finishing touches”, null — the wizard is not running
  P.cur = () => {
    const m = ed.modes;
    const w = state();
    if (w.fin) return 'fin';
    if (w.askDev || m.devices?.wizardOn?.()) return 'devices';
    if (w.ask || m.sensors.wizardOn?.()) return 'sensors';
    if (m.lights.wizardOn?.()) return 'lights';
    if (m.furniture.wizardOn?.()) return 'furniture';
    return m.rooms.wizardPhase?.() || (ed.plan.rooms.length ? null : 'rect');
  };
  P.status = k => {
    migrate();
    return stepStatus(ed.plan, k);
  };
  P.done = k => P.status(k) === 'confirmed';
  P.enter = k => {
    if (!isStep(k)) return;
    migrate();
    // migrate() has just made sure the plan has onboarding.
    if (!ed.plan.onboarding!.steps[k]) {
      recordStep(ed.plan, k, 'in_progress');
      save();
    }
  };
  const can = (k: OnboardingStepId): boolean =>
    k === 'rect' ? !ed.plan.rooms.length : ed.plan.rooms.length > 0;
  const nextMand = (from: OnboardingStepId | null | undefined): OnboardingStepId | null | undefined => {
    const i = MAND.findIndex(s => s[0] === from);
    if (from && i < 0) return null;
    return MAND.slice(i + 1)
      .map(s => s[0])
      .find(k => can(k) && !['confirmed', 'deferred'].includes(P.status(k)));
  };
  // “Run setup” in the menu: from the first unpassed mandatory step; all passed — “Finishing touches”
  P.resume = () => {
    const k = MAND.map(s => s[0]).find(k => can(k) && !P.done(k));
    k ? P.go(k) : toEnd();
  };
  // After the main steps — one question about readings on the walls (D-034), if HA has something to show and it was not decided yet.
  // “Show” — the “Sensors” step (the first tile is the 3D view), “Skip” — the step is deferred, then the summary.
  // Before it — the same about devices (D-048): “Home Assistant has 2 air conditioners, 3 curtains. Show them in the model?”
  const undecided = (k: OnboardingStepId, mode: OptionalStepMode | null | undefined): boolean =>
    !!mode?.available?.() && !['confirmed', 'deferred'].includes(P.status(k));
  const toEnd = (): void =>
    undecided('devices', ed.modes.devices)
      ? P.askDevices()
      : undecided('sensors', ed.modes.sensors)
        ? P.ask()
        : P.finale();
  const later = (k: OnboardingStepId): void => {
    ed.wizard.set(id(), null);
    migrate();
    recordStep(ed.plan, k, 'deferred');
    save();
  };
  P.askDevices = () => {
    ed.step(null);
    ed.banner();
    ed.wizard.set(id(), {askDev: true});
    const c: Partial<ReturnType<typeof ed.modes.devices.counts>> = ed.modes.devices.counts?.() || {};
    const n = (k: 'climate' | 'cover' | 'contact'): number =>
      c[({climate: 'ac', cover: 'cover', contact: 'contact'} as const)[k]] || 0;
    const what = [
      n('climate') && t('{0, plural, one {# air conditioner} other {# air conditioners}}', n('climate')),
      n('cover') && t('{0, plural, one {# curtain} other {# curtains}}', n('cover')),
      n('contact') &&
        t('{0, plural, one {# door/window sensor} other {# door/window sensors}}', n('contact')),
    ].filter(Boolean);
    ed.step(
      t('Home Assistant has {0}. Show them in the model?', what.join(', ')),
      [
        [
          t('Skip'),
          () => {
            later('devices');
            toEnd();
          },
        ],
        [t('Show'), () => P.go('devices'), true],
      ],
      null,
      {id: 'devices-ask'},
    );
  };
  P.ask = () => {
    ed.step(null);
    ed.banner();
    ed.wizard.set(id(), {ask: true});
    ed.step(
      t('Show sensor readings on the walls — temperature, humidity, CO₂?'),
      [
        [
          t('Skip'),
          () => {
            later('sensors');
            P.finale();
          },
        ],
        [t('Show'), () => P.go('sensors'), true],
      ],
      null,
      {id: 'sensors-ask'},
    );
  };
  P.after = (from, {defer = false} = {}) => {
    if (from) {
      migrate();
      recordStep(ed.plan, from, !defer && stepFacts(ed.plan, from).complete ? 'confirmed' : 'deferred');
      save();
      ed.versions?.mark('step', from);
    }
    const k = nextMand(from);
    k ? P.go(k) : from === 'sensors' ? P.finale() : toEnd();
    // rooms are named — sizing by the area from the documents is exact (D-038): the balcony is already recognized by its name
    if (ed.plan.scaleBy === 'rect' && !['rect', 'split', 'open'].includes(from)) ed.fitArea?.('rooms');
  };
  // “Back”: a mandatory step — to the previous one on the path; the summary and “Sensors” (with the question about them) → Lights
  // (a mandatory step is not passed — to it); “Outline” and “Rooms” — the area dialog (to correct it); “Outline” without a photo — the start screen
  const photo = (): boolean => ed.underlay.ready;
  P.canBack = () => !!P.cur();
  P.back = () => {
    const k = P.cur();
    ed.capture = null;
    ed.v.cv.style.cursor = '';
    if (k === 'rect' || k === 'split') {
      // flows.ts sets both when the editor starts, before any step runs.
      if (k === 'split' || photo()) ed.askArea();
      else ed.showStart();
      return;
    }
    const i = MAND.findIndex(s => s[0] === k);
    if (i > 0) P.go(MAND[i - 1][0]);
    else if (k === 'fin' || k === 'sensors' || k === 'devices') P.go('lights');
    else P.finale();
  };
  P.go = k => {
    if (ed.modes.lights.guardLeave?.(() => P.go(k))) return;
    ed.capture = null;
    ed.v.cv.style.cursor = '';
    ed.step(null);
    ed.banner();
    for (const m of [ed.modes.furniture, ed.modes.lights, ed.modes.devices, ed.modes.sensors]) m?.reset?.();
    ed.modes.rooms.wizardAt(null);
    ed.wizard.set(id(), null);
    if (k === 'sensors') {
      ed.modes.sensors.begin();
      return;
    }
    if (k === 'devices') {
      ed.modes.devices.begin();
      return;
    }
    if (k === 'furniture' || k === 'lights') {
      ed.modes.rooms.wizardAt(k);
      return;
    }
    ed.setMode('rooms');
    ed.modes.rooms.wizardAt(k);
  };
  // Summary (D-043): all steps are visible in the path strip; the list shows only unfinished ones, with a counter and a jump.
  // The main button is “See the result”: “Preview”, the home as it will be seen on the card (D-047).
  // Everything confirmed — “The basics are done”. Readings on the walls are not listed as a separate item: they were asked about before the summary
  // (P.ask); to go back — the icon in the path strip.
  P.finale = () => {
    ed.wizard.set(id(), {fin: true});
    const toBoard = !!ed.ha?.board && !ed.ha.board.exists();
    const open = MAND.filter(([k]) => P.status(k) !== 'confirmed');
    const result = document.createElement('div');
    result.className = 'wizard-result';
    for (const [k] of open) {
      const s = P.status(k);
      const f = stepFacts(ed.plan, k);
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.status = s;
      b.innerHTML = icon(s === 'confirmed' ? 'check' : 'right', 14) + '<span></span><small></small>';
      find(b, 'span').textContent = nameOf(k);
      find(b, 'small').textContent =
        statusName(s) + (['names', 'lights'].includes(k) ? ` · ${f.ready}/${f.total}` : '');
      b.disabled = !can(k);
      b.onclick = () => P.go(k);
      result.append(b);
    }
    const back = ed.backBtn();
    back.path = true; // the wizard card — with the path strip
    ed.step(
      open.length
        ? t('You can return to deferred steps at any time.')
        : t('The basics are done — your home is in 3D.'),
      [
        ...(open.length ? [result] : []),
        back,
        ...(open.length
          ? ([
              [
                t('Continue later'),
                () => {
                  ed.wizard.set(id(), null);
                  ed.step(null);
                },
              ],
            ] satisfies BannerItem[])
          : []),
        // in HA, while the Home Twin dashboard does not exist, the main step is putting the home there (D-059)
        [
          t('See the result'),
          () => {
            ed.wizard.set(id(), null);
            ed.step(null);
            ed.setLook?.(true);
          },
          !toBoard,
        ],
        // flows.ts sets ed.flows when the editor starts.
        ...(toBoard
          ? ([[t('Add to dashboard'), () => ed.flows.addBoard(), true]] satisfies BannerItem[])
          : []),
      ],
      null,
      {exit: false, id: 'fin', fixed: true},
    );
  };
  // The path strip (D-043) is always visible: step numbers, a done step — with a check mark, a deferred one — with an orange ring,
  // optional ones — with icons. The tooltip on a dot is the name and the state, a click jumps to the step.
  P.el = () => {
    const k0 = P.cur();
    if (!k0) return null;
    const box = document.createElement('nav');
    box.className = 'path';
    box.setAttribute('aria-label', t('All steps'));
    const dot = (k: OnboardingStepId, label: string, opt: boolean): HTMLButtonElement => {
      const cur = k === k0;
      const s = P.status(k);
      const b = document.createElement('button');
      b.type = 'button';
      b.className =
        'dot' +
        (opt ? ' opt' : '') +
        (cur ? ' cur' : s === 'confirmed' ? ' done' : s === 'deferred' ? ' later' : '');
      b.title = nameOf(k) + ' · ' + statusName(s);
      b.setAttribute('aria-label', b.title);
      if (cur) b.setAttribute('aria-current', 'step');
      b.innerHTML = s === 'confirmed' && !cur ? icon('check', 11) : label;
      if (cur || !can(k)) b.disabled = true;
      else
        b.onclick = e => {
          e.stopPropagation();
          P.go(k);
        };
      return b;
    };
    MAND.forEach(([k], i) => {
      if (i)
        box.append(
          Object.assign(document.createElement('i'), {className: P.done(MAND[i - 1][0]) ? 'on' : ''}),
        );
      box.append(dot(k, String(i + 1), false));
    });
    box.append(Object.assign(document.createElement('i'), {className: 'gap'}));
    for (const [k, , ic] of OPT) box.append(dot(k, icon(ic, 11), true));
    const mi = MAND.findIndex(s => s[0] === k0);
    box.append(
      Object.assign(document.createElement('span'), {
        className: 'path-name',
        textContent:
          k0 === 'fin'
            ? t('Current result')
            : mi >= 0
              ? nameOf(k0) + ' · ' + t('Step {0} of {1}', mi + 1, MAND.length)
              : nameOf(k0) + ' · ' + t('optional'),
      }),
    );
    return box;
  };
  return P;
}
