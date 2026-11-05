# Threat model Solana Sentinel

Полная модель и границы доверия описаны в [SDD](./SDD.ru.md). Этот файл — оперативный чек-лист.

| Угроза                       | Основной контроль                                     | Остаточный риск                           |
| ---------------------------- | ----------------------------------------------------- | ----------------------------------------- |
| Потеря Yellowstone-сообщений | finalized checkpoint + RPC reconciliation             | RPC может не хранить нужную историю       |
| Дубликаты/переупорядочивание | deterministic event ID + unique constraints           | ошибка канонизации создаст новый ID       |
| Reorg раннего состояния      | разделение provisional/finalized                      | предварительный UI alert может исчезнуть  |
| Компрометация publisher      | отдельный ключ, лимит SOL, rotation                   | до ротации возможны ложные attestations   |
| Ошибка RPC-провайдера        | независимый secondary RPC для проверки                | коррелированная ошибка провайдеров        |
| SSRF через webhook           | HTTPS, запрет private IP, pin проверенного DNS-адреса | Ошибка IP-классификации или egress policy |
| Supply-chain атака           | lockfiles, Dependabot, минимальные CI permissions     | вредоносный код в разрешённой версии      |
| Silent failure индексатора   | lag/heartbeat/checkpoint alerts                       | неверная метрика может скрыть отказ       |

Attestation подтверждает, что publisher опубликовал конкретный hash. Она не доказывает правильность security-вывода и не заменяет аудит.
