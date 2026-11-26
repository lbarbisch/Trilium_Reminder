# Installation

Download the files from the [releases page](https://github.com/lbarbisch/Trilium_Reminder/releases). Each release also contains `manual-vX.Y.Z.zip`, the manual for exactly that version.

| System               | File                                           |
| -------------------- | ---------------------------------------------- |
| Windows 10/11 (x64)  | `trilium-reminder-X.Y.Z-windows-x64-setup.exe` |
| Debian, Ubuntu (x64) | `trilium-reminder-X.Y.Z-linux-amd64.deb`       |
| Other Linux (x64)    | `trilium-reminder-X.Y.Z-linux-x86_64.AppImage` |

## Windows

1. Run the setup file. It installs for your user only and needs no administrator rights.
2. The builds are not code-signed, so Windows SmartScreen may show **Windows protected your PC**. Click **More info**, check that the file name is right, then **Run anyway**. [Verify the download](#verify-a-download) first if you want to be sure.
3. The app starts and asks for your Trilium details. See [Trilium setup](./trilium-setup.md).

The installer registers the app to start when you sign in. It then shows the window after every sign-in, unlock and resume from standby.

## Linux

Prefer the deb on Debian and Ubuntu:

```bash
sudo apt install ./trilium-reminder-X.Y.Z-linux-amd64.deb
trilium-reminder --ozone-platform=x11 &
```

For the AppImage, keep it in a fixed place, because autostart and the wake service point to its path:

```bash
mkdir -p ~/Applications
mv trilium-reminder-*.AppImage ~/Applications/
chmod +x ~/Applications/trilium-reminder-*.AppImage
~/Applications/trilium-reminder-*.AppImage --ozone-platform=x11 &
```

Some distributions need the FUSE 2 library for AppImages (`sudo apt install libfuse2t64` or `libfuse2`).

On first start, an installed build writes `~/.config/autostart/trilium-reminder.desktop`, so it starts after sign-in. To show the window after standby and unlock, open **Settings** and click **Install wake service**. See [Linux](./linux.md), especially if you use i3 or another window manager.

## Verify a download

Each release has `SHA256SUMS.txt`. Compare the hash of your file with it.

Windows (PowerShell):

```powershell
Get-FileHash .\trilium-reminder-X.Y.Z-windows-x64-setup.exe
```

Linux:

```bash
sha256sum -c SHA256SUMS.txt --ignore-missing
```

With the GitHub CLI you can also check that GitHub Actions in this repository built the file:

```bash
gh attestation verify <file> --repo lbarbisch/Trilium_Reminder
```

## Update

There is no auto-update. Download the new version and install it over the old one, as above. Settings, the saved token and any changes that have not reached Trilium yet are kept: they live in your user profile, not in the program folder.

With an AppImage, replace the file at the same path. If the path changes, start the new AppImage once (it updates the autostart entry), then click **Install wake service** again.

## Uninstall

### Uninstall on Windows

1. Quit the app from the tray icon.
2. Uninstall **Trilium Reminder** in **Settings → Apps**. This also removes the sign-in entry.
3. Optional: delete your settings and cache in `%APPDATA%\Trilium Reminder`.

### Uninstall on Linux

```bash
# wake service
systemctl --user disable --now trilium-reminder-wake.service
rm ~/.config/systemd/user/trilium-reminder-wake.service
rm -r ~/.local/share/trilium-reminder
systemctl --user daemon-reload
# autostart
rm ~/.config/autostart/trilium-reminder.desktop
# the app (deb), or delete the AppImage file
sudo apt remove trilium-reminder
# optional: settings and cache
rm -r "$HOME/.config/Trilium Reminder"
```
