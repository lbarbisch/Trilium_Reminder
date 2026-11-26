# Security policy

## Supported versions

Only the latest release gets security fixes. Please update before reporting.

## Reporting a vulnerability

Please **do not** open a public issue. Use GitHub's private reporting instead: **Security → Report a vulnerability** on the [repository page](https://github.com/lbarbisch/Trilium_Reminder/security/advisories/new).

Include the version, your OS, what an attacker could do, and steps to reproduce. Never include a real ETAPI token or private note content; use a test server.

This is a one-person hobby project; reports are answered as soon as possible. Fixed issues are published as a new release with a security advisory.

## Scope

In scope: this app, its installers, the Linux wake service and the GitHub workflows in this repository.

Out of scope: Trilium itself (report to the [Trilium project](https://github.com/TriliumNext/Trilium/security)), and Electron or Chromium bugs that are already fixed upstream but not yet in a release here. Please tell us about those anyway, so we can update.

## If your token leaks

Delete it in Trilium under **Options → ETAPI** at once, create a new one, and enter it in the app's Settings.
