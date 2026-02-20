# Standalone k6 Stress Tests

Эта папка полностью автономна. Можно скопировать на Windows и запускать отдельно от проекта.

## Файлы
- `script.js` — основной k6 сценарий
- `.env.example` — шаблон переменных
- `run.cmd` — быстрый запуск на Windows

## Быстрый старт (Windows)
1. Установи k6 (или запускай через Docker).
2. Открой CMD/PowerShell в папке `perf-tests`.
3. Запусти:

```bat
run.cmd https://your-prod-domain.com
```

С токеном:

```bat
run.cmd https://your-prod-domain.com your_bearer_token
```

## Запуск вручную

```bat
k6 run --env BASE_URL=https://your-prod-domain.com script.js
```

## Что тестируется
- `GET /`
- `GET /api/health`
- `GET /api/public/landing-stats`

## Безопасность для prod
Перед запуском в проде начни с низкой нагрузки:
- `SMOKE_RPS=5`
- `LOAD_STAGE1_RPS=20`
- короткие длительности по 30-60 секунд

Пример:

```bat
k6 run --env BASE_URL=https://your-prod-domain.com --env SMOKE_RPS=5 --env LOAD_STAGE1_RPS=20 --env LOAD_STAGE1_DURATION=30s --env LOAD_STAGE2_RPS=40 --env LOAD_STAGE2_DURATION=30s --env LOAD_STAGE3_RPS=60 --env LOAD_STAGE3_DURATION=30s script.js
```
