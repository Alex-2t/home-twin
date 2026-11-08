# Saving, undo and plan files — 2026-11-07

The editor was checked in a separate Chrome context on localhost:8766 (1440 × 900), with a synthetic plan and the demo apartment. The user's storage was not used.

## What was fixed

- **Undo and redo did not write the result to autosave.** For example, after undoing a rename the screen showed the old name while localStorage held the new one. Now the restored snapshot is saved.
- **A foreign JSON replaced the project with an empty one.** Now the structure, coordinates, identifiers and file version are validated before replacing. An invalid file changes neither the plan, the autosave nor the underlay. Old files with openings stored by coordinates are supported; geometry errors that can be fixed in the editor do not block opening.
- **Undoing scale and rotation left the photo in the new place.** Snapshots of the current underlay's position were added to the history; a separate photo move is also taken into account before the common transform. The restored position is written to storage.
- **Importing a lights draft outside the wizard deleted the unconfirmed placement.** The draft now stays until the user explicitly confirms or cancels. The placement of lamps and relays is also kept if their entities are currently missing from the HA list.
- **A write error still showed “Saved”.** Now the indicator says “Not saved” and offers to download the file; after a successful write the normal status returns. The two new texts were translated into nine additional languages.
- **An empty saved project could be replaced by a new one at startup.** Now its identifier, name and data are preserved. Corrupted interface-settings JSON or photo-position JSON no longer stops the editor from starting.
- **An open rotation tool and the underlay could remain from another project.** Import resets the currently captured operation; for a different project the previous underlay is deleted. When the same project is reopened, the photo is kept.

Additionally: wall calibration and area changes record changes in the history; IndexedDB waits for the transaction to complete before returning; the URL of the downloaded file is released.

## Checks

- `cd editor && npm test`: **83/83**, including 13 new tests in `history.test.js` and `plan-file.test.js`.
- `npm run build`: successful.
- In the browser: consecutive edits of a room, door, furniture, light and sensor; five undos and five redos via buttons. At each step the whole plan and the autosave were compared.
- Reload after undo: the whole plan matches. The ⌘Z and ⇧⌘Z shortcuts also change both the on-screen and the saved state.
- Export through the menu handler: the contents of the created Blob were checked. The file was imported back through the real file-input handler; all data matched. The demo apartment of six rooms was checked separately, with its photo saved.
- Invalid JSON syntax, a foreign object, an array, `null`, a future version and a corrupted room: the original plan and the saved JSON do not change.
- Simulated `QuotaExceededError`: history keeps working, the previous record stays intact, the indicator reports the error. After the error is cleared, saving recovers.
- Lights draft: preserved after reload and after import with the wizard closed. A lamp missing from HA survives loading.
- Scale and rotation with a photo: undo restores the photo position, including the case where the photo was moved separately before scaling. Import during an open rotation tool resets the old operation.
- Empty named project and corrupted interface settings: the app starts, the project is preserved, the continue button is available.
- There were no console errors or warnings on the checked chain.

## Format limits

The undo history is kept in the tab's memory (up to 200 snapshots); after a reload the last plan is restored, not the whole history. The JSON export contains the plan but not the underlay image. The photo is stored separately in IndexedDB. Home Assistant connectivity checks were run against the current mockHA; the real integration is not connected yet.
