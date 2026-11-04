BEGIN;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS watched_programs (
  program_id text PRIMARY KEY CHECK (length(program_id) BETWEEN 32 AND 44),
  programdata_address text,
  loader text NOT NULL CHECK (loader IN ('loader-v3', 'loader-v4', 'unknown')),
  cluster text NOT NULL CHECK (cluster IN ('localnet', 'devnet', 'testnet', 'mainnet-beta')),
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chain_events (
  event_id char(64) PRIMARY KEY CHECK (event_id ~ '^[0-9a-f]{64}$'),
  event_type text NOT NULL CHECK (event_type IN (
    'PROGRAM_UPGRADED', 'UPGRADE_AUTHORITY_CHANGED', 'WATCHED_ACCOUNT_CHANGED'
  )),
  cluster text NOT NULL CHECK (cluster IN ('localnet', 'devnet', 'testnet', 'mainnet-beta')),
  target_address text NOT NULL,
  program_address text,
  signature text NOT NULL,
  slot bigint NOT NULL CHECK (slot >= 0),
  commitment text NOT NULL CHECK (commitment IN ('processed', 'confirmed', 'finalized')),
  observed_at timestamptz NOT NULL,
  before_hash char(64),
  after_hash char(64) NOT NULL,
  inserted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cluster, signature, target_address, event_type)
);

CREATE INDEX IF NOT EXISTS chain_events_slot_idx ON chain_events (cluster, slot DESC);
CREATE INDEX IF NOT EXISTS chain_events_target_idx ON chain_events (target_address, slot DESC);

CREATE TABLE IF NOT EXISTS account_snapshots (
  snapshot_id bigserial PRIMARY KEY,
  cluster text NOT NULL,
  address text NOT NULL,
  slot bigint NOT NULL CHECK (slot >= 0),
  data_hash char(64) NOT NULL,
  data_base64 text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cluster, address, slot, data_hash)
);

CREATE TABLE IF NOT EXISTS findings (
  finding_id uuid PRIMARY KEY,
  event_id char(64) NOT NULL REFERENCES chain_events(event_id),
  rule_id text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('info', 'low', 'medium', 'high', 'critical')),
  evidence_hash char(64) NOT NULL,
  evidence jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, rule_id)
);

CREATE TABLE IF NOT EXISTS attestations (
  finding_id uuid PRIMARY KEY REFERENCES findings(finding_id),
  cluster text NOT NULL,
  registry_program_id text NOT NULL,
  transaction_signature text NOT NULL UNIQUE,
  published_slot bigint NOT NULL,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ingestion_checkpoints (
  source_id text PRIMARY KEY,
  cluster text NOT NULL,
  finalized_slot bigint NOT NULL CHECK (finalized_slot >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notification_outbox (
  id bigserial PRIMARY KEY,
  finding_id uuid NOT NULL REFERENCES findings(finding_id),
  destination_id text NOT NULL,
  payload jsonb NOT NULL,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  available_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (finding_id, destination_id)
);

CREATE INDEX IF NOT EXISTS notification_outbox_pending_idx
  ON notification_outbox (available_at)
  WHERE delivered_at IS NULL;

INSERT INTO schema_migrations(version) VALUES ('0001_foundation')
ON CONFLICT (version) DO NOTHING;

COMMIT;

