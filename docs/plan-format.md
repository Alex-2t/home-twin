# The plan format and how it changes

A home is one JSON plan (D-005): its rooms, openings, furniture, lights, sensors, devices and settings. Its shape is declared in
`editor/src/core/types.ts` (the sections "the plan file"). Plans are kept in many places, and each of them outlives a release:

| Where | Written by | Read by |
|---|---|---|
| Home Assistant, `.storage/home_twin.plan` | the editor in the HA panel | the panel, the dashboard card |
| The browser (the plan, undo steps, version history) | the editor | the editor |
| A plan file the user downloaded | the editor | any later editor |
| The AI build service (`home.json` of a build) | the service | the editor in HA or on the site |
| The gallery's published homes | the service | the editor in HA or on the site |

So a plan written today must open in every later editor, and an older editor must never spoil a plan a newer one wrote (D-121).

## Versions

Every plan names its format: `plan.version` (a file without one is version 0). The editor writes `PLAN_VERSION`
(`editor/src/core/plan-format.ts`).

- **An older plan** is brought up when it is read (`migrate`), one step per version (`FORMAT_STEPS`). A step is written once and
  never changed, so a plan from years ago goes through every step since.
- **A newer plan** (an editor tab older than the plan, an integration rolled back) is never brought down:
  - a file, a published home or an AI build of a newer format is refused with "This home was made in a newer version of Home
    Twin. Update Home Twin to open it." (`NewerPlanError`);
  - a newer plan already open (from HA or the browser) is shown as far as it can be, but never saved: in this browser or in HA.
    The editor shows "Home Twin was updated · Reload" and "Not saved" (`boot.ts`);
  - HA itself refuses a plan of an older format than the one it has (`newer_plan`), even with "Keep mine": an editor without
    this check (a tab opened before an update) cannot write over it either.
- **Before the format goes up**, the plan as it was is kept: HA keeps the last plan of each older format in
  `.storage/home_twin.plan.format<N>` (all devices see it); to bring one back, its `plan` goes into `home_twin.plan` while HA is
  stopped. The browser's version history keeps what it had, and a version restored later goes through the steps again.
- **The AI build service** is told which format the editor reads (`?format=<N>` on `/home` and `/plan`). It ignores it while
  there is one format; once there are two, it answers in the asked format when it can, or the editor tells the user to update.
- **The HA integration's own file** has its own version (`STORE_VERSION`, the shape of `{plan, rev, photo}`); HA migrates it the
  usual way. It is not the plan's format.

## Changing the plan

First decide which kind of change it is.

1. **Additive: an older plan reads right in the new shape.** A new optional field with a default, a new value of a list the
   code degrades when unknown (a furniture model, a finish, a light form). No step, no new version: older plans lack the field.
   The code must still read a plan without it. Most changes are this kind; prefer it.
2. **Breaking: an older plan would read wrong.** A field renamed, moved or split; a meaning or unit changed; an index that
   now counts differently (room edges, `opening.at.edge`); a default that changes how an existing plan looks. Then:
   1. add a step to `FORMAT_STEPS` that brings a plan of the previous version to the new one, in place; it must cope with
      plans that lack fields (any version may have been hand-edited or damaged);
   2. `PLAN_VERSION` goes up by itself (it is the number of steps);
   3. run `node tools/plan-archive.ts` in `editor/` to archive the new format's plans;
   4. add the version to the list below and set the fingerprint in `plan-format.test.ts`;
   5. the AI build service writes `PLAN_VERSION` from the editor it runs with; before deploying it, make sure it can still answer
      editors of the previous format (`?format=`), or users who have not updated cannot open their builds.

Never change a released step or a released archive file. A mistake in a step is fixed by a new step.

## What holds this

- `plan-format.test.ts`: the steps follow each other; a file from before versions comes up; a newer plan keeps its version and
  the fields this editor does not know; a newer file is refused. And a guard: a fingerprint of the plan file's types in
  `types.ts` (comments left out). Any change there fails the test until someone decides which kind of change it is and
  follows the list above.
- `plan-archive.test.ts`: every plan of `editor/demo/plan-archive/v<N>/` opens with today's code, with nothing lost, valid rooms
  and buildable walls; a plan of the current format comes out of `migrate` exactly as it went in. The archive holds the
  reference homes of each format, one plan with every field of the format (`full.json`: wall and floor pieces, an item from
  parts, a rug's own pattern, built-in runs, sensors, devices, scenes, seen lamps, the guided steps' marks), and a hand-made file
  from before versions (`v0/`).
- `ha-live.test.ts`: when HA refuses a plan as older, the editor stops writing.

## Old shapes the drawing code still reads

Before versions, a few old shapes were handled where they are drawn, not in `migrate`. They stay there and are covered by the
archive: an opening without heights (taken as a usual door or window), a wide door without a leaf (drawn as an opening), a light
without a form (guessed from its kind and height), a strip in pieces (rebuilt once as a line round the room, `light.loop`), a
built-in run stored as a rectangle (its ends found from its back side), the first furniture models (`kenney`, hidden in the
catalog). New old shapes go into `FORMAT_STEPS` instead.

## Versions of the format

| Version | What changed |
|---|---|
| 0 | Files from before versions: no `version`, openings may be given by their ends only. |
| 1 | Readings live in `plan.sensors`, not on the room (`room.sens`, D-033). The format of the first release. |
