# Home Twin Onboarding Audit

Date of the original audit: November 6, 2026. Its results drove the state and interface changes in D-042; the card was then refined in D-043, and opening handling in D-044 ([decision log](../decisions.md)). The text below preserves the observations made before those changes and is not a current defect list. No testing with new users has been done; the roughly 1024 px limitation from D-043 and the remaining checks are tracked in [status.md](../status.md).

## Summary

The foundation fits the task: a person builds their own apartment, immediately sees it in 3D, links rooms to Home Assistant, and checks the lights. This is learning through real work. That approach is worth keeping.

The main weakness is inconsistent management of attention and state. Each step looks explainable on its own, but together they demand too many context switches: a large card, an object panel, an outline, a pulse, 3D, several similar buttons. Sometimes the completion message disagrees with the actual result.

I propose keeping the six steps and their order accepted in D-041. Improve the shared shell, reduce secondary actions within a step, and unify how results are confirmed. Furniture before lights is justified: lighting under a kitchen or a bed needs an object to attach to.

The "best possible variant" cannot be established by expert review. Below, reproduced problems, conclusions from the code, and hypotheses to test on new users are kept separate.

## What was checked

- Local build `localhost:8766`, Russian interface, separate browser profile.
- Starting from scratch, the demo, photo upload handling, area, and the alternative scale by a wall.
- Outline → rooms → windows and doors → Home Assistant → furniture → lights → finale; sensors and saving the camera angle.
- Adding the first item with a real drag, skipping steps, going back, reloading and resuming, an invalid area value, reduced-motion mode.
- Window sizes: 1280×633 and 1440×900; additionally the openings step at 1024×768 and 390×844.
- For some checks the geometry was prepared through the editor API; the subsequent actions and screens were verified in the browser. This is a technical walkthrough, not a study with independent participants.
- This build uses `mockHA`: a real connection to HA, network errors, and control of physical lamps were not tested. The other nine languages, all devices, and all variants of complex geometry are outside this audit.
- The existing 63 automated tests pass. This does not refute the problems found: consistency of drafts, summaries, and hints needs separate scenario checks.

Screenshots are in the `images/onboarding-audit-2026-11-06/` folder, local only: they show the owner's apartment and are not part of the repository. Interactive proposal: [sketch of the “Windows & doors” step](onboarding-concept-2026-11-06.html).

## What already works well

1. Three clear ways in: upload a plan, draw one, open an example. No questionnaire before the first action.
2. Live 3D gives feedback right after building, long before the finale.
3. Rooms and lamps go in sequence, by place on the plan. The user does not have to build the action queue themselves.
4. There is undo, redo, exiting the wizard, and saving the current step. Reloading on the openings step kept the plan and the stage; the start screen offered to continue.
5. The new contextual openings row already reacts to the selection: wall → opening type → editing.
6. Scale by area and lamp guessing reduce the amount of manual work. They should be accompanied by an exact statement of the assumptions.

## Step-by-step walkthrough

