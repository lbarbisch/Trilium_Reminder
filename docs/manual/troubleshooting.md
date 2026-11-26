# Troubleshooting

## The window does not open

- **Is the app running?** Look for the tray icon (blue tick). If it isn't there, start the app from the Start menu or your launcher.
- **After sign-in (Windows):** check **Task Manager → Startup apps** for Trilium Reminder and enable it. The entry is created when the installed app first starts, not in a development run.
- **After sign-in (Linux):** check that `~/.config/autostart/trilium-reminder.desktop` exists. If you deleted it, the app won't create it again; copy it back from [Installation](./install.md#linux). On i3, see [i3 and other window managers](./linux.md#i3-and-other-window-managers).
- **After unlock or standby (Linux):** check the wake service as in [Linux](./linux.md#check-the-service).
- **Behind other windows:** on Windows, focus rules sometimes keep the window from taking keyboard focus. It is still on top; click into it.
- **On Wayland:** make sure the app runs with `--ozone-platform=x11`. See [Wayland](./linux.md#wayland).

## Sync errors

The status line at the bottom shows the last sync result. Your changes stay saved on your PC whatever the error, and are sent once the problem is fixed.

### Trilium rejected the token

Trilium answered _401_. The token was deleted, mistyped, or belongs to another server. The app stops syncing and opens Settings. Create a new token in Trilium (**Options → ETAPI**), enter it, and save.

### The note was not found. Check the note ID in Settings

Trilium answered _404_: the note ID is wrong or the note was deleted. Restore the note from Trilium's **Recent changes**, or enter the right ID.

### The todo note must not be protected

Unprotect the note in Trilium, or use another note. ETAPI cannot read protected notes.

### The todo note must be a text note

The note ID points to a note of another type, such as a code note or a folder.

### Offline. N changes waiting. / Not connected. Showing the saved list

Trilium isn't reachable: no network, the server is down, or the address is wrong. The app retries on its own. Check that the server address opens in a browser. If it does and the error stays, use **Test connection** in Settings.

### Trilium did not answer in time

The server took longer than 10 seconds. The app retries on its own.

### Trilium answered 500 (or another number)

5xx and 429 answers are retried on their own. Other numbers mean Trilium refused the request; check the Trilium server log. Click **Sync now** to try again.

### The note kept changing during sync. Trying again later

The note changed in Trilium three times while the app was saving, for example while you were typing in it. The app tries again shortly.

### The server redirected the request. Enter the final address

Your server sends the app somewhere else, for example from `http` to `https` or to a sub-path. Open the address in a browser, copy the address you end up at (without the part after `#`), and enter that.

### The server did not answer like Trilium. Check the address

Something other than Trilium answered, such as a login page of a reverse proxy. Check the address, and allow `/etapi/` through your proxy without its own login.

### The server's certificate was rejected

Use a certificate from a public authority, such as Let's Encrypt. Self-signed certificates are not supported.

### N changes were not applied

Shown as a notice. Those changes referred to items that were deleted in Trilium before the app could send them, or moves that would have taken an item to another level. Nothing else was affected. Click **Dismiss**.

### The settings file was damaged / The saved state file was damaged

A file in the app's data folder could not be read, for example after a disk error. The app renamed it to `config.json.bad` or `state.json.bad` and started fresh. Any changes that hadn't been sent are in `state.json.bad`; add them again by hand if you need them.

### The saved token could not be decrypted

Your system keyring changed, for example after a reinstall. Enter the token again in Settings.

## Restore an earlier note

Before its first change each day, the app asks Trilium to save a **revision** of the note. To go back:

1. Open the note in Trilium.
2. Open **Note revisions** (the clock icon in the note's toolbar, or the note menu).
3. Pick a revision from before the problem and click **Restore this revision**.

The app shows the restored list at its next sync.

## Logs

The app writes a short log with events and error types, never the token or note content.

| System  | Log file                                   |
| ------- | ------------------------------------------ |
| Windows | `%APPDATA%\Trilium Reminder\logs\main.log` |
| Linux   | `~/.config/Trilium Reminder/logs/main.log` |

The Linux wake service logs to the journal: `journalctl --user -u trilium-reminder-wake`.

## Reporting a bug

Open an issue on [GitHub](https://github.com/lbarbisch/Trilium_Reminder/issues/new/choose) with your OS and desktop, the app and Trilium versions, the steps, and the relevant log lines.

**Never post your ETAPI token, your server address if it is private, or your note content.** The log doesn't contain them, but check what you paste. If you posted a token by mistake, delete it in Trilium (**Options → ETAPI**) at once.

For security problems, follow [SECURITY.md](https://github.com/lbarbisch/Trilium_Reminder/blob/main/SECURITY.md) instead of opening a public issue.
