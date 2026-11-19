ALTER TABLE messages      ADD COLUMN IF NOT EXISTS reason text;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS escalation_reason text;
