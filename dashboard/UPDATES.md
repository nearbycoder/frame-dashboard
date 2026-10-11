# GitHub dashboard updates

## On the frame

**Updates → Check for updates** asks the frame’s on-device runtime to download the published GitHub release directly. It checks GitHub at most once per minute; the page checks its loopback runtime every 15 seconds while visible. New releases show a nonblocking **Update / Later** prompt.

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

The frame downloads the public bundle over HTTPS from this repository only. It validates file paths, size limits, file SHA-256 values, the HTML content version and every referenced asset before switching the active release. A temporary staging directory prevents partial releases being served. GitHub credentials are not needed for downloads. Hashes detect corruption; publisher authenticity relies on HTTPS and control of this GitHub repository.

The standalone frame stores releases in `/data/local/frame-dashboard/<content-version>/`. A GitHub outage leaves the last complete release available, including after a runtime restart. Older assets remain available while the open page defers an update. One-time setup installs a public bootstrap bundle for the first launch. The optional desktop development server uses `dashboard/.release-cache/` instead.

## Roll back

Publish the desired web source as a new version tag to offer it as the latest release. Keep previous tags/assets intact. For a manual rooted-frame rollback, stop the kiosk/runtime and replace the private `active.json` with an existing verified cached release's metadata, or provision an earlier published bundle as the bootstrap and remove `active.json`. Keep the credential file untouched.

For the optional desktop development server, `FRAME_RELEASE_TAG=v1.0.0 npm run frame --prefix dashboard` pins a prior tag. Remove that variable and restart to follow latest again.

## Network and native components

The standalone frame connects to GitHub and RingOS directly over Wi-Fi. Its WebView displays files from its own loopback runtime on port 18773. There is no computer server, Cloudflare-hosted dashboard, Tailscale dependency or USB reverse tunnel in this path. RingOS itself is the HTTPS cloud lighting bridge, so live lighting needs internet access.

The ARMv7 runtime is a separate release asset. Web updates never execute or replace native binaries, APKs, WebView or firmware. Native runtime/APK upgrades require a separate install. Root-only credentials are outside the cache and all served paths. Modern public Mozilla CA roots from [curl’s CA extract](https://curl.se/docs/caextract.html) are embedded in the runtime; HTTPS certificate and hostname checks remain enabled.

## Optional Android 6 Tailscale service

The standard Tailscale Android app requires Android 8+. On this rooted Android 6 frame, the official static Linux ARM client runs instead. Its binaries and login state live under `/data/local/tailscale/` with root-only access; none are included in Git or dashboard bundles. The daemon needs `/dev/net/tun` linked to Android's `/dev/tun` and a Wi-Fi policy route for its underlay mark.

The kiosk also has an opt-in foreground service and boot receiver to keep an installed daemon running independently of USB. Tailscale is not required for standalone GitHub updates or lighting. The receiver attempts to reopen the dashboard at boot, but automatic startup did not work on the tested stock firmware. After a reboot, open Home HQ once to start the connection. After installing the binaries and authorizing the frame in the computer's tailnet, enable it with:

```sh
adb shell am start -n com.wesbos.homehq/.MainActivity --ez tailscale true
```

Disable with the same command using `false`. Tailnet routing is configured with `--accept-dns=false --accept-routes=false --netfilter-mode=off`; no exit node or Tailscale SSH is enabled. Wi-Fi is required. This Android 6 setup has been tested on the ZN-DP1002, but is not the officially supported Android app. APK updates remain a separate install, using the same local signing key as the installed kiosk. Signing keys are never published.

The kiosk briefly waits for its optional Tailscale service at launch and retries initial connection/lookup/timeout failures a bounded number of times. It does not bypass TLS errors or certificate checks.
