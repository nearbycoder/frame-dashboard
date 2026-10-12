# Live household data

The standalone frame and optional desktop server expose bounded same-origin `/api/household/` endpoints. They use the same privately stored Ring MCP authorization as lighting. No credential, calendar entry, participant name, product history, or personal location is bundled with the public dashboard.

Enable these permissions on the existing Ring token:

- `calendar_events_list`: subscribed calendars and their available date window (read-only).
- `chores_list`, `chores_create`, `chores_complete`: chore participants, dated occurrences, overdue one-time chores, creation, and check/uncheck.
- `shopping_list_get`, `shopping_list_add`, `shopping_list_update`, `shopping_list_remove`: current shopping items, saved usuals, additions, quantity changes, checked states, and removal from the active list. Removing a list item does not delete its saved usual item or purchase history. No order placement or history import is exposed by the frame.
- `weather_forecast_get`: the configured location's National Weather Service daily periods, Fahrenheit, and freshness. These are forecasts, not current-temperature observations or hourly data.
- `date_time_get`: current Central time. The display advances from the server sample using a monotonic clock and handles America/Chicago DST transitions.

Calendar refreshes every five minutes, weather every fifteen minutes, and time/chores/shopping every minute while visible. Returning to the page triggers fresh reads. Sections load independently. Existing confirmed data can remain visible during a connection failure, accompanied by the error; sample data is never substituted. Live data is held in memory rather than published or persisted in the web release.

The backend accepts only the named read operations and five write operations above. Writes require the exact page origin and an ephemeral control key, use bounded validated JSON, serialize within each collection, and return confirmed Ring state. Shopping uses the snapshot returned by its committed transaction when it contains the requested addition, update, or removal; incomplete or mismatched acknowledgments fall back to a fresh read. Chore edits use a fresh read. Uncertain writes are not retried automatically. The client cancels obsolete polls when a mutation starts so they cannot hold up edits, disables only the affected controls, and retains Shopping input and unchanged row/photo nodes during saves. Shopping write responses opt into an item-only projection, retaining the existing usual catalog on the client rather than transmitting it again. Older dashboards continue to receive the full projection. Server-Timing headers report queue, write, and fallback-read durations without item data or credentials. Dashboard update navigation waits for outstanding household writes as well as light changes.

## Shopping photos and quick adds

Shopping shows product thumbnails beside list items. The header’s **Refresh** button starts a fresh Ring read for both the list and usual-item catalog, replacing an older in-flight poll. It shows Refreshing during the request and confirms completion, while preserving the selected list view, scroll position, and unfinished input. Refresh is temporarily unavailable while shopping edits are saving. **Add usual items** opens a full-page picker with search, category filters, and 18 products per page. The trash button beside each shopping row removes it from the list after Ring confirms the change.

Tap different products without waiting for earlier saves; affected tiles show Saving, then the quantity confirmed by Ring. Confirmed additions stay in place until the picker closes so readback cannot shift a product under a finger. Use the list's quantity controls to add more of an item already selected.

Photos use a bounded same-origin `/product-image` proxy, because Android 6's certificate store cannot reliably fetch modern CDN assets. Only HTTPS JPEG/PNG/WebP product paths on `i5.walmartimages.com` are accepted; redirects are rejected, dimensions are canonicalized to 240×240, downloads are limited to 1 MiB and three concurrent requests, and the browser caches photos for six hours. No Ring credential is sent to the image CDN. Missing or failed photos show a cart placeholder. Product images and household data are not bundled in public releases.

## Updating an existing standalone frame

This feature needs the **new native `frame-runtime-armv7`** from **v1.1.2 or newer** (live household endpoints, product photos, item removal, and the faster shopping save path) as well as its dashboard bundle. The web updater alone cannot replace a native runtime. Back up the old root-owned binary, install the verified new binary atomically, and let the kiosk's existing service restart it. Keep the private `ringos.authorization`, verified release cache, bootstrap, and APK in place. The kiosk APK itself does not change.

The prior dashboard remains usable if the new native runtime fails. Restore the backed-up binary and restart its service before applying a web bundle that needs these endpoints.

## Seven-day Tulsa forecast

The **Weather** tab and the clickable Today weather card open a seven-day forecast for Tulsa, Oklahoma 74134 (36.1162, -95.8225, the configured Ring weather point). The frame runtime independently retrieves the full day/night forecast from the [National Weather Service API](https://www.weather.gov/documentation/services-web-api); Ring’s weather tool supplies today’s forecast only. No Ring authorization is sent to NWS. Temperatures are Fahrenheit and dates use America/Chicago, including daylight saving changes. Each low belongs to that day’s evening; expired or missing periods show a dash rather than an invented value. Tap a day for day/night narrative forecasts.

`GET /api/household/forecast` returns a bounded, validated projection. The provider-discovered forecast URL must be an exact HTTPS NWS grid forecast path, and redirects are rejected. The runtime shares and caches successful reads for 15 minutes in memory; Refresh bypasses that cache, with a five-second minimum between provider reads. Failed refreshes label the last confirmed forecast as cached. No forecast survives a native runtime restart until it is fetched again.

This page requires the native runtime from **v1.1.4 or newer**, installed separately from the web update. The kiosk APK does not change.

## Live photos

The **Photos** page reads `photos_list` and loads each private image with `photos_read` through the local native runtime. Enable both permissions on the existing frame token. Photos refresh on startup, every minute, when the page opens, and when the display returns to the foreground. **Refresh** also retries an image that failed to load. New arrivals move to the front and become the displayed photo; removed or disabled-source photos disappear after a successful gallery read. Failed reads keep the last confirmed gallery with an error. An image download failure retries after a minute when the view is active.

The slideshow displays the latest 100 gallery photos, with previous/next and pause/play controls, rotating every 20 seconds. Photos stays open instead of returning to Today after a minute. Ambient mode uses the same live playlist behind the clock. Only an active photo view fetches image bytes; unchanged metadata never reloads the displayed image. Source imports are managed in Ring (its `photos_sync` operation); the frame polls the already imported gallery and never modifies or deletes photos, sources, or upstream albums.

Private images are fetched from one fixed HTTPS Ring origin and UUID-based image path, with redirects rejected, an 8 MiB download bound, and at most two simultaneous downloads. The Ring token remains outside JavaScript and image URLs. Responses are `private, no-store`; photos are never written to public releases or the native web cache. Decoded images can remain visible during a connection outage, but reopening/reloading requires connectivity to retrieve image bytes. This feature requires the **v1.1.6 or newer native runtime**, installed separately before the web update. The kiosk APK is unchanged.
