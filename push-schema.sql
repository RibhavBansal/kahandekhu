-- KahanDekhu — Web Push reminders (Cloudflare D1)
-- Run: wrangler d1 execute kahandekhu-push --remote --file=push-schema.sql

CREATE TABLE IF NOT EXISTS reminders (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    endpoint    TEXT    NOT NULL,
    p256dh      TEXT    NOT NULL,
    auth        TEXT    NOT NULL,
    tmdb_id     INTEGER NOT NULL,
    media_type  TEXT    NOT NULL,
    title       TEXT    NOT NULL,
    region      TEXT    NOT NULL DEFAULT 'IN',
    created_at  INTEGER NOT NULL,
    UNIQUE(endpoint, tmdb_id, media_type)
);

CREATE INDEX IF NOT EXISTS idx_reminders_tmdb ON reminders (tmdb_id, media_type);
