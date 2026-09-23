# DILG Region 10 Calendar Activity Dashboard

A runnable web app adapted from the supplied Calendar Activity Dashboard.html, using the exported navy-and-teal design with daily, weekly, monthly, and annual summaries, filters, agenda, concurrency detection, and analytics.

## Run locally

Requires Node.js 22 or newer.

```sh
npm ci
npm start
```

Open http://localhost:3000. Use `npm run dev` to restart the server automatically after backend edits. Serve the HTML through Node; opening it directly cannot access the calendar-feed API.

## Included calendars

The seven supplied links are preloaded in `public/app.js`: LGMED 10, RICTU CALENDAR (decoded from the subscription link), Planning, Quality Management, Region10 Personnel Calendar, PDMU (dilg10pdmu@gmail.com), and LGCDD (lgcdd10dilg@gmail.com). Display names come from the actual Google feeds. All five public feeds were successfully checked during implementation.

- The full current year loads once when the page opens or refreshes. Today, Week, Month, and Year reuse that data without importing again. Weeks run Monday through Sunday in Asia/Manila. A week crossing New Year loads its complete seven-day range; leaving that boundary week reloads the selected year's data. Navigating to a different year automatically loads its full year. Requests use Asia/Manila boundaries and are limited to 366 days, including leap years.
- Recurring events, exceptions, moved instances, cancellations, and all-day dates are handled by node-ical.
- Displayed dates and times use Asia/Manila, even on devices in other timezones.
- Calendar links load automatically from the configured defaults or previously saved browser settings. The server does not persist links or event data.
- Reloading the page retrieves updates. Partial failures stay visible; unavailable feeds are excluded from statistics and identified in exports.
- Categories, delivery formats, stakeholders, and event levels are keyword-based estimates. Conflicts indicate overlapping timed entries, not confirmed attendee conflicts. Remaining capacity subtracts scheduled hours from eight hours; it does not calculate free time slots.
- Possible duplicates across selected office calendars are consolidated using title, time, venue, facilitators, participants, and focal persons. Matches are estimates and are marked in the activity details; original calendar entries are unchanged.

## Updated dashboard features

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

The browser smoke test checks live Google feeds, month navigation, filtering, absence of the removed header buttons, mobile layout, and JavaScript errors using a device timezone outside the Philippines. Screenshots are written to the ignored test-results directory.
