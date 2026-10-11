# Frame Dashboard

A fullscreen home dashboard for Android photo frames, with compact Home Assistant lighting controls and versioned GitHub updates.

Based on [wesbos/photo-frame-dashboard](https://github.com/wesbos/photo-frame-dashboard). Original dashboard design, sample data and kiosk sources come from that project. This repository adds lighting state verification, a lightweight display mode, a remembered kiosk URL and GitHub release delivery. No upstream license file was supplied; this repository does not assign a new license to upstream work.

## On a rooted Android frame

The frame downloads dashboard releases **directly from GitHub** and keeps a verified copy on its own storage. The kiosk displays that local copy. Its small on-device runtime connects directly to RingOS for lighting; the computer does not need to stay on. Wi-Fi is needed for release checks and live lighting. A cached dashboard still opens when offline.

See [dashboard/device-runtime/README.md](dashboard/device-runtime/README.md) for the one-time rooted Android 6 setup. It is tested on the ZN-DP1002 with ARMv7 and WebView 107. This runtime is not a firmware image or a rooting method. Subsequent dashboard releases are offered in **Updates** without USB or an APK install.

## Develop on a computer

Press and hold the sidebar clock to open the mode controls. **Light** and **Dark** change the interactive dashboard theme; the choice is remembered across page reloads and updates. **Ambient** and **Night** remain available without changing the saved theme.

Requires Node.js 24 and npm. From `dashboard/`:

```sh
npm ci
npm run build
npm run frame
```

Open `http://localhost:4173/?lite=1#home`. This optional development server uses published releases and falls back to a local build. A frame configured to use this computer's URL depends on that computer; the standalone frame uses `http://127.0.0.1:18773/` instead.

## Updates

[Releases](https://github.com/nearbycoder/frame-dashboard/releases) contain versioned update bundles, source snapshots and release notes. Push changes to `main` to test them. Push a tag such as `v1.0.1` to build and publish an update automatically. The frame offers **Update / Later** and has an **Updates** button. Applying a dashboard update reloads its page inside the same kiosk Activity; it does not reinstall the APK or restart Android.

See [dashboard/UPDATES.md](dashboard/UPDATES.md) for publishing, caching and rollback.

## Credentials and data

No RingOS tokens, Wi-Fi passwords, signing keys, device backups or personal diagnostics belong in this repository. On the frame, RingOS authorization lives in a root-only private file outside the web cache and APK. The optional desktop server obtains it from the operating-system keyring. It is never part of the frontend or a release. Public releases require no GitHub token on the frame. GitHub Actions uses its temporary, repository-scoped token only to publish releases.

Calendar, chores, shopping and presence are sample data from the original prototype. Lighting uses live state when configured; see [dashboard/RINGOS.md](dashboard/RINGOS.md).

## Check

```sh
node --test dashboard/*.test.mjs
npm run build --prefix dashboard
python3 scripts/check-public-source.py
cd dashboard/device-runtime && go test -race ./... && go vet ./...
```

The Android kiosk sources are in `dashboard/kiosk/`. Dashboard releases update web assets only, not the native APK, system WebView or firmware.
