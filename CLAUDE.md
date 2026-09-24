# Project context for Claude — VTE FE

> **Repo split (2026-09-24):** ова е **FE репото** (`Repos\VTE\FE`) — само Vue
> frontend-от (`frontend-v2/`) + print-layout алатките (`scripts/`). Backend-от,
> SQL миграциите, deploy скриптите и **целосните docs** се во соседното **BE
> repo** (`C:\Users\filip\OneDrive\Documents\Repos\VTE\BE`) — прочитај го
> неговиот `CLAUDE.md` за домен-контекст, гочи и продукциски правила. Легаси
> VB.NET кодот е само во стариот trunk (`Repos\trunk\trunk`).

**VTE** — multi-tenant SaaS rewrite на легаси систем за технички прегледи
(станица Велес, company id 4). Прод: https://116.202.8.155.sslip.io

## Stack

Vue 3 + TypeScript, Vite, Pinia, PrimeVue 4, vue-i18n (MK + EN).
Dev серверот е во `.claude/launch.json` (порт 5174); API-то се пушта од BE
репото (`dotnet run` во `backend-v2/src/VTE.Api`, порт 5300 — Vite proxy).

## Working style (исто како во BE CLAUDE.md)

- **Terse responses**, без емоџиња.
- **Type-check по секоја FE измена**: `cd frontend-v2 && npx vue-tsc -b --force`.
- **Dense UI** — Филип сака компактни гридови; кога се двоумиш, помало.
- **Секој нов user-facing string** оди во `frontend-v2/src/locales/{mk,en}.ts`.
- Деплојот е self-service (Desktop кратенки кон BE\deploy) — никогаш не нуди
  „качи на прод"/„push"; само кажи „спремно за деплој".
