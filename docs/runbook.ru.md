# Локальный runbook

## Foundation path

1. Открыть `solana-sentinel.code-workspace` или Dev Container.
2. Скопировать `.env.example` в `.env`; оставить `PUBLISHER_ENABLED=false`.
3. Выполнить `pnpm install`.
4. Запустить PostgreSQL: `pnpm db:up`.
5. Применить миграции: `pnpm db:migrate`.
6. Выполнить replay: `pnpm build`, затем `pnpm --filter @sentinel/indexer start -- --replay tests/fixtures/account-updates.json`.
7. Запустить API и web отдельными задачами VS Code.

## Диагностика

- `/health/live` подтверждает только работоспособность процесса.
- `/health/ready` также проверяет PostgreSQL.
- Нельзя считать систему здоровой без метрики отставания finalized slot и движения checkpoint.
- Повторный запуск миграций и replay должен быть идемпотентным.

## Publisher

Publisher намеренно выключен. В foundation-релизе включение завершается ошибкой до отправки транзакции. Снять gate можно только после локальных Anchor integration tests, devnet E2E, проверки key separation и явного review.

## Инцидент с ключом

1. Остановить publisher.
2. Не удалять прежние findings.
3. Выполнить ротацию publisher от admin после независимой проверки.
4. Опубликовать corrections для доказанно неверных записей.
5. Задокументировать временной диапазон компрометации и сигнатуры.
