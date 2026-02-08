# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is DB-MCP

An MCP server that provides governed semantic analytics queries through a multi-tenant semantic layer with multi-database support. It bridges AI assistants and data warehouses by exposing a semantic layer as MCP tools with governance policies (PII blocking, query limits, member exposure controls).

## Commands

```bash
# Docker demo — single command, everything on port 3000
docker compose up

# Local development — infrastructure on exposed ports
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d postgres cube

# Backend development (port 3000)
npm run dev              # Run with tsx (hot reload)
npm run build            # TypeScript compile to dist/
npm run start            # Run compiled dist/index.js
npm run lint             # ESLint on src/
npm run test             # Vitest (run once)
npm run test:watch       # Vitest (watch mode)

# Frontend development (port 3001 in dev)
cd admin/frontend
npm run dev              # Vite dev server on :3001
npm run build            # TypeScript + Vite build to dist/

# E2E tests (Playwright)
npx playwright test                   # Runs against localhost:3001, test dir: ./e2e
```

## Architecture

```
localhost:3000 (nginx — single entry point)
├── /api/*          → Express Backend (Admin REST API)
├── /mcp/:id        → Express Backend (MCP Streamable HTTP + SSE)
├── /health         → Express Backend (health check)
└── /*              → React SPA (static files)
        │
        ▼
Express Backend (internal, no host port)
├── /api/*          Admin REST API (databases, cubes, catalog, query, chat)
├── /mcp/:databaseId  MCP HTTP streaming (sessions per database)
└── /health
        │
        ▼
Cube.js (internal, no host port — Docker healthcheck)
        │
        ▼
Databases (PostgreSQL, MySQL, BigQuery, Snowflake, Redshift, ClickHouse)
```

### Key source directories

- `src/mcp/` — MCP server (HTTP+STDIO transports) and per-database handler with 3 tools: `catalog_search`, `catalog_describe`, `query_semantic`
- `src/admin/routes/` — Express REST endpoints (databases, database, cubes, catalog, query, chat, mcp)
- `src/admin/services/` — Database connection, catalog YAML I/O, cube YAML generation, LLM enhancement
- `src/registry/` — Multi-database lifecycle management. SQLite store with AES-256-GCM credential encryption. Exports `data/cube-connections.json` for Cube.js driverFactory
- `src/catalog/` — Fuse.js-powered semantic catalog index. Merges Cube.js metadata with governance overrides from `agent_catalog.yaml`
- `src/policy/` — Query governance: validates members exist/exposed/not-PII, enforces limits, applies default segments/filters, checks groupBy restrictions
- `src/query/` — Query execution: policy enforcement → Cube.js API call → audit log
- `src/cube/` — Cube.js API client with multi-tenant JWT (includes `databaseId` in payload)
- `cube/cube.js` — Cube.js multi-tenant config: `driverFactory`, `contextToAppId`, `contextToOrchestratorId`, `repositoryFactory`
- `admin/frontend/src/` — React app: pages (Databases, Tables, Governance, Playground, Chat, MCP), components, DatabaseContext

### Multi-tenant database routing

1. Backend generates JWT with `databaseId` in payload for every Cube.js API call
2. `cube/cube.js` uses `contextToAppId` (schema cache isolation) and `contextToOrchestratorId` (driver cache isolation) keyed by `databaseId`
3. `driverFactory` reads `data/cube-connections.json` to select the correct database driver per tenant
4. `repositoryFactory` points to `data/databases/{databaseId}/cube/model/` for per-database cube schemas
5. **Critical**: `contextToOrchestratorId` is required — without it all tenants share one driver and queries hit the wrong database

### Per-database data layout

```
data/
├── config.db                          # SQLite registry (all database configs)
├── cube-connections.json              # Exported for Cube.js driverFactory
└── databases/{id}/
    ├── agent_catalog.yaml             # Governance overrides (exposed, pii, allowedGroupBy)
    └── cube/model/cubes/*.yaml        # Cube definitions
```

### AI chat integration

`POST /api/chat?database=id` uses Vercel AI SDK v6 `streamText()` with Claude Sonnet 4.5. Creates an MCP HTTP client to the local `/mcp/:databaseId` endpoint so Claude can call `catalog_search`, `catalog_describe`, and `query_semantic` tools. Max 25 agentic steps per request.

## Configuration

Copy `.env.example` to `.env`. Key variables:
- `CUBE_JWT_SECRET` (required, 32+ chars) — JWT signing secret shared with Cube.js
- `ANTHROPIC_API_KEY` — Required for chat and LLM-enhanced cube generation
- `ADMIN_SECRET` (optional, 32+ chars) — Enables AES-256-GCM encryption of stored database credentials
- `DATA_DIR` — Base data directory (default `./data`, resolved relative to project root)
- `MCP_HTTP_ENABLED` / `MCP_STDIO_ENABLED` — Transport toggles (HTTP for web, STDIO for Claude Desktop)

## TypeScript

- ESM modules (`"type": "module"` in package.json)
- `NodeNext` module resolution — use `.js` extensions in imports
- Strict mode enabled
- Zod for runtime validation of config and API inputs
