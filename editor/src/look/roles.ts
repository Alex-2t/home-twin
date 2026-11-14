// What the home panel (editor/look.ts) offers a Home Assistant user who is not an administrator, in the dashboard card (D-059):
// everything to see and to control, nothing that changes the plan. Only administrators may write the plan (home_twin/plan/save
// requires one), so the buttons that open the panel's settings editors are hidden for everyone else. Controls stay: they are HA
// service calls, and HA's own permissions decide them.

/** The look.ts actions that open a settings editor, whose “Done” writes the plan: “Customize panel”, the scenes' “Customize”
 * and its tabs. */
export const ADMIN_ONLY_ACTIONS: readonly string[] = ['layout-edit', 'scene-edit', 'scene-tab'];

/** For the panel's shadow root: those buttons hidden wherever they are. By action, not by class: the round button at the top of a
 * room's screen becomes “Customize panel” there (it is “Home overview” elsewhere), so only its action says what it does now. */
export const NOT_ADMIN_CSS =
  ADMIN_ONLY_ACTIONS.map(action => `[data-action=${action}]`).join(',') + '{display:none!important}';
