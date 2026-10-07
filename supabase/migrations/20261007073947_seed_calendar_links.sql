-- Snapshot of DEFAULT_NAMES and DEFAULT_LINKS in public/app.js.
-- Safe to rerun: existing links (including customized names) are preserved.
INSERT INTO system_calendar.calendar_links (name, link)
VALUES
    ('LGMED', 'https://calendar.google.com/calendar/embed?src=dilg.lgmed10%40gmail.com&ctz=Asia%2FManila'),
    ('RICTU', 'https://calendar.google.com/calendar/embed?src=rictu.dilg10%40gmail.com&ctz=Asia%2FManila'),
    ('Planning', 'https://calendar.google.com/calendar/embed?src=rtenplanning%40gmail.com&ctz=Asia%2FManila'),
    ('Quality Management', 'https://calendar.google.com/calendar/embed?src=qmsec10dilg%40gmail.com&ctz=Asia%2FManila'),
    ('Personnel', 'https://calendar.google.com/calendar/embed?src=region10personnel%40gmail.com&ctz=Asia%2FManila'),
    ('PDMU', 'https://calendar.google.com/calendar/u/0?cid=ZGlsZzEwcGRtdUBnbWFpbC5jb20'),
    ('LGCDD', 'https://calendar.google.com/calendar/embed?src=lgcdd10dilg%40gmail.com&ctz=Asia%2FManila'),
    ('Legal', 'https://calendar.google.com/calendar/u/0/embed?src=legaldilg10@gmail.com&ctz=Asia/Manila'),
    ('BAC -DILG', 'https://calendar.google.com/calendar/u/0/r/month/2026/11/1?cid=bacdilgr10%40gmail.com'),
    ('ORD', 'https://calendar.google.com/calendar/embed?src=orddilg10%40gmail.com&ctz=Asia%2FManila')
ON CONFLICT (link) DO NOTHING;