| Stage | Observation | Proposal |
|---|---|---|
| Start | Clean composition, three clear options. "A couple of minutes and it is in 3D, with your lights" promises an unverified time. | "Create a plan of your apartment and place lights from Home Assistant". In the demo, clearly mark it as an example; in this build HA is still simulated. |
| Area | One number is a low barrier to entry. Entering `2` shakes the window, but no reason for the rejection appears. | Show the error text next to the field. Explain that scale by area is approximate; suggest checking accuracy against a known wall. |
| Outline | Two clicks is a simple mechanic. After the photo there is an active “Done” although nothing has been drawn yet. | After the first corner, change the hint to "Now click the opposite corner". Move on after the second click; a separate ready button is not needed here. |
| Rooms | After the first split the explanation collapses compactly. For an apartment of complex shape, there is no explicit explanation of removing extra outer parts. The line direction changes automatically. | A hint at the line: "Click to place a wall · Tab — rotate". After the first split — an example available on request, "How to remove an extra part". |
| Windows & doors | The new bottom row works better than the large card. However, the wall finish takes up most of the panel, and two buttons pulse endlessly. | In the foreground, only the choice of opening; finish and exact sizes expand separately. After adding, report "Window added", then suggest the next one. |
| Home Assistant | Areas are offered immediately and the room is highlighted. Visible at the same time: floor material, splitting into two areas, a link to HA, and two different “Skip” buttons. | Title "Which room is this in Home Assistant?". Buttons "Skip room" and "Finish linking". Floor and splitting go in additional settings. |
| Furniture | The meaning of placing it before lights is right. The explanation card covers part of the plan itself; the catalog is general, although the task is about furniture with lighting. | Keep access to the whole catalog; show kitchen cabinets and a bed first. Explain the purpose: "This will help place the lighting". The hint right at the bottom. |
| Lights | The guessed lamp is immediately visible both in the plan and in 3D. But the draft, room confirmation, and step completion are not distinguished clearly enough. | "Check the lights in the bedroom" → “Confirm room”. Separately — “Finish placing lights”. Show explicitly that the current position was proposed automatically. |
| Sensors | Recommended readings are already placed. Before editing them, a nested camera-angle step appears; the list can immediately shift attention to a sensor of a missing room. | First show the result "Added 5 readings". Offer the camera angle as a tweak to the current result, leaving the option to continue with the current view. Do not start with an exclusion until the main result is explained. |
| Card view | The action is concrete and visually verifiable. The term "card" assumes familiarity with the final product. | Show a thumbnail of the future view and the text "This is how the apartment will look on your Home Assistant dashboard". |
| Finale | The same "Main part done" is shown for different results. Unfinished required steps are not listed. | The actual outcome: rooms, openings, confirmed lamps; a separate "Left for later" list. One explicit path forward. |

## Problems to fix first

Priorities: **P1** — a state error or a significant obstacle to the task; **P2** — clarity, attention, and convenience; **P3** — refinement after hypotheses are tested. The priority of the mobile scenario depends on whether phones are part of target support.

### P1. The “Done” button can leave a beginner without a task

After the photo and area entry, on the outline step the “Done” button is available when `rooms.length === 0`. Pressing it hides the banner, leaves the rectangle tool and zero rooms. No transition to the next action happens.

Confirmed in the browser. Cause: `afterCalibration()` in [flows.js](../../editor/src/editor/flows.js) creates a button with the handler `ed.step(null)`. The "From scratch" branch has no such button.

**Fix:** the same outline-creation mechanic in both branches; the next step starts when the rectangle is actually completed. Hiding help is a separate secondary action with an appropriate name.

### P1. Three different understandings of "step passed"

Navigation uses `passed`, checkmarks use `DONE`, and the step texts count progress again inside the modes. They diverge:

- Skipped windows and furniture are no longer requested, but look like not-yet-started path points.
- In a check with a single lamp, `placed:true, draft:true`, the function `path.done('lights')` returned `true`, while the card showed "Placed 0 of 1".
- A room with two areas, of which one is linked: `path.done('names') === true`, but the text reads "Linked 1 of 2".
- After skipping openings and furniture and finishing lights without confirming lamps, the finale reported "Main part done" with **0 of 15 lamps placed**.

Source: [wizard-path.js](../../editor/src/editor/wizard-path.js), `DONE`, `passed`, `P.after`, `P.finale`; counters in [rooms.js](../../editor/src/editor/modes/rooms.js) and [lights.js](../../editor/src/editor/modes/lights.js).

**Fix:** a single state model: not started / in progress / completed by the user / deferred; plus a separately computed actual result. An automatic draft does not count as confirmation. For rooms, both parts are counted. For openings and furniture, the number of objects alone does not prove completeness — a deliberate user transition is needed.

Skipping remains allowed. It should be shown honestly and kept in the return list.

*Screenshot (kept locally, not in the repository): Finale after skips: completion message with empty lights*

### P1. In the lights step, saving, confirming, and moving on conflict

With the first automatically placed lamp, the top says “Saved”, inside the panel — “Next”, in the hint — “Done”. Pressing “Done” opens the question “Save this room's lights?” with “No / Yes”. Meanwhile the current room's result is still a draft.

