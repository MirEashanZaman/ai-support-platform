-- 002_chat_columns.sql
-- Run as the OWNER/migration role. Existing app_tenant_user table grants already cover new columns.

ALTER TABLE messages      ADD COLUMN IF NOT EXISTS reason text;             -- why the bot message was sent (e.g. low_confidence)
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS escalation_reason text;  -- why the chat went to the agent queue

-- Down:
--   ALTER TABLE messages      DROP COLUMN IF EXISTS reason;
--   ALTER TABLE conversations DROP COLUMN IF EXISTS escalation_reason;
