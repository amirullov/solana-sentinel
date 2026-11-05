# Solana Sentinel

[![CI](https://github.com/amirullov/solana-sentinel/actions/workflows/ci.yml/badge.svg)](https://github.com/amirullov/solana-sentinel/actions/workflows/ci.yml)

Solana Sentinel — foundation для security-инфраструктуры, которая фиксирует критические изменения Solana-программ и аккаунтов, формирует воспроизводимые evidence hashes и в будущем публикует выбранные finalized findings в собственный on-chain registry.

> Текущий честный статус: функциональная pre-devnet реализация, проверенная локальными тестами и CI. Внешний Yellowstone/RPC E2E, devnet/mainnet deployment, production-monitoring и verified build **не выполнялись**. Program ID в конфигурации — development placeholder.

## Что уже есть

- детерминированные event ID и канонические evidence hashes;
- loader-v3 account и transaction instruction decoders;
- Yellowstone finalized stream с replay/reconnect и корреляцией transaction/account;
- RPC reconciliation с durable signature cursor и защитой от необнаруженного большого gap;
- идемпотентный replay pipeline и fixture tests;
- PostgreSQL schema с event log, snapshots, findings, attestations, checkpoints и outbox;
- versioned detection rules и атомарное сохранение evidence-backed findings;
- Anchor registry и TypeScript SDK/verifier: initialize, immutable finding, publisher rotation, correction;
- fail-closed publisher, безопасная доставка подписанных webhooks;
- Fastify API и runtime Next.js dashboard;
- Docker Compose, Dev Container, VS Code workspace/tasks/launch;
- CI для TypeScript, Rust и повторного применения миграций.
- local-validator suite для публикации, исправлений и ротации publisher (6 сценариев локально прошли).
- отдельный read-only verifier CLI для сравнения API evidence с Finding PDA и finalized signatures.

## Быстрый старт

Требования: Node.js 24+, pnpm 11.25+, Rust 1.98.1, Docker. Solana/Anchor CLI нужны для будущих local-validator тестов, но не для off-chain unit tests.

```bash
pnpm install
pnpm db:up
pnpm db:migrate
pnpm build
pnpm test
cargo test --workspace
pnpm --filter @sentinel/indexer start -- --replay tests/fixtures/account-updates.json
```

Для RPC recovery укажите `WATCHED_PROGRAM_IDS` и выполните:

```bash
pnpm --filter @sentinel/indexer start -- --reconcile
```

Live mode дополнительно требует `YELLOWSTONE_ENDPOINT` и, если нужен провайдеру, `YELLOWSTONE_X_TOKEN`. Нативный Yellowstone client запускайте в Linux/Dev Container; текущий пакет не поставляет Windows N-API binary.

Для VS Code откройте `solana-sentinel.code-workspace`.

## Структура

```text
apps/       indexer, API, publisher gate, notifier, verifier, web
packages/   core, evidence, config, database, Solana adapters, registry SDK
programs/   Anchor program sentinel_registry
infra/      PostgreSQL migrations and Docker
docs/       SDD, threat model, runbook, ADR
tests/      replay fixtures
```

## Следующий проверяемый milestone

Milestone 2 — контролируемый devnet E2E. Local-validator suite прошёл 6 сценариев; live/RPC код проверен локально и в CI, но без Yellowstone endpoint и watched devnet program внешний E2E не заявляется как прошедший.

Подробности: [Software Design Document](docs/SDD.ru.md), [threat model](docs/threat-model.ru.md), [runbook](docs/runbook.ru.md).

## Лицензия

Apache-2.0.
