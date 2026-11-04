# Solana Sentinel

[![CI](https://github.com/amirullov/solana-sentinel/actions/workflows/ci.yml/badge.svg)](https://github.com/amirullov/solana-sentinel/actions/workflows/ci.yml)

Solana Sentinel — foundation для security-инфраструктуры, которая фиксирует критические изменения Solana-программ и аккаунтов, формирует воспроизводимые evidence hashes и в будущем публикует выбранные finalized findings в собственный on-chain registry.

> Текущий честный статус: локальная стартовая реализация. Mainnet deployment, работающий production-monitoring и verified build **не выполнялись**. Program ID в конфигурации — development placeholder.

## Что уже есть

- детерминированные event ID и канонические evidence hashes;
- loader-v3 decoder для Program/ProgramData accounts;
- идемпотентный replay pipeline и fixture tests;
- PostgreSQL schema с event log, snapshots, findings, attestations, checkpoints и outbox;
- Anchor registry: initialize, immutable finding, publisher rotation, correction;
- Fastify API foundation и Next.js status dashboard;
- Docker Compose, Dev Container, VS Code workspace/tasks/launch;
- CI для TypeScript, Rust и повторного применения миграций.

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

Для VS Code откройте `solana-sentinel.code-workspace`.

## Структура

```text
apps/       indexer, API, publisher gate, notifier, web
packages/   core, evidence, config, database, Solana adapters, registry SDK
programs/   Anchor program sentinel_registry
infra/      PostgreSQL migrations and Docker
docs/       SDD, threat model, runbook, ADR
tests/      replay fixtures
```

## Следующий проверяемый milestone

Milestone 1 — полноценная корреляция Yellowstone account/transaction/slot streams с RPC backfill, checkpoint recovery и replay известных loader-v3 upgrade transactions. До её завершения live ingestion намеренно gated.

Подробности: [Software Design Document](docs/SDD.ru.md), [threat model](docs/threat-model.ru.md), [runbook](docs/runbook.ru.md).

## Лицензия

Apache-2.0.
