# GitHub dashboard updates

## On the frame

**Updates → Check for updates** checks the published GitHub release via the frame server. The server checks GitHub at most once per minute; the page checks the server every 15 seconds while visible. New releases show a nonblocking **Update / Later** prompt.

**Update now** downloads scripts and styles, waits for active touches and light changes, verifies that the selected release is still current, then navigates inside the same WebView. The current section and lite-mode settings are retained. A failed download keeps the current page open.

## Publish

Commit and push reviewed source changes to `main`. To release:

```sh
git tag v1.0.1
git push origin main v1.0.1
```

The workflow runs tests, checks for credential patterns, builds with the committed lockfile and attaches `dashboard-bundle.json` to a GitHub Release. It creates the release as a draft, uploads the complete bundle, then publishes it. Unreleased commits do not update frames. Use a fresh version tag for each release; do not overwrite published tags/assets.

All release history is at https://github.com/nearbycoder/frame-dashboard/releases.

## Download and verification

The server downloads the public bundle over HTTPS from this repository only. It validates file paths, size limits, file SHA-256 values, the HTML content version and every referenced asset before switching the active release. A temporary staging directory prevents partial releases being served. GitHub credentials are not needed for downloads. Hashes detect corruption; publisher authenticity relies on HTTPS and control of this GitHub repository.

The server stores releases in `dashboard/.release-cache/`, excluded from Git. A GitHub outage leaves the last complete release available, including after a server restart. Older assets remain available for displays that defer an update. Initial startup requires either a previously cached release or `npm run build`.

## Roll back

Restart the frame server with an earlier published tag pinned:

```sh
FRAME_RELEASE_TAG=v1.0.0 npm run frame --prefix dashboard
```

The next **Check for updates → Update now** installs that version. Remove `FRAME_RELEASE_TAG` and restart to follow the latest release again. This changes dashboard assets only; backend changes require checking out the matching source and restarting the server separately.

## Network

The frame still needs to reach the server for lights and update downloads; GitHub stores the release source and history. Use the server's reachable Tailscale or private LAN URL. Kiosk 1.1 remembers its configured URL. No Android service worker, app force-stop, USB install or firmware flash is needed for subsequent dashboard releases.
