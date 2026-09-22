# DILG Region 10 Calendar Activity Dashboard

A runnable web app adapted from the supplied Calendar Activity Dashboard.html, preserving its forest-green design, daily/monthly summaries, filters, agenda, conflict detection, analytics, and text export.

## Run locally

Requires Node.js 22 or newer.

```sh
npm ci
npm start
```

Open http://localhost:3000. Use `npm run dev` to restart the server automatically after backend edits. Serve the HTML through Node; opening it directly cannot access the calendar-feed API.

## Included calendars

The five supplied links are preloaded in `public/app.js`: LGMED 10, RICTU CALENDAR (decoded from the subscription link), Planning, Quality Management, and Region10 Personnel Calendar. Display names come from the actual Google feeds. All five public feeds were successfully checked during implementation.

- The current month loads automatically; navigating to another month retrieves that month's events.
- Recurring events, exceptions, moved instances, cancellations, and all-day dates are handled by node-ical.
- Displayed dates and times use Asia/Manila, even on devices in other timezones.
- Add calendar links edits the list, saved in this browser. The server does not persist links or event data.
- Reloading the page retrieves updates. Partial failures stay visible; unavailable feeds are excluded from statistics and identified in exports.
- Categories, delivery formats, stakeholders, and event levels are keyword-based estimates. Conflicts indicate overlapping timed entries, not confirmed attendee conflicts. Remaining capacity subtracts scheduled hours from eight hours; it does not calculate free time slots.
- An event appearing on two calendars remains available under both filters and may count twice when both calendars are selected.

Public links require calendars readable without authentication. Failed feeds are shown as unavailable, never as an empty schedule. Google sharing guidance: https://support.google.com/calendar/answer/37083

## Optional Google sign-in

Public calendars work without credentials. For Google account access, enable the Google Calendar API in Google Cloud, configure the OAuth consent screen and a Web application OAuth client, and add http://localhost:3000 (or the exact deployed origin) as an authorized JavaScript origin. Enter the client ID using Google sign-in. If the OAuth app is in testing, add the account as a test user. No client secret belongs in this app.

Sign-in requests read-only access and switches to calendars visible to that account. Access tokens remain in page memory; sign in again if the token expires. No OAuth client was supplied, so interactive sign-in has not been verified with a real account.

Google secret iCal links are also accepted. These links are credentials: if entered, they are saved in this browser and sent to this app's server and Google to retrieve events. Remove them from the saved list on shared devices.

## Files and deployment

- public/index.html, public/styles.css, public/app.js: adapted interface and client behavior.
- server.js: Express server and bounded feed endpoint.
- calendar.js: Google URL validation and recurrence expansion.
- test/: backend validation and calendar fixtures.
- e2e/: live-feed smoke test and simulated failure-state test.

Deploy on a Node-capable host using `npm ci --omit=dev` and `npm start`. Set HOST=0.0.0.0 and the host-provided PORT, and serve through HTTPS. Static-only hosting cannot run the feed endpoint. Apply organizational access controls and request rate limits at the reverse proxy for an internal deployment. The app does not provide user accounts or a database.

### Vercel

The repository includes `vercel.json` selecting the Express framework. `server.js` exports the Express app as its default handler for Vercel, while `npm start` continues to run the local server. Vercel serves the existing `public/` assets through its CDN and runs the calendar API as a function.

1. Deploy the repository root, containing `package.json`, `server.js`, and `vercel.json`.
2. Use the **Express** framework preset. Leave Build Command and Output Directory overrides disabled; this project does not generate a `dist` directory. The default dependency installation is sufficient.
3. Redeploy the updated commit. Check `/` for the dashboard and submit a calendar request to `/api/calendar-feed` to verify the backend.

For `FUNCTION_INVOCATION_FAILED`, inspect the failed deployment's Runtime Logs for the first exception. The generic 500 page and request ID do not identify the underlying cause. See [Vercel's Express documentation](https://vercel.com/docs/frameworks/backend/express).

## Verify

```sh
npm test
npx playwright install chromium
npm run test:e2e
```

The browser smoke test requires access to the five Google feeds. It checks month navigation, filtering, modal cancellation, export, mobile layout, and JavaScript errors using a device timezone outside the Philippines. Screenshots are written to the ignored test-results directory.
