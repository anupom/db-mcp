# DB-MCP

Give AI assistants governed access to your databases through the [Model Context Protocol](https://modelcontextprotocol.io). Connect any supported database, define governance rules, and let AI query your data safely.

**Supported databases:** PostgreSQL, MySQL, BigQuery, Snowflake, Redshift, ClickHouse

## Quick Start

### Demo Data (try it in 2 minutes)

```bash
git clone https://github.com/syam/db-mcp.git
cd db-mcp
docker compose up
```

1. Open [http://localhost:3000](http://localhost:3000) and click **Try with Demo Data**
2. The demo sets up a sample e-commerce database with cubes and governance rules pre-configured
3. Your MCP endpoint is live at `http://localhost:3000/mcp/default`

Add to Claude Desktop (Settings > MCP Servers):

```json
{
  "mcpServers": {
    "db-mcp": {
      "url": "http://localhost:3000/mcp/default"
    }
  }
}
```

### Your Own Database

```bash
git clone https://github.com/syam/db-mcp.git
cd db-mcp
cp .env.example .env   # optionally set ANTHROPIC_API_KEY for AI chat
docker compose up
```

1. Open [http://localhost:3000](http://localhost:3000) and click **Add Database**
2. Fill in the connection form and click **Test Connection** to verify
3. **Generate cubes** — go to the **Tables** page, click **Generate All Cubes** (or generate per-table). This creates the YAML definitions that tell the semantic layer what's queryable.
4. **Configure governance** (optional) — go to the **Governance** page to mark PII fields, control member exposure, and set query restrictions
5. Your MCP endpoint is live at `http://localhost:3000/mcp/{your-database-id}`

> **Important:** Without generating cubes (step 3), MCP tools will return no data. The semantic layer automatically picks up new and changed cube files — no restart needed.

## How It Works

```
Your Database → Cube Definitions (YAML) → Semantic Layer → Governance Rules → MCP Tools → AI Assistant
```

- **Cube definitions** map your database tables into queryable measures and dimensions
- **Governance rules** control which members AI can access (PII blocking, exposure, query limits)
- **MCP tools** expose the governed semantic layer to any MCP-compatible AI assistant

## Cube Definitions

Cubes are YAML files that define what AI can query. Each cube maps a database table to typed measures (aggregations) and dimensions (attributes).

**Location:** `data/databases/{id}/cube/model/cubes/*.yml`

**How to create:** Use the **Tables** page in the admin UI and click **Generate All Cubes**. If you have `ANTHROPIC_API_KEY` set, the generator will add rich descriptions to help AI understand your data. You can also write cube YAML manually.

**Example:**

```yaml
cubes:
  - name: orders
    sql_table: orders
    measures:
      - name: count
        type: count
      - name: total_amount
        type: sum
        sql: "{CUBE}.amount"
    dimensions:
      - name: status
        sql: "{CUBE}.status"
        type: string
      - name: created_at
        sql: "{CUBE}.created_at"
        type: time
```

**Supported measure types:** `count`, `sum`, `avg`, `min`, `max`, `count_distinct`

**Supported dimension types:** `string`, `number`, `time`, `boolean`

The semantic layer automatically detects new and changed cube files — no restart needed.

## Governance

Governance controls which members AI can access and how. Configure via the **Governance** page in the admin UI, or edit `data/databases/{id}/agent_catalog.yaml` directly.

**Example:**

```yaml
version: "1.0"
defaults:
  exposed: true
  pii: false
members:
  Users.email:
    exposed: false
    pii: true
  Orders.total_amount:
    allowedGroupBy:
      - Orders.status
      - Orders.created_at
```

**Features:**

- **PII Protection** — Mark sensitive fields to block them from all queries
- **Member Exposure** — Control which measures and dimensions are queryable
- **Query Limits** — Enforce maximum row counts per query
- **Group-by Restrictions** — Limit which dimensions can be used for grouping
- **Default Filters** — Automatically apply security filters (e.g., tenant isolation) to all queries
- **Default Segments** — Apply pre-defined segments to all queries

## Connect to AI Assistants

Each database gets its own MCP endpoint at `/mcp/{databaseId}`.

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

**Cursor / Other MCP Clients** — Point to `http://localhost:3000/mcp/{databaseId}` as an HTTP MCP endpoint.

**Built-in AI Chat** — Set `ANTHROPIC_API_KEY` in your `.env` and use the **Chat** page in the admin UI to query your data conversationally.

## MCP Tools

| Tool | Description |
|------|-------------|
| `catalog_search` | Search for measures, dimensions, and segments with fuzzy matching |
| `catalog_describe` | Get detailed member information including governance status |
| `query_semantic` | Execute governed queries against the semantic layer |

## Configuration

For Docker, set these in your `.env` file or shell before running `docker compose up`:

| Variable | Required | Purpose |
|----------|----------|---------|
| `CUBE_JWT_SECRET` | Auto-set | JWT secret shared with Cube.js (default provided in docker-compose.yml) |
| `ANTHROPIC_API_KEY` | No | Enable AI chat and LLM-enhanced cube generation |
| `ADMIN_SECRET` | No | Encrypt stored database credentials with AES-256-GCM (min 32 chars) |

Copy `.env.example` to `.env` to see all available variables.

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

See [docs/architecture.md](docs/architecture.md) for detailed architecture, API reference, and troubleshooting.

```
localhost:3000 (nginx)
├── /api/*          Admin REST API
├── /mcp/:id        MCP endpoints (Streamable HTTP + SSE)
├── /health         Health check
└── /*              Admin UI (React SPA)
        │
        ▼
    Express Backend
        │
        ▼
    Semantic Layer (Cube.js)
        │
        ▼
    Your Databases
```

## License

MIT
