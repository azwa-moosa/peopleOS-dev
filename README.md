# BML People & ER Platform

Internal HR platform built from the *Master Product & Technical Blueprint* (Sept 2026).
This repository is **v0.2** – Sprint 1 foundation, first vertical slice (HR Action Centre, ER Case Management intake) and the **BML design system with light/dark themes** (`docs/design-system.md`).

> **DEV uses synthetic data only.** No real employee data may be loaded outside an approved UAT/PROD environment. CI fails on NID-like values.

## Stack

| Layer | Choice |
|---|---|
| Web | Next.js 15 (App Router) + React 19, **plain CSS design system** – tokens in `apps/web/src/styles/tokens.css`, light/dark/system themes |
| API | NestJS 10 (TypeScript), modular monolith |
| Worker | Node (TypeScript) – transactional-outbox → audit relay |
| Database | PostgreSQL 16 (+ pgvector image), plain SQL migrations, Row-Level Security on ER |
| Auth | Microsoft Entra ID token validation (config-driven) + DEV-only mock IdP personas |
| Tests | Vitest (unit), matrix-driven security suite (Node), Playwright (e2e) |

Provisional per DR-02 (stack) – approved for build by the product owner on 2026-09-29.

## Run it locally

Prerequisites: **Node 22**, **pnpm 10** (`corepack enable`), **Docker** (or a local PostgreSQL 16).

```bash
cp .env.example .env            # DEV values; never commit .env
pnpm install
pnpm infra:up                   # Postgres (+pgvector), Azurite, Mailpit
pnpm db:migrate                 # applies packages/schemas/migrations/*.sql + grants
pnpm db:seed                    # synthetic org, 1,200 employees, 18 personas, sample config
pnpm dev                        # web :3000 · api :4000 · worker
```

Open http://localhost:3000 and pick a persona (one per draft role R1–R16, plus edge cases).

Without Docker: create database `bml_people_er` owned by a superuser called `app_migrator` (password `app_migrator_dev`), then continue from `pnpm db:migrate`. The migration creates the restricted `app_runtime` role itself.

Useful commands:

| Command | What it does |
|---|---|
| `pnpm db:reset` | DEV only – drop all platform schemas, migrate, seed |
| `pnpm test` | Unit tests (policy, crypto, synthetic data, log redaction) |
| `pnpm test:security` | 135 permission-matrix, record/field, workflow, audit-tamper and env-safety checks (needs api + worker running) |
| `pnpm test:e2e` | Playwright browser tests (needs web running) |
| `pnpm test:ui` | 14 theme/UI checks incl. axe accessibility, both themes, 4 screen sizes |
| `pnpm lint:colors` | Fails if any component uses a colour literal instead of a token |
| `pnpm scan:pii` | Fails on real-looking NIDs or secrets |
| `pnpm test:all` | All of the above |
| `pnpm build` | Build packages, API, worker and web |

## Hosted demo

Web on Netlify (`netlify.toml`), API + database on Render (`render.yaml`). Step-by-step: `docs/deploy-hosted-demo.md`.

## Try these journeys

| Persona | Roles | Try |
|---|---|---|
| **Azwa Moosa** – Platform Owner / Super Admin | R1 · R4 · R10 · R11 · R13 · R14 · R15 · R16 + PLATFORM_OWNER | Access Management, Audit → Verify chain, Feature Flags, Design System; note ER is not visible (no ER role) |
| **Rayya** – Manager, ER, Engagement & Analytics | R1 · R3 · R4 · R8 · R11 · R15 | ER dashboard and cases, People Analytics and Engagement previews |
| **Shai** – Head of Total Rewards & ER | R3 · R5 · R10 · R11 | Employees → Reveal salary (audited) |
| **Humaam** – ER Officer | R2 · R13 | Sees only ER-…-0001 (on its case team) |
| **Arif** – Division Head | R6 · R8 | Employees returns DIV01 staff only |
| **Ish** – Employee | R9 | Home, HR Action Centre, Voice only |
| **Bishwajit** – Platform Administrator | R12 | Technical admin only; no employee or ER data |

Single-role fixtures (R1–R16, expired grant, non-team ER officer) are under *Single-role test fixtures* on the sign-in page and drive the automated suites. Switch theme from the user menu (top right) → Appearance.

## Repository layout

```
apps/
  web/        Next.js shell + pages; BFF proxy keeps the token in an httpOnly cookie
  api/        NestJS: auth, policy guard, audit, employees, org, config, actions, er
  worker/     Outbox → audit relay (pg-boss jobs arrive in Phase 2)
packages/
  policy/          Permission catalogue, R1–R16 role bundles, PolicyService, masking, state machine, business calendar
  schemas/         SQL migrations, grants, migrate/seed runners
  synthetic-data/  Deterministic generator (seeded; hash-stable)
  crypto/          AES-256-GCM field encryption for ER narrative
infra/docker/      DEV compose file          infra/pipelines/  CI definitions
tests/security/    matrix.platform.yaml + runner, PII scan
tests/e2e/         Playwright specs
docs/              Planning pack (00-planning), requirements/RTM, architecture, security, audit catalogue, Phase 0 templates
```

## Core rules (BP §24)

- DEV synthetic · UAT approved masked · PROD live controlled.
- No new Employee Master – EmployeeService provider interface; synthetic HRIS stub is DEV/UAT only and the API refuses to start in PROD without a real provider (DR-04).
- Sensitive permissions are enforced server-side; the UI never decides access.
- AI is assistive and evidence-grounded (no AI in this build).
- No public links to dashboards, attachments or documents.
- Every material workflow is audited and versioned.
- Anything marked **SAMPLE** is a placeholder pending a BML decision – see `docs/00-planning/L-decisions-register.md`.

See `docs/architecture.md` for the as-built design and deviations from the plan, and `CHANGELOG.md` for what changed.