Technically, saving the draft in the browser exists. The problem is that the user sees no difference between a saved draft and a confirmed arrangement.

**Proposed names:** "Draft saved"; “Confirm room”; “Finish placing lights”; in the question — "Save arrangement" and "Discard room changes". Keep the warning about genuinely abandoning work.

Later, test a variant with automatic saving of manual edits and a separate confirmation only for automatic guesses. This is a behavior change and must be tested separately from the renaming.

### P1 if phones are supported. The bottom row loses the task and buttons

At 390×844, the hint text element measured **0 px** wide with content 222 px wide. The right edge of the “Skip” button is around **532 px** on a 390 px screen. The top panels also overlap. At 1024×768 the selected row fit.

The cause is the current layout: `.banner.short` forcibly forbids wrapping, and the path dots and buttons do not shrink. [styles.css](../../editor/src/styles.css).

**Fix:** an adaptive two-row card; "3 of 6 · Windows & doors" instead of a row of dots; actions on the next row. On a phone the object panel becomes a bottom sheet, with help embedded in it. Also test 200% browser zoom and long translations. Element sizes cannot simply be scaled down proportionally.

*Screenshot (kept locally, not in the repository): On a narrow screen the task disappeared, completion is outside the visible area*

### P1. The area error is not explained

Entering `2` is rejected; the form gets the class `bad`, but the text stays the same, and `aria-invalid` is absent. The user has to guess the 5–5000 m² limit from the code.

**Fix:** explain the valid value next to the field, keep the entered number for correction. Replace the wording about "real size" with "We will estimate the scale from the area. You can refine it later by a wall length": the initial calculation assumes 80% of the rectangle's area is inside, then recalculates after room classification.

