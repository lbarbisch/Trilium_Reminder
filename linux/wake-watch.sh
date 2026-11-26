#!/usr/bin/env bash
# Starts "<app> --wake" after resume from standby and after a screen unlock.
# Usage: wake-watch.sh /path/to/trilium-reminder
set -u

app=${1:?usage: wake-watch.sh /path/to/app}

monitors() {
  # System bus: logind announces suspend (true) and resume (false).
  stdbuf -oL gdbus monitor --system --dest org.freedesktop.login1 \
    --object-path /org/freedesktop/login1 &
  # Session bus: screen lock state (GNOME, and the freedesktop name used by KDE).
  stdbuf -oL gdbus monitor --session --dest org.gnome.ScreenSaver &
  stdbuf -oL gdbus monitor --session --dest org.freedesktop.ScreenSaver &
  # If any monitor dies, stop all of them so systemd restarts the service.
  wait -n
  # shellcheck disable=SC2046  # splitting the PID list is intended
  kill $(jobs -p) 2>/dev/null
}

monitors | while IFS= read -r line; do
  case $line in
    *'login1.Manager.PrepareForSleep (false,)'* | *'ScreenSaver.ActiveChanged (false,)'*)
      # A separate transient unit, so restarting this watcher never kills the app.
      systemd-run --user --quiet --collect -- "$app" --ozone-platform=x11 --wake
      ;;
  esac
done

exit 1
