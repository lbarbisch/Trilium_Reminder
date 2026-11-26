# Linux

Electron reports standby and unlock reliably only on Windows and macOS. On Linux, a small **systemd user service** watches for them and starts `trilium-reminder --wake`. The running app receives that and shows its window. The service runs as your user and needs no root access.

## Wake service

Install it from the app: **Settings → Install wake service**. This works in the deb and AppImage builds, not in a development run.

It does the same as these commands (shown for the deb; for an AppImage, set `SRC` to the `linux/` folder of this repository and `APP` to the AppImage path):

```bash
SRC="/opt/Trilium Reminder/resources/linux"
APP=/usr/bin/trilium-reminder
DEST="$HOME/.local/share/trilium-reminder"
mkdir -p "$DEST" "$HOME/.config/systemd/user"
install -m 755 "$SRC/wake-watch.sh" "$DEST/"
sed -e "s|@SCRIPT@|$DEST/wake-watch.sh|" -e "s|@APP@|$APP|" \
  "$SRC/trilium-reminder-wake.service" > "$HOME/.config/systemd/user/trilium-reminder-wake.service"
systemctl --user daemon-reload
systemctl --user enable --now trilium-reminder-wake.service
```

The script listens on D-Bus for:

- `org.freedesktop.login1` **PrepareForSleep(false)**: the PC resumed from standby;
- `org.gnome.ScreenSaver` and `org.freedesktop.ScreenSaver` **ActiveChanged(false)**: the screen was unlocked (GNOME, KDE Plasma and others).

A screen blank that uses the screensaver signal may open the window too, even without a lock.

Install it again after moving the AppImage. To remove it, see [Uninstall](./install.md#uninstall-on-linux).

## Check the service

```bash
systemctl --user status trilium-reminder-wake
journalctl --user -u trilium-reminder-wake -f
systemctl --user show-environment | grep -E 'DISPLAY|WAYLAND'
```

Then lock the screen for a few seconds and unlock it, and try `systemctl suspend`. The window should appear each time.

If the service runs but the window never appears, the user manager may not know your display. Run this once per session, for example from your desktop's autostart, and restart the service:

```bash
systemctl --user import-environment DISPLAY XAUTHORITY WAYLAND_DISPLAY
systemctl --user restart trilium-reminder-wake
```

The service restarts itself within 5 seconds if the watcher stops.

## KDE Plasma

KDE Plasma sends the `org.freedesktop.ScreenSaver` signal and starts `graphical-session.target`, so the wake service works as installed. KWallet stores the token; see [Secret store](#secret-store).

## i3 and other window managers

i3, Sway, Hyprland and similar don't usually start `graphical-session.target` and have no screensaver service that sends the unlock signal. Set it up by hand.

**Autostart.** i3 does not read `~/.config/autostart`. Add this to `~/.config/i3/config`:

```text
exec --no-startup-id trilium-reminder --ozone-platform=x11 --wake
```

With an AppImage, use its full path instead of `trilium-reminder`.

**Resume from standby.** Install the wake service as above. Then start it from your i3 config, because `graphical-session.target` is never reached:

```text
exec --no-startup-id systemctl --user import-environment DISPLAY XAUTHORITY && systemctl --user start trilium-reminder-wake
```

**Unlock.** Let your locker start the app after it exits. With `xss-lock` and `i3lock`, `-n` keeps i3lock running until you unlock:

```text
exec --no-startup-id xss-lock --transfer-sleep-lock -- sh -c 'i3lock -n -c 000000; trilium-reminder --ozone-platform=x11 --wake'
```

This also covers resume if your locker runs before sleep. Triggers within 3 seconds of each other count as one, so the window does not open twice.

On Sway, use `swayidle` and `swaylock` in the same way: run `trilium-reminder --ozone-platform=x11 --wake` after `swaylock` returns, and in swayidle's `after-resume` hook.

## Wayland

Wayland restricts apps from raising their own windows and taking focus. All launchers this app creates therefore start it with `--ozone-platform=x11`, so it runs through XWayland where the window can come to the front. If you start it yourself, pass the same flag:

```bash
trilium-reminder --ozone-platform=x11
```

On a pure X11 session, such as i3, the flag does nothing harmful.

## Tray icon

The tray icon uses the StatusNotifierItem (AppIndicator) protocol.

- **KDE Plasma:** works out of the box.
- **GNOME:** install the _AppIndicator and KStatusNotifierItem Support_ extension.
- **i3 with i3bar:** i3bar only supports the older XEmbed tray. Run a bridge such as [snixembed](https://git.sr.ht/~steef/snixembed) (`exec --no-startup-id snixembed --fork`), or use a bar with StatusNotifierItem support, such as polybar or waybar.

Without a tray, start the app again to show the window. Use `pkill -f trilium-reminder` to quit it.

## Secret store

The token is encrypted with your desktop's keyring: KWallet on KDE, GNOME Keyring (libsecret) on GNOME and many others. If no keyring is found, Electron falls back to a fixed key, which barely protects the token. **Settings** then shows a warning.

On i3, Electron often can't tell which keyring to use. Install GNOME Keyring or KWallet, make sure it is unlocked at sign-in, and start the app with the matching flag, for example:

```text
exec --no-startup-id trilium-reminder --ozone-platform=x11 --password-store=gnome-libsecret --wake
```

Use `--password-store=kwallet6` (or `kwallet5`) for KWallet. Then open **Settings**, enter the token again and save. If you change the keyring later, the saved token can't be decrypted any more: the app tells you so, and you enter it again.

## Logs

The app writes a short log, without the token or note content, to `~/.config/Trilium Reminder/logs/main.log`. The wake service logs to the journal (`journalctl --user -u trilium-reminder-wake`).
