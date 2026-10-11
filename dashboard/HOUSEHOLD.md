# Live household data

The standalone frame and optional desktop server expose bounded same-origin `/api/household/` endpoints. They use the same privately stored Ring MCP authorization as lighting. No credential, calendar entry, participant name, product history, or personal location is bundled with the public dashboard.

Enable these permissions on the existing Ring token:

- `calendar_events_list`: subscribed calendars and their available date window (read-only).
- `chores_list`, `chores_create`, `chores_complete`: chore participants, dated occurrences, overdue one-time chores, creation, and check/uncheck.
- `shopping_list_get`, `shopping_list_add`, `shopping_list_update`: current shopping items, saved usuals, additions, quantity changes, and checked states. No order placement or history import is exposed by the frame.
- `weather_forecast_get`: the configured location's National Weather Service daily periods, Fahrenheit, and freshness. These are forecasts, not current-temperature observations or hourly data.
- `date_time_get`: current Central time. The display advances from the server sample using a monotonic clock and handles America/Chicago DST transitions.

Calendar refreshes every five minutes, weather every fifteen minutes, and time/chores/shopping every minute while visible. Returning to the page triggers fresh reads. Sections load independently. Existing confirmed data can remain visible during a connection failure, accompanied by the error; sample data is never substituted. Live data is held in memory rather than published or persisted in the web release.

The backend accepts only the named read operations and four write operations above. Writes require the exact page origin and an ephemeral control key, use bounded validated JSON, serialize within each collection, and reread Ring state before returning. Uncertain writes are not retried automatically. The client invalidates old polling when a mutation starts, disables only the affected controls, and retains Shopping input during refresh. Dashboard update navigation waits for outstanding household writes as well as light changes.

## Updating an existing standalone frame

This feature needs the **new native `frame-runtime-armv7`** from the live-household release as well as its dashboard bundle. The web updater alone cannot replace a native runtime. Back up the old root-owned binary, install the verified new binary atomically, and let the kiosk's existing service restart it. Keep the private `ringos.authorization`, verified release cache, bootstrap, and APK in place. The kiosk APK itself does not change.

The prior dashboard remains usable if the new native runtime fails. Restore the backed-up binary and restart its service before applying a web bundle that needs these endpoints.
