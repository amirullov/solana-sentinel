# Devnet validation — 6 ноября 2026

## Область проверки

Проверена цепочка для двух реальных изменений upgrade authority: finalized Solana transaction → бесплатный RPC polling → PostgreSQL event/finding/evidence → on-chain Finding PDA → независимый read-only verifier. Проверка Yellowstone gRPC, обычных watched accounts, mainnet и verified build не выполнялась.

## Адреса и конфигурация

| Объект                    | Адрес                                          |
| ------------------------- | ---------------------------------------------- |
| Registry Program ID       | `BZ3PWjMS6g4bkPjr66h5Vb4e2qHyj3To2EDzTT9j5yY6` |
| ProgramData               | `9TSx423a4Qn1nVUJRQLqDC8yeUcpFKUQmM1rjr8br9uc` |
| RegistryConfig PDA        | `ARCWLBKJBoncJChtf7r8dwquLAbASr4AKFeLTjb2F2us` |
| Program upgrade authority | `Hu1VCSfbdquXaUuJdUYEznR7nwDfn8bVJEQgw4odPr12` |
| Registry admin            | `D3ufKfQ19rKcQfJz8BemY6tEgNCUkrMvywJcPuwPCC4r` |
| Registry publisher        | `B1MLcjjrabdEiKKfqmnEw3wrZutUhGMeBJNLn1LVssdu` |

Основной RPC: публичный Solana devnet. Второй оператор для публикации: публичный OnFinality devnet RPC. Оба вернули одинаковый genesis hash `EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG`. Публичные endpoint имеют лимиты; это проверка devnet, не production-конфигурация.

## Транзакции

| Действие                     | Финализированная подпись                                                                                                                                      |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Развёртывание программы      | [`9SqviSMy…TPkMf87T`](https://explorer.solana.com/tx/9SqviSMy3n3XSHSUWxkDs11QXvnz8reZdL9hhLEt5Cpr1USA3MoLVFduYn7vjqp8pshDWcXHmjbsEs8TPkMf87T?cluster=devnet)  |
| Инициализация RegistryConfig | [`8Y9zhLMe…RkdEB9b`](https://explorer.solana.com/tx/8Y9zhLMeVqt6z7FSYn1Cxr5UYsPaU3fuEHZZPZEEcJWDtDgsTiWWzNhnVk7ek1igPePVjMcdK6eMxHaERkdEB9b?cluster=devnet)   |
| Смена upgrade authority      | [`cdsLsx9N…f1Yq8Eh`](https://explorer.solana.com/tx/cdsLsx9NkYvVinTZr5bC4AvjvgctVnsCQm2UTaAZpVnqrRfWbfZ3opAD5Jqc3kRtnmPrPDsXesopQtAVf1Yq8Eh?cluster=devnet)   |
| Возврат upgrade authority    | [`5JApFjDM…TDseunV`](https://explorer.solana.com/tx/5JApFjDMBHdJstHznB5mdazHi88TLdWNmEnvEmTKPQHiJ7ys3z5mQN2VLaAG4YaAf7rrqa1e1uQGGtmPnTDseunV?cluster=devnet)  |
| Публикация первого finding   | [`5LWRniXc…Dn3pXAxo`](https://explorer.solana.com/tx/5LWRniXc84QzGTrRzBPxeVJU9jTr7tKkGoCQP2AYjYYZQxcD4Vf3iKdE38i1X85D9GH7mmkn37ZiuYAYDn3pXAxo?cluster=devnet) |
| Публикация второго finding   | [`43jkb93r…vtQ7AdS`](https://explorer.solana.com/tx/43jkb93rbQAqwkELpTdup1yLzRWrj4sUNUWSZsYMcyznYtgKTP3iLsYMmTEMZwX8jKozSzAzY3JF297T1vtQ7AdS?cluster=devnet)  |

## Результат независимой проверки

| Finding ID                             | Evidence hash                                                      | Finding PDA                                    | Результат        |
| -------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------- | ---------------- |
| `6692a4df-d0e7-56ec-b80a-69b48c0f204d` | `dca3dd62fda94ffa2eb32904c2ed9853627767454e084a320cdb1813e5176b89` | `Cpa9tR9YhNTMR14ZjBevsMmxvDViGkwYSSFQ2HF9PRo1` | `verified: true` |
| `086d5131-349f-5e82-9bbf-170068b36341` | `2d12ec2b1c626fa29916a94a503f0cd26733d8ec7633c22ec1aa342278aa90f2` | `BYFXr557KWtTgLQwZjJksGuN1WeNVPQb31VcboZgyPEZ` | `verified: true` |

Verifier пересчитал API evidence hash, сверил event ID, кластер, тип, адрес, slot и evidence hash в PDA, owner/executable программы и finalized статусы исходной и публикационной транзакций. Все 15 checks вернули `true` для обоих findings. API `/health/ready` ответил `ready`, `/v1/status` — `operational` во время теста. Эти значения не означают постоянный uptime.

После теста upgrade authority снова у deployer, `PUBLISHER_ENABLED=false`. PostgreSQL, API и RPC indexer запущены локально; публичного хостинга нет. Последние GitHub Actions jobs не стартуют из-за billing lock аккаунта, поэтому этот devnet прогон подтверждён локальными проверками и on-chain подписями. Предыдущий CI проходил до этой блокировки.

Первая попытка deployment через публичный RPC достигла rate limit и оставила временный buffer; buffer закрыт, тестовые SOL возвращены. Solana CLI напечатал recovery phrase этого временного buffer в диагностике, поэтому buffer не используется повторно. Постоянные ключи deployer/admin/publisher/program не выводились. Успешный deployment выполнен через TPU client с заранее созданным отдельным buffer keypair.
