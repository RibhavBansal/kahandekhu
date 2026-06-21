-- KahanDekhu bot — reminder storage (Cloudflare D1)
-- Apply with:
--   wrangler d1 execute kahandekhu --remote --file=schema.sql

CREATE TABLE IF NOT EXISTS subscriptions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id     INTEGER NOT NULL,           -- Telegram chat to notify
    tmdb_id     INTEGER NOT NULL,           -- the title's TMDB id
    media_type  TEXT    NOT NULL,           -- 'movie' or 'tv'
    title       TEXT    NOT NULL,           -- cached display title
    region      TEXT    NOT NULL DEFAULT 'IN',
    created_at  INTEGER NOT NULL            -- epoch ms
);

CREATE INDEX IF NOT EXISTS idx_chat ON subscriptions(chat_id);

-- Prevents the same person subscribing to the same title twice.
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_sub
ON subscriptions(chat_id, tmdb_id, media_type);
