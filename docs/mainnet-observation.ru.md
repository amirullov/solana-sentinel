# Бесплатное наблюдение за mainnet — 6 ноября 2026

## Что было запущено 6 ноября

Solana Sentinel локально опрашивает finalized данные публичного mainnet RPC для Jupiter Swap V6 — `JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4`. Jupiter [указывает этот Program ID в документации](https://developers.jup.ag/docs/swap/v1/common-errors). Запрос к mainnet подтвердил владельца `BPFLoaderUpgradeab1e11111111111111111111111`, ProgramData `4Ec7ZxZS6Sbdg5UGSLHbAnM7GQHp2eFd4KYWRexAipQT` и существующую upgrade authority.

Режим `--poll-rpc` читал историю ProgramData каждые 30 секунд и сохранял checkpoint в отдельной локальной базе `sentinel_mainnet`. API и панель были доступны на `http://localhost:4100` и `http://localhost:3000`. Devnet-данные сохранены в другой базе, а прежняя локальная конфигурация — в игнорируемом Git файле `.env.devnet.local` на этом компьютере.

`PUBLISHER_ENABLED=false`, keypair для mainnet не задан. Процессы не отправляли транзакции и не тратили SOL. В mainnet **не развёрнуты** Sentinel registry, Finding PDA и verified build. Панель показывает только локальные результаты наблюдения, а не on-chain attestations Sentinel.

## Проверенный старт

Первый запуск обработал 20 последних finalized подписей ProgramData: `transactions: 20`, `inserted: 0`, `initialHistoryCapped: 1`. Это означает, что более старая история не проверена; отсутствие находок не означает отсутствие прошлых изменений или безопасность Jupiter. После установления checkpoint `/v1/status` вернул `operational` без issues. Это моментальная проверка, не гарантия uptime.

## Повторный запуск на этом компьютере

1. Убедиться, что Docker и PostgreSQL контейнер проекта запущены. В `.env` выбран `mainnet-beta`, публичный RPC, Program ID Jupiter и база `sentinel_mainnet`; в Git этот файл не попадает.
2. Из корня проекта выполнить `pnpm db:migrate`.
3. В отдельных терминалах выполнить `pnpm --filter @sentinel/indexer start -- --poll-rpc`, `pnpm --filter @sentinel/api start` и `pnpm --filter @sentinel/web start`. После изменения web-кода сначала выполнить `pnpm --filter @sentinel/web build`.
4. Открыть `http://localhost:3000` и проверить `/v1/status` на `http://localhost:4100`.

Публичный RPC ограничен по запросам, может не хранить нужные старые транзакции и не даёт гарантии доступности. При потере доступной истории индексатор остановится с ошибкой вместо тихого продвижения checkpoint. Мониторинг работает, только пока включён компьютер и запущены локальные процессы. Режим не восстанавливает исторические bytes произвольных watched accounts; он наблюдает loader-v3 ProgramData.

Чтобы вернуться к devnet на этом компьютере, остановить три процесса, скопировать `.env.devnet.local` обратно в `.env` и запустить их снова. Devnet и mainnet базы остаются раздельными.

Обновление 10 ноября: после открытия Docker Desktop база снова стала healthy. Исторический [кейс обновления Jupiter](case-study-jupiter-mainnet.ru.md) импортирован в PostgreSQL и показан в панели; API и RPC-опрос были запущены заново. `/v1/status` во время проверки вернул `operational`. Для дальнейшей работы процессы должны оставаться запущенными.

## Запуск в новом клоне без оплаты

В новом клоне репозитория нужен Node.js 24+, pnpm 11.25+ и Docker Desktop. Файл [.env.mainnet.example](../.env.mainnet.example) содержит только публичные адреса и настройки чтения. В PowerShell из корня проекта:

```powershell
Copy-Item .env.mainnet.example .env
pnpm install --frozen-lockfile
pnpm db:up
pnpm db:migrate
pnpm build
```

Запустить индексатор, API и панель в трёх отдельных терминалах:

```powershell
pnpm --filter @sentinel/indexer start -- --poll-rpc
pnpm --filter @sentinel/api start
pnpm --filter @sentinel/web start
```

Панель откроется на `http://localhost:3000`. Первый опрос ограничен 20 последними подписями ProgramData и **не покрывает всю историю**. Чтобы добавить именно исторический Jupiter-кейс, отдельно выполнить:

```powershell
pnpm --filter @sentinel/indexer import:signature C3Wt7dTJ12Jb8zNBDrhoTQFRRtbpaWqXSF749HZPBvUXaAqCZVLRBQmyMwfjA1c8RboxujWENqQThxKXKAMAYg9
pnpm portfolio:check
```

Импорт зависит от того, отдаёт ли выбранный RPC эту старую finalized транзакцию. Если он её не отдаёт, [зафиксированный кейс и evidence](case-study-jupiter-mainnet.ru.md) остаются доступны в репозитории, но локальная база не получит находку и `portfolio:check` не пройдёт. Пилот не требует ключей или SOL и ничего не публикует в mainnet.
