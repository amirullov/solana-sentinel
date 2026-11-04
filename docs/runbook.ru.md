# Локальный runbook

## Foundation path

1. Открыть `solana-sentinel.code-workspace` или Dev Container.
2. Скопировать `.env.example` в `.env`; оставить `PUBLISHER_ENABLED=false`.
3. Выполнить `pnpm install`.
4. Запустить PostgreSQL: `pnpm db:up`.
5. Применить миграции: `pnpm db:migrate`.
6. Выполнить replay: `pnpm build`, затем `pnpm --filter @sentinel/indexer start -- --replay tests/fixtures/account-updates.json`.
7. Запустить API и web отдельными задачами VS Code.

## RPC recovery и live ingestion

1. Задать `WATCHED_PROGRAM_IDS` через запятую; для обычных accounts использовать `WATCHED_ACCOUNT_IDS`.
2. Выполнить `--reconcile`, проверить summary и строки `ingestion_checkpoints`.
3. Для live режима задать `YELLOWSTONE_ENDPOINT`/`YELLOWSTONE_X_TOKEN` и запустить indexer без флагов.
4. Yellowstone v10 использует native N-API; live процесс запускается в Linux/Dev Container. Replay/RPC/API работают на Windows.
5. Если outage содержит больше `RPC_BACKFILL_MAX_SIGNATURES`, indexer останавливается с явной ошибкой и не продвигает cursor.

## Диагностика

- `/health/live` подтверждает только работоспособность процесса.
- `/health/ready` также проверяет PostgreSQL.
- Нельзя считать систему здоровой без метрики отставания finalized slot и движения checkpoint.
- Повторный запуск миграций и replay должен быть идемпотентным.

## Publisher

Publisher выключен по умолчанию. Для включения одновременно требуются keypair path и `PUBLISHER_CONFIRM_PROGRAM_DEPLOYED=true`; перед отправкой проверяются executable program и RegistryConfig PDA. Снимать gate следует только после локальных Anchor integration tests, devnet E2E, проверки key separation и явного review.

## Инцидент с ключом

1. Остановить publisher.
2. Не удалять прежние findings.
3. Выполнить ротацию publisher от admin после независимой проверки.
4. Опубликовать corrections для доказанно неверных записей.
5. Задокументировать временной диапазон компрометации и сигнатуры.
