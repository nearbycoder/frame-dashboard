# Frame Dashboard

A fullscreen home dashboard for Android photo frames, with compact Home Assistant lighting controls and versioned GitHub updates.

Based on [wesbos/photo-frame-dashboard](https://github.com/wesbos/photo-frame-dashboard). Original dashboard design, sample data and kiosk sources come from that project. This repository adds lighting state verification, a lightweight display mode, a remembered kiosk URL and GitHub release delivery. No upstream license file was supplied; this repository does not assign a new license to upstream work.

## Start

Requires Node.js 24 and npm. From `dashboard/`:

```sh
npm ci
npm run build
npm run frame
```

Open `http://localhost:4173/?lite=1#home`. The server uses published GitHub releases, caches a complete verified release locally and falls back to the local build when offline. Use a private network/Tailscale to connect a frame to the server. The computer still provides the lighting API and must remain running.

## Updates

[Releases](https://github.com/nearbycoder/frame-dashboard/releases) contain versioned update bundles, source snapshots and release notes. Push changes to `main` to test them. Push a tag such as `v1.0.1` to build and publish an update automatically. The frame offers **Update / Later** and has an **Updates** button. Applying a dashboard update reloads its page inside the same kiosk Activity; it does not reinstall the APK or restart Android.

See [dashboard/UPDATES.md](dashboard/UPDATES.md) for publishing, caching and rollback.

## Credentials and data

No RingOS tokens, Wi-Fi passwords, signing keys, device backups or personal diagnostics belong in this repository. The server obtains RingOS authorization from the operating-system keyring; it is never part of the frontend or a release. Public releases require no GitHub token on the frame. GitHub Actions uses its temporary, repository-scoped token only to publish releases.

Calendar, chores, shopping and presence are sample data from the original prototype. Lighting uses live state when configured; see [dashboard/RINGOS.md](dashboard/RINGOS.md).

## Check

```sh
node --test dashboard/*.test.mjs
npm run build --prefix dashboard
python3 scripts/check-public-source.py
```

The Android kiosk sources are in `dashboard/kiosk/`. Dashboard releases update web assets only, not the native APK, system WebView or firmware.
