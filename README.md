# DILG Region 10 Calendar Activity Dashboard

A runnable web app adapted from the supplied Calendar Activity Dashboard.html, using the exported navy-and-teal design with daily, weekly, monthly, and annual summaries, filters, agenda, concurrency detection, and analytics.

## Run locally

Requires Node.js 22 or newer.

```sh
npm ci
cp .env.example .env
# Fill in your VPS Supabase API URL and publishable/anon key in .env.
npm start
```

Open http://localhost:3000. Use `npm run dev` to restart the server automatically after backend edits. Serve the HTML through Node; opening it directly cannot access the calendar-feed API.

The server reads `supabase_url` and `supabase_publishable_key` from `.env` or
environment variables. Use the VPS HTTPS API origin, not the PostgreSQL SSH
tunnel. The server queries Supabase's `/rest/v1/calendar_links` endpoint with
`Accept-Profile: system_calendar`; the browser reads `/api/calendar-links` from
this app. Keys stay on the server. A legacy anon JWT also works in
`supabase_publishable_key` for older self-hosted stacks. Uppercase
`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and `SUPABASE_ANON_KEY` are supported
as fallbacks. Restart the app after changing `.env`.

Expose `system_calendar` in the VPS REST service configuration and apply the
schema and seed migrations described in [supabase/README.md](supabase/README.md).
The dashboard opens and loads calendars immediately, without a page-access code.
GET /api/calendar-links and POST /api/calendar-feed are public read endpoints.

## Add Link code

The **Add Link** button opens a Name and Link form. Saving requires the current
code from system_calendar.auth_code where used_for = 'add', verified server-side.
The server-only supabase_secret_key is required for adding links, but is not
required for viewing the calendar. Existing used_for = 'access' rows are unused
and have not been deleted. Calendar loading starts directly when the dashboard opens.

Incorrect Add Link attempts are limited to ten per minute per server-observed IP,
per process. Duplicate calendar IDs and private links are rejected.

## Included calendars

The seed migration contains the ten original calendars: LGMED, RICTU, Planning, Quality Management, Personnel, PDMU, LGCDD, Legal, BAC -DILG, and ORD. The frontend loads names and links from `system_calendar.calendar_links` on each page load. Stored names override Google feed titles. Edit the database records to change the configured calendars. The current dashboard supports up to 15 calendars, sorted by name; duplicate Google calendar IDs are rejected.

- The default Today view first loads only its Manila calendar day. After Today's results render, public calendars for the full year are fetched in the background and cached for Week, Month, and Year. Opening those views while preparation is running reuses the same requests. Weeks run Monday through Sunday in Asia/Manila. A week crossing New Year loads its complete seven-day range; leaving that boundary week returns to the selected year's data. Navigating to a different year loads its full year. Requests use Asia/Manila boundaries and are limited to 366 days, including leap years.
- Recurring events, exceptions, moved instances, cancellations, and all-day dates are handled by node-ical.
- Displayed dates and times use Asia/Manila, even on devices in other timezones.
- Calendar links and names come from Supabase. Old browser-saved links no longer override them. Empty or unavailable storage shows an explicit message; the app does not fall back to hardcoded calendars. Event data is fetched from Google and is not stored in Supabase.
- **Refresh** bypasses browser caching and retrieves the latest calendar list and feeds. Reloading the page may reuse feeds cached within the last five minutes. Partial failures stay visible; unavailable feeds are excluded from statistics.
- Categories, delivery formats, stakeholders, and event levels are keyword-based estimates. Conflicts indicate overlapping timed entries, not confirmed attendee conflicts. Remaining capacity subtracts scheduled hours from eight hours; it does not calculate free time slots.
- Possible duplicates across selected office calendars are consolidated using title, time, venue, facilitators, participants, and focal persons. Matches are estimates and are marked in the activity details; original calendar entries are unchanged.

## Updated dashboard features

### Browser caching and background analysis

- Public feed responses are cached in IndexedDB (`calendar-dashboard-cache`, `feeds`) for five minutes, keyed by calendar URL and requested date range. Each browser keeps its own cache; no Redis or additional service is needed. The cache is bounded to 30 entries and 20 MB of serialized feed data. Failed or malformed responses are not cached, and expired records are not used as a fallback.
- The calendar list and office names are always retrieved from the server on page load and explicit Refresh. Current names override cached Google titles, and removed calendars are not loaded from the cache. OAuth and secret iCal responses are not persisted.
- Annual preparation starts only after Today is rendered, with at most four background feed requests at a time. It populates the feed cache without changing the visible events, filters, menu, or loading state. A sidebar status reports preparation or retry availability. Background failures do not remove Today's data; opening another view retries missing feeds. Refresh cancels older requests and clears both daily and annual cached feeds before retrieving fresh data.
- Expired in-memory data is refreshed on the next period navigation. There is no background polling; use Refresh when immediate updates are needed. Browser storage can be cleared through the site's browser settings. If storage is blocked or full, fetching still works normally.
- `/calendar-worker.js` performs duplicate matching and overlap detection in a browser Web Worker. Matching rules remain unchanged. Overlap detection sorts events and stops comparing when later activities cannot overlap. DOM-dependent HTML extraction remains on the main thread, processed in short batches; DOM rendering also stays on that thread.
- Up to eight recent period/selection analyses and eight filtered view results are reused in memory. New feed data invalidates them. Late worker results cannot replace a newer selected view. If workers cannot start or fail, the shared analysis functions run in the browser's main thread as a compatibility fallback.
- Loading skeletons cover foreground downloads and analysis. Reopening a processed view can finish immediately without a visible loading animation. Daily requests reduce recurrence expansion, response size, and browser processing before Today appears. The server still downloads the full Google ICS feed for each uncached range, so daily-first loading does not eliminate Google's download latency and can download a feed again during annual preparation. Browser caches are not shared between users.

Integrated from `calendar-activity-digest-source.zip`, retaining this project's Express/Vercel backend, recurrence expansion, default calendars, and Asia/Manila date handling.

Updated again from `calendar-activity-digest(1).zip`:

- Weekly navigation and summaries, including weeks spanning two years.
- Distinct office colors shared by filter tiles, calendar markers, and activity rows. Consolidated activities display bands for each originating office.
- The **Possible duplicate activities** metric counts consolidated activities with matching reports, rather than the number of extra reports.
- Revised summaries describe unique activities and concurrent pairs. Existing suggested actions, keyboard controls, and filter behavior are retained.

- Office tiles filter the agenda and analytics, alongside existing organization, delivery-format, and event-level filters.
- Expanded activity details include focal persons, host agencies, staff, participant counts, description resource links, Meeting IDs, and passcodes.
- Online classification requires both a Meeting ID and passcode/password. Hybrid additionally requires a physical venue or in-person indicator. A meeting link alone does not establish the delivery format.
- Concurrent activity pairs identify shared facilitators or participants when available; time overlap alone does not confirm a personnel conflict.
- The header action buttons (Download summary, Google sign-in, and Add calendar links) are removed; the dashboard loads its configured calendars automatically.

The live smoke test requires at least one reachable calendar and permits partial availability. During the September 23, 2026 check, six feeds loaded; LGCDD's public feed was unavailable. Use an authorized Google account or a valid secret iCal link for calendars that are not public.

Public links require calendars readable without authentication. Failed feeds are shown as unavailable, never as an empty schedule. Google sharing guidance: https://support.google.com/calendar/answer/37083

## Google sign-in configuration (UI currently removed)

Public calendars work without credentials. For Google account access, enable the Google Calendar API in Google Cloud, configure the OAuth consent screen and a Web application OAuth client, and add http://localhost:3000 (or the exact deployed origin) as an authorized JavaScript origin. Enter the client ID using Google sign-in. If the OAuth app is in testing, add the account as a test user. No client secret belongs in this app.

Sign-in requests read-only access and switches to calendars visible to that account. Access tokens remain in page memory; sign in again if the token expires. No OAuth client was supplied, so interactive sign-in has not been verified with a real account.

Google secret iCal links are also accepted. These links are credentials: if entered, they are saved in this browser and sent to this app's server and Google to retrieve events. Remove them from the saved list on shared devices.

## Files and deployment

- public/index.html, public/styles.css, public/app.js: adapted interface and client behavior.
- public/calendar-cache.js: bounded browser feed cache with expiry and storage fallback.
- public/calendar-analysis.js, public/calendar-analysis-client.js, public/calendar-worker.js: shared matching algorithms and browser worker lifecycle.
- server.js: Express server and bounded feed endpoint.
- calendar.js: Google URL validation and recurrence expansion.
- test/: backend validation and calendar fixtures.
- e2e/: live-feed smoke test and simulated failure-state test.

Deploy on a Node-capable host using `npm ci --omit=dev` and `npm start`. Set HOST=0.0.0.0 and the host-provided PORT, and serve through HTTPS. Static-only hosting cannot run the feed endpoint. Apply organizational access controls and request rate limits at the reverse proxy for an internal deployment. The app does not provide user accounts.

### Vercel

The repository includes `vercel.json` selecting the Express framework. `server.js` exports the Express app as its default handler for Vercel, while `npm start` continues to run the local server. Vercel serves the existing `public/` assets through its CDN and runs the calendar API as a function.

1. Deploy the repository root, containing `package.json`, `server.js`, and `vercel.json`.
2. Use the **Express** framework preset. Leave Build Command and Output Directory overrides disabled; this project does not generate a `dist` directory. The default dependency installation is sufficient.
3. Set `supabase_url` and `supabase_publishable_key` in the Vercel project environment variables, then redeploy the updated commit. Check `/` for the dashboard and submit a calendar request to `/api/calendar-feed` to verify the backend.

For `FUNCTION_INVOCATION_FAILED`, inspect the failed deployment's Runtime Logs for the first exception. The generic 500 page and request ID do not identify the underlying cause. See [Vercel's Express documentation](https://vercel.com/docs/frameworks/backend/express).

## Verify

```sh
npm test
npx playwright install chromium
npm run test:e2e
```

The browser smoke test checks live Google feeds, month navigation, filtering, absence of the removed header buttons, mobile layout, and JavaScript errors using a device timezone outside the Philippines. Screenshots are written to the ignored test-results directory.
