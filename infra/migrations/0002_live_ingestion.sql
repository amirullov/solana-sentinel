BEGIN;

ALTER TABLE chain_events ADD COLUMN IF NOT EXISTS source_hash char(64);
UPDATE chain_events SET source_hash = COALESCE(after_hash, repeat('0', 64)) WHERE source_hash IS NULL;
ALTER TABLE chain_events ALTER COLUMN source_hash SET NOT NULL;
ALTER TABLE chain_events ALTER COLUMN after_hash DROP NOT NULL;

ALTER TABLE account_snapshots ADD COLUMN IF NOT EXISTS signature text;
ALTER TABLE account_snapshots ADD COLUMN IF NOT EXISTS commitment text;

ALTER TABLE findings ADD COLUMN IF NOT EXISTS rule_version integer NOT NULL DEFAULT 1;
ALTER TABLE findings ADD COLUMN IF NOT EXISTS title text NOT NULL DEFAULT 'Security finding';

ALTER TABLE ingestion_checkpoints ADD COLUMN IF NOT EXISTS cursor_signature text;
ALTER TABLE ingestion_checkpoints ADD COLUMN IF NOT EXISTS observed_finalized_slot bigint;

CREATE TABLE IF NOT EXISTS webhook_destinations (
  destination_id text PRIMARY KEY,
  url text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  secret_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS service_status (
  service_id text PRIMARY KEY,
  state text NOT NULL CHECK (state IN ('starting', 'healthy', 'degraded', 'stopped')),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  heartbeat_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO schema_migrations(version) VALUES ('0002_live_ingestion')
ON CONFLICT (version) DO NOTHING;

COMMIT;
