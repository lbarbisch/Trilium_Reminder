# Trilium setup

The app reads and writes **one** Trilium text note through ETAPI, Trilium's external API. Built for Trilium 0.107.0.

## Create the todo note

1. In Trilium, create a **text** note, for example "Todo".
2. Insert a to-do list (type `[ ]` and a space at the start of a line, or use the to-do list button in the toolbar) and add a few items.
3. The note must **not** be protected. ETAPI cannot read protected notes.

The app manages only the **first** to-do list at the top level of the note. Text, headings, other lists and anything after it stay as they are. If the note has no to-do list yet, the app creates one at the end when you add the first item.

Try it with a test note first, and switch to your real list once you trust it.

## Find the note ID

Open the note and use **Note info** (the ⓘ button in the note's ribbon), or copy the note link: the ID is the last part of the address, after `#root/.../`. It is a short code like `aBcD1234eFgH`.

## Create an ETAPI token

1. In Trilium, open **Options → ETAPI**.
2. Click **Create new ETAPI token** and name it, for example "Trilium Reminder on my PC".
3. Copy the token. Trilium shows it only once.

Create one token per computer. You can then revoke a single one in the same place if a PC is lost.

## Enter the settings

On first start the app shows **Connect to Trilium**. Later, open it with **Settings** in the window or the tray menu.

| Field          | Example                       |
| -------------- | ----------------------------- |
| Server address | `https://trilium.example.com` |
| Note ID        | `aBcD1234eFgH`                |
| ETAPI token    | the token you copied          |

Click **Test connection**. It reports how many to-do items the note has, or what went wrong. Then click **Save**.

The token is encrypted with your system's secure storage (Windows DPAPI, or KWallet / GNOME Keyring on Linux) and is never shown again. To keep it when you change other settings, leave the token field empty. If you change the server address, you must enter the token again, so it is never sent to a different server.

## HTTPS

The server address must start with `https://`. Plain `http://` is only allowed for `localhost` and `127.0.0.1`, for example a Trilium desktop app or a test server on the same PC. The app also refuses redirects: if your server redirects (for example from `/` to `/trilium/`), enter the final address.

Self-signed certificates are not accepted. Use a certificate from a public authority such as Let's Encrypt.

## Changing the note or server

If changes are still waiting to be sent, the app warns you that saving another server or note discards them. Click **Discard and save** only if you don't need them; otherwise cancel, wait until the status line says **Synced**, and try again.
