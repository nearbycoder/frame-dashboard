# RingOS lighting integration

The local frame server exposes only RingOS's `home_assistant_lights_list` and
`home_assistant_light_control` tools. The Home Control screen uses live power,
brightness and color state. The Today screen's lighting count is live; other
dashboard sections continue to use the prototype's sample data.

The control path is frame WebView → local Node server → RingOS's HTTPS MCP
endpoint → Home Assistant bridge → lights. The computer's server, RingOS and the
Home Assistant bridge must be available. This is not an offline frame app.

## Run

```sh
cd dashboard
npm run build
npm run frame
```

The server reads its authorization value from the desktop Secret Service
keyring, with attributes `application=photo-frame-dashboard` and
`service=ringos`. The token is never included in the client bundle or a token
file. Unlock the keyring before starting the server. Provision or replace the
value through a hidden stdin prompt and `secret-tool store`, not shell arguments,
source files or logs. Each installation needs its own credential.

Open `/?lite=1#control`. On the frame, ADB reverse maps port 4173 to this server.
With wireless ADB, use `adb -s <frame-ip>:5555 reverse tcp:4173 tcp:4173` after
disconnecting USB; this old daemon rejects reverse with two active transports.

## Behavior

- Inventory refreshes every 20 seconds while the dashboard is visible, with
  server-side coalescing and a five-second cache.
- Home Assistant brightness (0–255) is converted to percent; write requests
  use RingOS's 0–100 schema. Power off and brightness zero are supported.
- Tap a compact light row to toggle power. Slide horizontally to adjust
  brightness at the finger’s position along the row; the release position is
  sent even if it differs from the last movement event. Keyboard
  arrows also adjust brightness.
- The Color button opens a popup with warm, white, red, green, blue and purple
  RGB presets, not Kelvin settings. Selecting a preset closes the popup.
- Unavailable lights are disabled. Groups and individual lights are limited to
  the entries that RingOS exposes; the integration does not expand its scope.
- Different lights send commands concurrently. Each light preserves command
  order and coalesces repeated adjustments to the latest queued setting. A small
  syncing label marks optimistic state; all other controls remain usable.
  Responses and inventory refreshes cannot replace newer pending settings.
- Commands are checked against current inventory. After a service acknowledgment,
  fresh Home Assistant inventory reads bypass the cache and preexisting reads.
  The affected row stays syncing while state catches up (up to 12 seconds).
  Power and brightness must match (brightness tolerance: one percentage point);
  RGB colors allow minor conversion differences. A persistent mismatch shows
  the observed state with a notice, rather than claiming success.
- Uncertain writes are never retried automatically; the UI reads back state
  after a failure. Later explicit user changes still run. Rapid off/on gestures
  retain the latest intent and restore the last observed nonzero brightness.
- All lights off sends to reachable, currently-on entries concurrently and
  reports how many returned an off state. Offline entries are excluded; one
  failed entry does not block the others.
- POST requests require the local server's host, matching Origin, JSON, and a
  browser control key. No CORS grants or general MCP proxy are exposed.

Run `node --test ringos.test.mjs lights-client.test.mjs light-gesture.test.mjs` for protocol, availability,
brightness, request validation, origin/control-key protection, concurrent light
commands, stale response handling and no-retry checks with fake transports.
These tests do not change real lights.

