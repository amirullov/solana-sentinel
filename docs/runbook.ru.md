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
6. Первый запуск ограничен `RPC_BACKFILL_MAX_SIGNATURES`; `initialHistoryCapped` в summary означает, что более старая история не проверена. Для обычных watched accounts RPC не восстанавливает старые bytes: требуется Yellowstone replay с достаточным retention.

## Диагностика

- `/health/live` подтверждает только работоспособность процесса.
- `/health/ready` также проверяет PostgreSQL.
- Нельзя считать систему здоровой без метрики отставания finalized slot и движения checkpoint.
- Повторный запуск миграций и replay должен быть идемпотентным.
- `/v1/status` считает индексатор активным только при свежем heartbeat и checkpoint. Режим `--reconcile` завершается и не является непрерывным мониторингом.

## Уведомления

Задать `WEBHOOK_SIGNING_SECRET` длиной не менее 32 символов вне Git. Создать HTTPS destination в `webhook_destinations` и запустить notifier. Новые findings создают outbox jobs в той же транзакции. Получатель проверяет HMAC SHA-256 от точных байтов JSON в `x-sentinel-signature`; `x-sentinel-delivery-id` используется для дедупликации повторов. Без destination или секрета доставка не активируется.

## Local validator

Тестовый набор находится в `tests/anchor/`. Проверен с Anchor 0.32.3, Solana CLI 3.1.10 и platform tools v1.58. В Linux/WSL собрать программу:

```bash
anchor build --tools-version v1.58 --arch v0
solana-test-validator --ledger "$(mktemp -d /tmp/solana-sentinel-XXXXXX)" --bpf-program Fg6PaFpoGXkYsidMpWxTWqLNZfjpQm5cS2fnQ71kKb4 target/deploy/sentinel_registry.so
```

Во втором терминале с Node/pnpm выполнить `pnpm --filter @sentinel/anchor-integration test:local`. Новый временный ledger нужен для повторного прогона, поскольку registry инициализируется один раз. Локальный результат: 6/6 сценариев прошли; он не доказывает devnet/mainnet работу.

## Проверка опубликованного finding

После реальной публикации вызвать read-only verifier:

```bash
pnpm --filter @sentinel/verifier start -- http://127.0.0.1:4100 FINDING_UUID https://api.devnet.solana.com REGISTRY_PROGRAM_ID
```

Он независимо пересчитывает canonical evidence hash, сверяет поля Finding PDA, owner программы и finalized статусы исходной и публикационной транзакций. Вывод `verified: true` возможен только при прохождении всех проверок. До devnet deployment такой результат отсутствует.

## Publisher

Publisher выключен по умолчанию. Для включения одновременно требуются keypair path, `PUBLISHER_CONFIRM_PROGRAM_DEPLOYED=true` и независимый `SOLANA_SECONDARY_RPC_URL`; перед отправкой проверяются executable program, RegistryConfig PDA и loader-v3 source transaction на обоих RPC. Снимать gate следует только после devnet E2E, проверки key separation и явного review. Generic watched-account findings пока не публикуются.

## Инцидент с ключом

1. Остановить publisher.
2. Не удалять прежние findings.
3. Выполнить ротацию publisher от admin после независимой проверки.
4. Опубликовать corrections для доказанно неверных записей.
5. Задокументировать временной диапазон компрометации и сигнатуры.
