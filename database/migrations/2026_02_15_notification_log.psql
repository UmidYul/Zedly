-- Notification delivery log
-- Run manually or include in your migration pipeline.

CREATE TABLE IF NOT EXISTS notification_log (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
    channel VARCHAR(32) NOT NULL,
    event_key VARCHAR(64) NOT NULL,
    status VARCHAR(24) NOT NULL,
    recipient TEXT NULL,
    subject TEXT NULL,
    error_message TEXT NULL,
    metadata JSONB NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notification_log_user_created
    ON notification_log (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notification_log_event_created
    ON notification_log (event_key, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notification_log_channel_created
    ON notification_log (channel, created_at DESC);
