# Daily use

## Add, finish and reorder

| Do this                | Mouse                                | Keyboard                               |
| ---------------------- | ------------------------------------ | -------------------------------------- |
| Add an item            | Type in the top field, click **Add** | Type, then **Enter**                   |
| Finish an item         | Click its checkbox                   | Focus it, press **Space**              |
| Reopen a finished item | Open **Done**, untick it             | Focus it, press **Space**              |
| Move an item           | Drag the ⋮⋮ handle                   | **Alt+Up** / **Alt+Down**              |
| Go through the list    |                                      | **Up** / **Down** (from the input too) |
| Hide the window        | Close button                         | **Esc**                                |
| Sync at once           | **Sync now**                         | **Tab** to **Sync now**, **Enter**     |

New items go to the top level, after the last open item.

Items can only move among their siblings: a sub-item stays under its parent, and a moved item takes its sub-items with it. Finished items don't move; they sink to **Done**.

Finished top-level items are collected in the collapsed **Done** group, with their sub-items. Finished sub-items of open items stay where they are, crossed out.

If you set a custom task state on an item in Trilium, it appears as a small label next to it. Finishing the item in the app replaces that state with a normal tick.

Formatting, links and everything else in the note are kept. The window shows plain text only.

## When the window opens

The window opens centred and on top of other windows, including full-screen video:

- after you sign in,
- after every screen unlock, however short the lock,
- after every resume from standby or hibernation,
- when you start the app again while it is running.

Triggers within 3 seconds of each other count as one. As a backup, if the PC was asleep for more than about two minutes without the system reporting it, the window opens too.

The window stays until you close it with **Esc** or the close button. Closing only hides it; the app keeps running in the tray. To end it, choose **Quit** in the tray menu.

On Windows, focus rules may sometimes show the window without keyboard focus. Click into it to type.

## The tray menu

| Entry        | Effect                                    |
| ------------ | ----------------------------------------- |
| **Show**     | Shows the window                          |
| **Sync now** | Fetches the latest list and sends changes |
| **Settings** | Opens the settings                        |
| **Quit**     | Ends the app until the next sign-in       |

## The status line

| Message                                | Meaning                                                                |
| -------------------------------------- | ---------------------------------------------------------------------- |
| Synced at 09:41.                       | The list matches Trilium as of that time.                              |
| Offline. 2 changes waiting.            | Trilium is not reachable. Your changes are saved and will be sent.     |
| Not connected. Showing the saved list. | Not reachable yet, and nothing is waiting.                             |
| Trilium rejected the token.            | See [Troubleshooting](./troubleshooting.md#trilium-rejected-the-token) |
| Other messages                         | See [Troubleshooting](./troubleshooting.md#sync-errors)                |

While the window is visible, the app syncs every 60 seconds, and half a second after each change.

## Offline use

The app keeps the last list it fetched, so it opens at once even before Wi-Fi is connected. You can add, finish and reorder items offline. Each change is saved on your disk before anything is sent, and survives a restart or crash. When Trilium is reachable again, the app sends the changes in order: after 1, 2, 5 and 10 seconds, then every 30 seconds, even while the window is hidden.

If an item was deleted in Trilium in the meantime, changes to it are skipped, and a notice tells you how many.

Before the first change of each day, the app asks Trilium to save a revision of the note, so you can always go back. See [Restore an earlier note](./troubleshooting.md#restore-an-earlier-note).

Note that if you tick an item in the app offline and change the same item in Trilium before the app reconnects, the app's change wins for that item.

## Cleaning up done items

The app never deletes anything. Finished items stay in the note, ticked, so you have a record. Clean them up in Trilium whenever you like: open the note and delete the finished items there. The app shows the new list at the next sync.