Describing the error in text is recommended by [W3C, Error Identification](https://www.w3.org/WAI/WCAG22/Understanding/error-identification.html).

### P2. Too many objects demand attention at once

In the lights step, working simultaneously: a large light card, a purple outline around the room with the panel, a room pulse, a lamp highlight, and a 3D zoom hint. In room linking, floor, area splitting, and a link to HA are added to the main choice. In furniture, the instruction physically overlaps the item placement area.

On the sensor cards there is one more layout bug: the long stage name together with the path dots extends beyond the left edge of the card. This is visible in the sensors step screenshot (kept locally); shortening the text should not replace a robust layout.

**Rule:** one main object of action; no more than one brief moving accent. Overall progress stays in a stable place. Settings that do not help the current task are available on expand.

*Screenshot (kept locally, not in the repository): Lights step: card, panel, outline, and 3D at the same time*

### P2. The first successful operation can re-enable onboarding

In furniture, after actually dragging the first item, the card stayed beside the catalog, and the dimming turned on again. In the state snapshot after 900 ms: `furniture.length === 1`, `data-side="right"`, `.spot.on.dim`.

Cause: the hint identifier is built from its text in [app.js](../../editor/src/editor/app.js). After the first item the text is extended with a phrase about “Done”, producing a new key. `coach.show()` treats this as a new hint, and `coach.acted()` ignores changes in the first 700 ms after it appears.

**Fix:** stable identifiers for stages and subtasks, independent of text and translation. A successful action explicitly moves the hint to a calm state. Replace the 700 ms period with a distinction between a user action and an automatic operation.

### P2. The same words denote different actions

In room linking there are two "Skip" buttons: one about the room, the other about the whole stage. “Done” closes an explanation in one place, completes a stage in another, and invokes a confirmation in a third. The step name "Home Assistant" does not explain the task. The short row hides the stage name and leaves only numbers.

**Fix:** name the object of action in the button and keep the current stage's name visible. "Skip room", "To furniture", “Finish placing lights”. Separate exiting the wizard from everyday forward movement, for example with an accessible “Pause” button explaining that the project is saved.

### P2. Accessibility of hints and motion is incomplete

- The expandable short hint is a `span` with `onclick`, no role and `tabIndex=-1`: it is unreachable by keyboard.
- In the `prefers-reduced-motion: reduce` check, the animations of the wall panel and its buttons turned off — this works.
- But in the lights step the 3D handle still has `grip-nudge` and `grip-ring`. The room pulse is drawn in canvas via `Math.sin(performance.now()/220)` without checking the motion setting.
- Adding furniture from the catalog is implemented by dragging; a "select item → click on the plan" way is also needed. This is useful for an ordinary trackpad user too.

**Fix:** a real "How to do it" button, a single motion setting for CSS and canvas, an alternative way to place furniture. Transitions must keep focus predictable. A full accessibility audit is still needed; these are specific places found, not a conclusion about the whole product's WCAG conformance.

References: [W3C: Animation from Interactions, AAA](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html), [Dragging Movements, AA](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html). Automatic motion lasting longer than five seconds under certain conditions requires a way to stop it; applicability depends on how it is triggered: [Pause, Stop, Hide](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html).

## Proposed common system

**Stable step row:** "3 of 6 · Windows & doors" + one current action + a clear transition. The full step list opens on the name. "Done" and "For later" statuses are distinguished.

**Object panel:** contains the choice needed right now. For a wall — an opening; for a room — the corresponding HA area; for a lamp — checking the look and position. Detailed sizes, materials, and special cases expand on request.

**Three levels of help:** a short command; an explanation behind a "How to do it" button; a small demonstration of the gesture for a non-standard operation. The last is especially useful for splitting the rectangle and for working with the strip, not for every obvious button.

**Attention:** a brief highlight of the needed button or wall, then a static accent. For the initial prototype, 1–2 pulses over 1–2.5 seconds can be tried; this is a design hypothesis, not a scientifically established norm. Keep panel rotation as a rare exception and do not repeat it on ordinary transitions. Strengthening the effect helped notice a specific panel, but applying this practice constantly will increase competition for attention.

**Successful action:** confirm with a concrete result — "Window added", "Bedroom linked", "Room lights confirmed". After the first operation, keep helping with the remaining result rather than repeating the initial explanation.

**Finale:** list what was done and what was deferred. "Plan saved" must always mean what was actually saved; "Lights set up" — only the confirmed arrangement. In the current prototype, do not promise card publication or connection to a real HA, which do not exist yet.

## Text variants

These are editorial proposals. Numbers and room names must be substituted from the current state.

| Place | Proposal |
|---|---|
| Start | "Create a plan of your apartment and place lights from Home Assistant". |
| Area | "Enter the area from your documents. We will estimate the plan's scale from it". |
| Area error | "Enter an area from 5 to 5000 m², for example 62.5". |
| Outline start | "Click one corner of the rectangle around the apartment". |
| Second corner | "Now click the opposite corner". |
| Rooms | "Click a wall line to split the room. Tab — rotate the line". |
| Openings, nothing selected | "Click the wall where you need a window or door". |
| Wall selected | "What to add to this wall?" — “Window” / “Door”. |
| Opening created | "Window added. Drag it into place; the edges change the width". |
| Linking | "Which room is this in Home Assistant?"; progress "Linked 2 of 6". |
| Furniture | "Add furniture with lighting — for example, kitchen cabinets or a bed". |
| Lights | "Check the lights in the bedroom. The look and position were chosen automatically". |
| Light confirmation | “Confirm room”; secondary "Back to the list". |
| Question about changes | "Save arrangement" / "Discard room changes". |
| Sensors | "Added 5 readings. Keep the ones you need". |
| Camera angle | "Choose how the apartment will look on your Home Assistant dashboard". |
| Finale with skips | "Plan saved. For later: windows and doors, furniture, 15 lamps". |

## What the research is based on

**Learning in context.** NN/g analyzes why upfront tours distract and are forgotten, and recommends help at the moment of the task. Apple likewise suggests learning by doing and contextual hints. For Home Twin this supports the existing work on one's own apartment and short instructions at the specific action. It is not grounds for removing the wizard from a complex editor. [NN/g](https://www.nngroup.com/articles/onboarding-tutorials/), [Apple HIG](https://developer.apple.com/design/human-interface-guidelines/onboarding).

**Progressive disclosure of complexity.** Main actions are visible immediately, rare settings are available separately. Hence the proposal to remove materials from the first level of the panel when the task is to insert a window or link a room. [NN/g, Progressive Disclosure](https://www.nngroup.com/articles/progressive-disclosure/).

**Clear progress.** Carbon treats the indicator as a way to show current, completed, and future stages. In Home Twin a linear route is combined with arbitrary transitions and skips; therefore the indicator needs explicit states, not just an object count. This is our conclusion from the current behavior, not a ready-made Carbon rule for editors. [Carbon](https://www.carbondesignsystem.com/building-blocks/core/components/progress-indicator/guidelines).

**Buttons with consequences.** NN/g recommends concrete actions instead of the generic "Yes / No". This applies directly to saving a room's lights. [Confirmation Dialogs](https://www.nngroup.com/articles/confirmation-dialog/).

**Limits of the research.** In an NN/g experiment with 70 participants and four mobile apps, card tutorials gave no significant gain in task success or speed. This is a different class of interface; the result cannot be transferred directly to teaching geometry. In the old decision D-039, a 16% completion rate of seven-step tours from the Chameleon 2022 report appears. This is statistics from a tour vendor, not proof that the six necessary stages of building an apartment are bad. [NN/g study](https://www.nngroup.com/articles/mobile-tutorials/), [Chameleon primary source](https://www.chameleon.io/benchmark-report-2022).

**Domain reference.** magicplan offers several ways to create a room: rectangle, freeform, tracing an uploaded plan. Floorplanner documents placing windows and doors on a wall and changing their sizes. This confirms domain operations familiar to users, but does not prove their onboarding is superior. For competitors, public documentation was studied; the authenticated product was not walked through. Home Twin's rectangle-with-splitting should be tested separately on an apartment with niches and protrusions. [magicplan](https://help.magicplan.app/create-your-first-floor-plan), [Floorplanner, manual](https://cdn.floorplanner.com/static/brochures/FloorplannerManualEN.pdf).

## Order of work and result verification

**First package — correctness:** remove the false “Done” on the outline; reduce step states to a single model; account for drafts and zones; distinguish skipping a room from skipping a stage; produce an actual summary; explain the area error. If phones are supported — fix the overflow immediately.

**Second package — shared shell:** a stable bottom card on all steps, a visible stage name, help on request, main actions in the object panel, limited animation. Stable hint IDs instead of a key derived from text. Full reduced-motion support and accessible help expansion.

**Third package — verifying complex mechanics:** a demonstration of splitting and removing the extra part; initial furniture selection; clear lamp confirmation and a single camera-angle scenario with sensors. The decision on a more serious change of mechanics is made after observing beginners.

For the first qualitative round — about five new users from one target segment: HA owners without CAD experience. If we separately target people without HA or experienced designers, that is a different group. The small sample is for finding difficulties, not for proving conversion growth. [NN/g on qualitative and quantitative samples](https://www.nngroup.com/articles/5-test-users-qual-quant/).

Task: using the same plan with a niche, build the rooms, insert a window and a door, link the spaces, add furniture with lighting, confirm the lights; then defer one stage and continue after a reload. The moderator does not suggest where to click. Compare variants on comparable new participants, so that learning from the first version gives no advantage to the second.

Record: time to the first meaningful action and the first result in 3D; wrong clicks; help requests; completion without the moderator's hints; whether the person distinguishes "saved", "confirmed", and "for later"; whether they can continue what was deferred. For product analytics, propose the events `step_started`, `first_action`, `step_confirmed`, `step_deferred`, `help_opened`, `wizard_resumed`, `room_lights_confirmed`; room names, photos, and device identifiers are not needed in these events. Analytics was not connected during the audit.

Acceptance criteria for the fixes: the required action is reachable at the tested window sizes; counters and step status are consistent; after the first successful operation the hint does not turn on again; deferred items are visible in the summary; all help buttons are keyboard accessible; reduced motion applies to both CSS and canvas.
