# Standalone rooted-frame runtime

The frame runs a small static ARMv7 program supervised by the kiosk's foreground service. It serves the verified dashboard cache on **127.0.0.1:18773 only**, downloads public GitHub releases itself, and calls RingOS directly with a private device credential. No computer server, Tailscale, ADB reverse, or GitHub token is required after setup. The tested frame is a rooted Android 6 ZN-DP1002 with WebView 107; this does not root a stock frame or change its firmware.

## One-time setup

1. Build the kiosk sources in `../kiosk/` with Android SDK tools (min/target SDK 23) and sign the APK with your own local key kept outside this repository. Existing installations need the same signing key. Include `FrameRuntimeService.java` and the manifest's network permission/service. Native APKs are deliberately separate from automatic web updates.
2. Download `frame-runtime-armv7` and `dashboard-bundle.json` from a [published release](https://github.com/nearbycoder/frame-dashboard/releases). These are public artifacts and contain no credentials. ARMv7 is required for this binary.
3. With a single authorized USB frame connected and working `/system/xbin/su`, run:

   ```sh
   python3 install.py --runtime /path/to/frame-runtime-armv7 \
     --bundle /path/to/dashboard-bundle.json --apk /path/to/your-signed-kiosk.apk
   ```

   Enter the full RingOS authorization at the hidden prompt. Never paste it in shell arguments or a source file. The installer stages private files in a mode-700 device directory, then moves them into the root-only state directory with mode 600. It does not print the credential. Use `--serial` to select a device explicitly if multiple devices are connected.

4. Open Home HQ. The installed runtime defaults to `http://127.0.0.1:18773/?lite=1#control`. **Updates → Check for updates** follows the latest public GitHub release. Updating web assets keeps the kiosk Activity open and preserves the section.

The boot receiver attempts automatic startup. The tested stock firmware did not reliably deliver it; open Home HQ once after reboot if the launcher appears. No firmware or default-launcher change is made by this installer.

## Storage and privacy

`/data/local/frame-dashboard/` is mode 700, owned by root:

- `frame-runtime`: executable, mode 700.
- `bootstrap.json`: public first-run dashboard bundle, mode 600.
- `ringos.authorization`: private authorization, mode 600. Not served, logged or embedded in web files/APKs.
- `active.json` and content-version directories: verified cached releases.

No CORS access or general MCP proxy is provided. Lighting writes require the loopback Host, matching Origin, a per-process control key and validated settings for a listed reachable light. Reads following a write bypass the cache and confirm observed state; stale list reads cannot overwrite that confirmation. Commands for different lights remain concurrent. Uncertain writes are not automatically repeated.

The cache validates paths, file-count/size limits, SHA-256, the HTML content version and every referenced asset before an atomic directory switch. Existing cached releases are checked again on restart. Older assets remain available until the displayed page accepts a new release. An offline start still displays the cached interface; lighting and update checks need internet.

Android Wi-Fi DNS is passed by the service because static Linux binaries cannot use Android's netd resolver. A launch without Wi-Fi uses 1.1.1.1 as a fallback and still serves cached files. Restart the frame after changing Wi-Fi DNS so the runtime uses the new resolver. TLS certificate and hostname verification stay enabled. The embedded `roots.crt` is the public Mozilla CA store distributed by [curl](https://curl.se/docs/caextract.html), under MPL-2.0, downloaded and SHA-256 verified on 2026-10-11 (`a41b5d356aea97a529fe27e0f7316d2f9d946d75927476cf9cf1b90637d00505`). It contains certificates, not private keys.

## Build and check

```sh
go test -race ./...
go vet ./...
CGO_ENABLED=0 GOOS=linux GOARCH=arm GOARM=7 go build -trimpath \
  -ldflags='-s -w' -o frame-runtime-armv7 .
```

The release workflow builds the runtime too. Installing a changed native runtime requires a separate deliberate install; web bundles never execute or replace it. Dashboard, runtime and APK versions are independent.

## Wi-Fi recovery from the dashboard

With the **v1.1.5 or newer native runtime**, the sidebar's **Settings** button (above Updates) opens a Wi-Fi dialog. **Choose Wi-Fi network** launches Android's network chooser, where Android handles scanning, password entry, saving networks, and reconnecting. **Return to dashboard** closes that screen; it remains enabled without a connection. The cached dashboard, local Settings API, and Android chooser work offline. No Wi-Fi credentials pass through the dashboard, Ring MCP, or GitHub.

The native runtime refreshes Android's active `net.dns1` at most every five seconds when resolving a host, so changing Wi-Fi does not require restarting the dashboard. A valid startup resolver is retained as fallback while Android has no DNS server. Internet data and release checks resume once the new network provides connectivity.

The only device action is a fixed `android.settings.WIFI_SETTINGS` intent. It requires the loopback Host, exact same-origin POST, an ephemeral device control key available locally without Ring, and an empty bounded JSON object. The API never accepts arbitrary commands or intents. Desktop previews explain that Wi-Fi settings are available on the Android frame. This feature requires installing the native runtime separately; the existing APK does not change.
