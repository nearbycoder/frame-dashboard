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

## Optional Android 6 Tailscale service

The standard Tailscale Android app requires Android 8+. On this rooted Android 6 frame, the official static Linux ARM client runs instead. Its binaries and login state live under `/data/local/tailscale/` with root-only access; none are included in Git or dashboard bundles. The daemon needs `/dev/net/tun` linked to Android's `/dev/tun` and a Wi-Fi policy route for its underlay mark.

Kiosk 1.2.2 has an opt-in foreground service and boot receiver to keep the installed daemon running independently of USB and reopen the dashboard at boot. After installing the binaries and authorizing the frame in the computer's tailnet, enable it with:

```sh
adb shell am start -n com.wesbos.homehq/.MainActivity --ez tailscale true
```

Disable with the same command using `false`. Tailnet routing is configured with `--accept-dns=false --accept-routes=false --netfilter-mode=off`; no exit node or Tailscale SSH is enabled. Wi-Fi is required. This Android 6 setup has been tested on the ZN-DP1002, but is not the officially supported Android app. APK updates remain a separate install, using the same local signing key as the installed kiosk. Signing keys are never published.
