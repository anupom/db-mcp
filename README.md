# DB-MCP

Give AI assistants governed access to your databases through the [Model Context Protocol](https://modelcontextprotocol.io). Connect any supported database, define governance rules, and let AI query your data safely.

## Quick Start

```bash
git clone https://github.com/syam/db-mcp.git
cd db-mcp
docker compose up
```

Open [http://localhost:3000](http://localhost:3000) and click **Try with Demo Data** to set up the sample e-commerce database.

## What You Can Do

- **Search** your data catalog to discover available measures and dimensions
- **Query** data with automatic governance enforcement (PII blocking, row limits, access controls)
- **Manage** multiple database connections from the admin dashboard
- **Configure** per-member governance rules (exposure, PII flags, group-by restrictions)
- **Chat** with your data using the built-in AI assistant

## Connect to AI Assistants

After setup, your MCP endpoint is available at `http://localhost:3000/mcp/default`.

**Claude Desktop** — Add to Settings > MCP Servers:

```json
{
  "mcpServers": {
    "db-mcp": {
      "url": "http://localhost:3000/mcp/default"
    }
  }
}
```

**Cursor / Other MCP Clients** — Point to `http://localhost:3000/mcp/default` as an HTTP MCP endpoint.

## Supported Databases

PostgreSQL, MySQL, BigQuery, Snowflake, Redshift, ClickHouse

## MCP Tools

| Tool | Description |
|------|-------------|
| `catalog_search` | Search for measures, dimensions, and segments with fuzzy matching |
| `catalog_describe` | Get detailed member information including governance status |
| `query_semantic` | Execute governed queries against the semantic layer |

## Governance

Define per-database rules in the admin UI or `agent_catalog.yaml`:

- **PII Protection** — Mark sensitive fields to block them from all queries
- **Member Exposure** — Control which measures and dimensions are queryable
- **Query Limits** — Enforce maximum row counts per query
- **Group-by Restrictions** — Limit which dimensions can be used for grouping
- **Default Filters** — Automatically apply security filters (e.g., tenant isolation) to all queries

## Configuration

For Docker, the only optional configuration is via environment variables passed to `docker compose`:

| Variable | Purpose |
|----------|---------|
| `ANTHROPIC_API_KEY` | Enable AI chat and LLM-enhanced cube generation |
| `ADMIN_SECRET` | Encrypt stored database credentials (min 32 chars) |

Set these in your shell or a `.env` file before running `docker compose up`.

## Local Development

For contributors working on db-mcp itself:

```bash
# Start infrastructure with exposed ports
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d postgres cube

# Install dependencies
npm install

# Copy and edit env file
cp .env.example .env

# Start backend (port 3000)
npm run dev

# Start frontend (port 3001, in another terminal)
cd admin/frontend && npm install && npm run dev
```

```bash
npm run test             # Run tests
npm run lint             # Lint
npm run build            # Build for production
npx playwright test      # E2E tests
```

## Architecture

See [docs/architecture.md](docs/architecture.md) for detailed architecture, API reference, multi-tenant configuration, and troubleshooting.

```
localhost:3000 (nginx)
├── /api/*          Admin REST API
├── /mcp/:id        MCP endpoints (Streamable HTTP + SSE)
├── /health         Health check
└── /*              Admin UI (React SPA)
        │
        ▼
    Express Backend (internal)
        │
        ▼
    Semantic Layer (internal)
        │
        ▼
    Your Databases
```

## License

MIT
