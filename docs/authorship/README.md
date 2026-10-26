# Подтверждение авторства и даты

Автор и правообладатель программы «Приёмочная комиссия» — **Мухамедяров Эльнур Тофикович**.

В этой папке лежат доказательства того, что точная версия программы существовала
не позднее указанной даты.

| Файл | Что это |
|------|---------|
| `2026-10-26-manifest.txt` | Манифест: автор, номер версии (git commit) и отпечаток SHA-256 каждого файла программы |
| `2026-10-26-manifest.txt.tsr` | Метка времени FreeTSA (стандарт RFC 3161) на манифест: **26.10.2026 10:17:25 UTC** |
| `2026-10-26-manifest.txt.tsq` | Запрос, по которому выдана метка FreeTSA |
| `freetsa-cacert.pem`, `freetsa-tsa.crt` | Сертификаты FreeTSA для проверки метки |
| `2026-10-26-manifest.txt.ots` | Метка OpenTimestamps: отпечаток манифеста записан в блокчейн Биткоина |

Изменить хотя бы один символ в манифесте или в любом файле программы невозможно
незаметно: отпечатки перестанут совпадать.

## Как проверить

Метка FreeTSA (нужен OpenSSL):

```bash
openssl ts -verify -in 2026-10-26-manifest.txt.tsr -data 2026-10-26-manifest.txt \
  -CAfile freetsa-cacert.pem -untrusted freetsa-tsa.crt
openssl ts -reply -in 2026-10-26-manifest.txt.tsr -text | grep "Time stamp"
```

Метка OpenTimestamps: загрузите `2026-10-26-manifest.txt` и `.ots` на https://opentimestamps.org
или выполните `ots verify 2026-10-26-manifest.txt.ots`.

Отпечатки файлов: получите версию из манифеста (`git checkout <commit>`) и сравните
`sha256sum <файл>` со строками манифеста.
