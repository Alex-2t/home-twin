// The showcase (D-116): the editor opened with ?show, as another site embeds a home to present it (sync.md). Only Preview, each
// home in its light (core/evening.ts: by day or in the evening): no editor tools and modes, no file menu, and nothing in the home panel that changes the
// plan (the settings a dashboard user who is not an administrator does not get either, look/roles.ts). The viewer still turns
// the home, opens rooms, switches lights and scenes and steps day / night: what a home shows, not how it is set up.

/** The page was opened as a showcase (?show in its address). */
export const SHOWCASE: boolean =
  typeof location !== 'undefined' && new URLSearchParams(location.search).has('show');
