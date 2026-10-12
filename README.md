# Frame Dashboard

A fullscreen home dashboard for Android photo frames, with live Ring MCP calendars, chores, shopping, weather, Central time, Home Assistant lighting, and versioned GitHub updates.

Based on [wesbos/photo-frame-dashboard](https://github.com/wesbos/photo-frame-dashboard). Original dashboard design, sample data and kiosk sources come from that project. This repository adds lighting state verification, a lightweight display mode, a remembered kiosk URL and GitHub release delivery. No upstream license file was supplied; this repository does not assign a new license to upstream work.

## On a rooted Android frame

The frame downloads dashboard releases **directly from GitHub** and keeps a verified copy on its own storage. The kiosk displays that local copy. Its small on-device runtime connects directly to Ring MCP for household data and lighting; the computer does not need to stay on. Wi-Fi is needed for release checks and live data. A cached dashboard still opens when offline.

See [dashboard/device-runtime/README.md](dashboard/device-runtime/README.md) for the one-time rooted Android 6 setup. It is tested on the ZN-DP1002 with ARMv7 and WebView 107. This runtime is not a firmware image or a rooting method. Subsequent dashboard releases are offered in **Updates** without USB or an APK install.

Tap **Settings**, directly above **Updates**, to choose a Wi-Fi network. The Android network chooser has a **Return to dashboard** button and can be opened while offline. This requires the native runtime from v1.1.5 or newer.

## Develop on a computer

Tap **Display** in the sidebar to open display settings. **Light** and **Dark** change the interactive dashboard theme; the choice is remembered across page reloads and updates. **Ambient** and **Night** remain available without changing the saved theme.

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

The Updates screen identifies the installed release by its short source Git commit SHA, matching GitHub. The full SHA is embedded in the release's HTML at build time, so checking for a newer release does not change the installed commit shown. Older bundles without this metadata show a labeled build hash instead.

## Credentials and data

No RingOS tokens, Wi-Fi passwords, signing keys, device backups or personal diagnostics belong in this repository. On the frame, RingOS authorization lives in a root-only private file outside the web cache and APK. The optional desktop server obtains it from the operating-system keyring. It is never part of the frontend or a release. Public releases require no GitHub token on the frame. GitHub Actions uses its temporary, repository-scoped token only to publish releases.

Calendar subscriptions, chore participants and occurrences, shopping items and usuals, forecast weather in Fahrenheit, and Central time come from Ring MCP. The **Weather** tab also fetches a full seven-day Tulsa, Oklahoma 74134 forecast directly from the National Weather Service; tap the Today weather card to open it. Calendar subscriptions are read-only. Chore creation/checkoffs and shopping additions/quantities/checkoffs save back to Ring and are followed by a fresh read. Failed writes are not automatically retried. Home Assistant lighting remains live; see [dashboard/RINGOS.md](dashboard/RINGOS.md). Photos and Ambient use the live Ring photo gallery with automatic minute-by-minute refresh and a lightweight slideshow. Enable `photos_list` and `photos_read` on the frame token; private images load only through the on-device runtime. Sample photos, people, forecasts and house-status messages have been removed. See [dashboard/HOUSEHOLD.md](dashboard/HOUSEHOLD.md) for required permissions, refresh behavior and upgrading an existing native runtime.

## Check

```sh
node --test dashboard/*.test.mjs
npm run build --prefix dashboard
python3 scripts/check-public-source.py
cd dashboard/device-runtime && go test -race ./... && go vet ./...
```

The Android kiosk sources are in `dashboard/kiosk/`. Dashboard releases update web assets only, not the native APK, system WebView or firmware.
