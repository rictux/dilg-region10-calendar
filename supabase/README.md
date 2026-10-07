# Calendar database

The migration creates `system_calendar.calendar_links` with `id` (UUID), `name`,
`link` (unique), and `created_at`. Names must be trimmed and 1–200 characters;
links must be public Google Calendar HTTPS URLs of at most 2,048 characters.
Secret iCal links must not be stored in this publicly readable table.

RLS is enabled. `anon` and `authenticated` can only read; `service_role` and the
database administrator can manage records. Never put a service-role key or
database password in frontend code. A separate seed migration inserts the ten
name/link pairs originally defined in `DEFAULT_NAMES` and `DEFAULT_LINKS` in `public/app.js`.
It skips existing links without changing their names or creating duplicates.

## Apply to the VPS through SSH

Requires OpenSSH and PostgreSQL `psql` on your PATH. Keep the existing tunnel
running. If starting a new tunnel, run this in a separate terminal:

```powershell
ssh -N -o ExitOnForwardFailure=yes -L 127.0.0.1:55432:172.16.2.5:5432 root@187.53.136.92
```

From the repository root:

```powershell
.\scripts\migrate-calendar.ps1
```

If you already created the table, insert only the default calendar values:

```powershell
.\scripts\migrate-calendar.ps1 -SeedOnly
```

`-SeedOnly` is safe to run again. The normal command creates the table and seeds
the values together in one transaction.

Enter the **PostgreSQL password**, not the SSH password. The default database
and username are `postgres`; override with `-Database` and `-Username` if needed.
The script connects only to `127.0.0.1:55432`. It does not open SSH itself.

The migration is atomic and stops on any SQL error. Run it once per database.
If the table already exists, it fails and rolls back instead of replacing data.
This applies the selected SQL files using psql; it does not update Supabase CLI migration
history or replay migrations belonging to the regional-hris project.

## Frontend access

The dashboard opens without an access code. Adding a link requires the code
where `used_for = 'add'` and the server-only `supabase_secret_key`. Existing
access-code rows are preserved but no longer used for page access.

The frontend calls this app's `/api/calendar-links` endpoint. The server fetches
the names and links through the VPS Supabase Data API, then the frontend loads
Google events using those links and database names. Set `supabase_url` and
`supabase_publishable_key` in the project-root `.env` (see `.env.example`) or in
the hosting environment. A legacy anon JWT is also supported as the key.

Add `system_calendar` to the existing exposed schemas on the target VPS.
For a CLI-managed local stack, append it to `[api].schemas` in that stack's
`supabase/config.toml`; for Docker Compose, append it to `PGRST_DB_SCHEMAS` in
the REST service configuration. Preserve the existing schemas and restart the
affected service using that stack's deployment procedure.

The PostgreSQL SSH tunnel is for migrations only. Runtime HTTP requests use
the VPS HTTPS API URL. The application does not change or restart VPS services.

See [Supabase custom schemas](https://supabase.com/docs/guides/api/using-custom-schemas).
Do not initialize or reset the separate regional-hris stack from this repository.
