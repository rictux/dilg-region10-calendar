-- Apply with psql --single-transaction --set ON_ERROR_STOP=1.
-- Deliberately fail if the table already exists; never overwrite existing data.
CREATE SCHEMA IF NOT EXISTS system_calendar;

CREATE TABLE system_calendar.calendar_links (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    link text NOT NULL UNIQUE,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT calendar_links_name_valid CHECK (
        name = btrim(name) AND char_length(name) BETWEEN 1 AND 200
    ),
    CONSTRAINT calendar_links_public_google_url CHECK (
        char_length(link) <= 2048
        AND link ~ '^https://calendar[.]google[.]com/calendar/(embed[?]|u/[0-9]+([/?])|ical/[^/]+/public/basic[.]ics([?]|$))'
        AND link !~ '[[:space:]]'
        AND link !~* 'private-'
    )
);

ALTER TABLE system_calendar.calendar_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON system_calendar.calendar_links FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA system_calendar TO anon, authenticated, service_role;
GRANT SELECT ON system_calendar.calendar_links TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON system_calendar.calendar_links TO service_role;

CREATE POLICY calendar_links_read
    ON system_calendar.calendar_links
    FOR SELECT TO anon, authenticated
    USING (true);

COMMENT ON TABLE system_calendar.calendar_links IS
    'Public Google Calendar names and links. Never store secret iCal URLs here.';

NOTIFY pgrst, 'reload schema';
