# RingOS lighting integration

The on-device runtime exposes only RingOS's `home_assistant_lights_list` and
`home_assistant_light_control` tools. The Home Control screen uses live power,
brightness and color state. The Today screen's lighting count is live; other
dashboard sections continue to use the prototype's sample data.

The standalone control path is frame WebView → frame's loopback runtime → RingOS's HTTPS MCP endpoint → Home Assistant bridge → lights. Wi-Fi, RingOS and Home Assistant must be available for live lighting; the computer is not involved. The cached UI opens offline while light requests report a connection failure.

## On the frame

Use the [on-device setup](device-runtime/README.md). RingOS authorization lives in `/data/local/frame-dashboard/ringos.authorization`, mode 600 inside a root-only directory. It is outside all served paths and is never included in an APK or release. Each installation needs its own credential.

## Optional desktop development

```sh
cd dashboard
npm run build
npm run frame
```

The development server reads authorization from the desktop Secret Service keyring, with attributes `application=photo-frame-dashboard` and `service=ringos`. Unlock the keyring before starting it. Provision through a hidden stdin prompt and `secret-tool store`, never shell arguments, source files or logs. A frame using the computer's URL depends on that server. The standalone kiosk uses its own `http://127.0.0.1:18773/?lite=1#control` instead.

## Behavior

- Inventory refreshes every five minutes while the dashboard is visible, with
  server-side coalescing and a five-second cache. Opening Lights or tapping
  Refresh still reads immediately, and light controls keep their immediate
  confirmation reads. Changes made elsewhere may take up to five minutes to appear.
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
