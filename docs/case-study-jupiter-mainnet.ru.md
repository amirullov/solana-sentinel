# Кейс: обновление Jupiter Swap V6 в Solana mainnet

Дата подготовки: 10 ноября 2026. Это **исторический разбор** опубликованной транзакции, а не утверждение, что Sentinel обнаружил событие в момент его появления.

## Событие

Jupiter [указывает](https://developers.jup.ag/docs/swap/v1/common-errors) Program ID `JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4`. Его ProgramData — `4Ec7ZxZS6Sbdg5UGSLHbAnM7GQHp2eFd4KYWRexAipQT`. В [finalized транзакции](https://explorer.solana.com/tx/C3Wt7dTJ12Jb8zNBDrhoTQFRRtbpaWqXSF749HZPBvUXaAqCZVLRBQmyMwfjA1c8RboxujWENqQThxKXKAMAYg9) `C3Wt7dTJ12Jb8zNBDrhoTQFRRtbpaWqXSF749HZPBvUXaAqCZVLRBQmyMwfjA1c8RboxujWENqQThxKXKAMAYg9` на слоте `462802085` находится вложенная инструкция loader-v3 `Upgrade`. Время блока по RPC — 29 октября 2026, 07:47:21 UTC.

Первый mainnet pilot Sentinel просмотрел 20 последних подписей ProgramData, но не создал находку: RPC-декодер анализировал только внешние инструкции. Исправленный декодер включает вложенные инструкции в порядке исполнения. Он воспроизвёл `PROGRAM_UPGRADED` с `instructionIndex: 3` и `sourceHash: 684b5203abcdcbe9050b64dd419719d6644eb479f28211587786e0551e39a079`.

## Доказательства Sentinel

| Поле          | Значение                                                           |
| ------------- | ------------------------------------------------------------------ |
| Event ID      | `e268a03061deb5c704a5b489583c3396c73237e4123e5002c2e9b082051f8d19` |
| Finding ID    | `a78d32a5-7053-5fe1-8b95-9a3d27de5b93`                             |
| Правило       | `loader-v3-program-upgraded`, версия 1                             |
| Severity      | `medium` — классификация правила, не оценка безопасности Jupiter   |
| Evidence hash | `44a31baf73549f02921bd73e8fc93ffbc2036d32a5fc189539a1355c40b5517c` |

[Снимок панели](assets/sentinel-dashboard.png) · [Снимок страницы доказательств](assets/sentinel-evidence.png)

Полный event, finding и evidence bundle сохранены в [JSON](jupiter-mainnet-evidence.json). Воспроизведение из корня репозитория после `pnpm install` и `pnpm build`:

```bash
pnpm --filter @sentinel/indexer import:signature C3Wt7dTJ12Jb8zNBDrhoTQFRRtbpaWqXSF749HZPBvUXaAqCZVLRBQmyMwfjA1c8RboxujWENqQThxKXKAMAYg9 --dry-run
```

Команда читает finalized транзакцию, проверяет успешный статус и совпадение адресов наблюдаемой программы, затем вычисляет finding/evidence без записи в базу и без отправки транзакций. Результат зависит от доступности исторической транзакции у RPC. `getTransaction` и данные loader-вызова получены через публичный Solana mainnet RPC; второй независимый публичный endpoint не предоставил эту старую транзакцию, поэтому **двухоператорная проверка истории не подтверждена**.

## Граница результата

После запуска локальной базы 10 ноября команда без `--dry-run` сохранила событие и finding в PostgreSQL (`status: inserted`). Повторный импорт вернул `status: duplicate`. API `/v1/findings` показал одну mainnet-находку; `/v1/findings/a78d32a5-7053-5fe1-8b95-9a3d27de5b93/evidence` вернул тот же Event ID и Evidence hash, что в JSON. Панель `http://localhost:3000` отобразила находку, а `/v1/status` в момент проверки вернул `operational` без issues. Это локальная проверка, не доказательство постоянной доступности.

Публикации в собственный on-chain реестр Sentinel в mainnet нет; mainnet Program ID, Finding PDA и verified build для Sentinel отсутствуют. Нахождение исторической транзакции не доказывает, что Sentinel обнаружил её в реальном времени. Событие показывает изменение кода, но само по себе не доказывает вредоносность или уязвимость Jupiter.
