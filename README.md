# DB-MCP

A Model Context Protocol (MCP) server that provides governed semantic analytics queries through Cube.js with multi-database support.

## What is this?

DB-MCP acts as a bridge between AI assistants and your data warehouse, enabling natural language queries while enforcing governance policies. It exposes your Cube.js semantic layer as MCP tools that AI models can use safely.

## Key Features

- **Multi-Database Support**: Register and manage multiple database connections (PostgreSQL, MySQL, BigQuery, Snowflake, Redshift, ClickHouse)
- **Auto-Initialization**: Default database created automatically from environment variables on first startup
- **Per-Database Governance**: Each database has its own catalog, cube definitions, and policies
- **MCP Protocol**: Streamable HTTP and STDIO transport for AI assistant integration
- **Admin UI**: React dashboard for database, cube, and governance management
- **Semantic Catalog**: Full-text fuzzy search powered by Fuse.js for discovering measures, dimensions, and segments
- **Governance & PII Protection**: Block sensitive data, enforce query limits, and control member exposure
- **Query Validation**: Validate queries against governance rules before execution
- **Default Segments & Filters**: Automatically apply security filters to all queries
- **LLM-Enhanced Cube Generation**: AI-powered enhancement of cube definitions with better descriptions and inferred relationships
- **Audit Logging**: Track all catalog searches and query executions
- **Chat Interface**: AI-powered natural language interface for data exploration

## Use Cases & Capabilities

### MCP Tools

DB-MCP exposes three tools via the Model Context Protocol:

| Tool | Description |
|------|-------------|
| `catalog.search` | Search for measures, dimensions, segments with fuzzy matching |
| `catalog.describe` | Get detailed member information including governance status |
| `query.semantic` | Execute governed queries against the Cube.js semantic layer |

### What You Can Do

- **Discover Data**: Search the semantic catalog to find available measures and dimensions
- **Explore Relationships**: Understand how cubes relate through describe operations
- **Query with Governance**: Execute queries that automatically enforce PII blocking, limits, and access controls
- **Manage Multiple Databases**: Register, activate, and switch between database connections
- **Configure Governance**: Set up per-member exposure, PII flags, and group-by restrictions
- **Generate Cubes**: Create Cube.js definitions from database tables with LLM enhancement

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Admin UI (React + nginx)                        │
│                        http://localhost:3001                        │
│                   Proxies /api/* to db-mcp:3000                     │
└─────────────────────────────────┬───────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    DB-MCP Server (Express)                           │
│                      http://localhost:3000                           │
│                                                                      │
│  Admin API                           MCP Endpoints                   │
│  /api/databases                      /mcp/:databaseId                │
│  /api/database/tables                  (Streamable HTTP)             │
│  /api/cubes                                                          │
│  /api/catalog                                                        │
│  /api/query                                                          │
│  /api/chat                                                           │
│                                                                      │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                    Database Registry                           │  │
│  │           (SQLite: data/config.db + Manager)                   │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌─────────────────┐    ┌─────────────────────────────────────────┐ │
│  │  Per-Database    │───▶│  Per-Database Resources:                │ │
│  │  MCP Handlers    │    │  • data/databases/{id}/agent_catalog.yaml│
│  └─────────────────┘    │  • data/databases/{id}/cube/model/cubes/ │
│                         └─────────────────────────────────────────┘ │
└──────────────────────────────────┬──────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│   PostgreSQL (5434)              │           Cube.js (4000)         │
│                                  │                                   │
│   + Any registered databases     │   Multi-tenant driver routing     │
│     (Neon, MySQL, BigQuery...)   │   via JWT securityContext         │
└─────────────────────────────────────────────────────────────────────┘
```

### Technology Stack

| Component | Technology |
|-----------|------------|
| MCP Server | Node.js + TypeScript + @modelcontextprotocol/sdk |
| Catalog Search | Fuse.js (fuzzy search) |
| Query Validation | Zod |
| Admin API | Express |
| Admin UI | React + Vite |
| Database Registry | SQLite (better-sqlite3) |
| Semantic Layer | Cube.js |
| AI Integration | Anthropic Claude + Vercel AI SDK |

### Data Flow

1. **AI Assistant** → Connects via MCP (Streamable HTTP or STDIO)
2. **MCP Server** → Loads database-specific configuration from registry
3. **Catalog Index** → Fetches Cube.js metadata + applies governance from `agent_catalog.yaml`
4. **Policy Enforcer** → Validates queries against limits, PII rules, and member exposure
5. **Query Semantic** → Executes validated queries through Cube.js API
6. **Cube.js** → Translates semantic queries to SQL and executes against database

## Supported Databases

| Database | Type | Required Fields |
|----------|------|-----------------|
| PostgreSQL | `postgres` | host, port, database, user, password |
| MySQL | `mysql` | host, port, database, user, password |
| Amazon Redshift | `redshift` | host, port, database, user, password |
| ClickHouse | `clickhouse` | host, port, database, user, password |
| Google BigQuery | `bigquery` | projectId |
| Snowflake | `snowflake` | account, warehouse, database, user, password |

## Components

### MCP Server (`/src`)
- **Tools exposed via MCP:**
  - `catalog.search` - Search available measures, dimensions, segments
  - `catalog.describe` - Get details about a specific member
  - `query.semantic` - Execute governed queries against the semantic layer

- **Registry** (`/src/registry`) - Multi-database configuration management
- **Governance** (`/src/policy`) - Enforces limits, blocks PII, validates members
- **Catalog** (`/src/catalog`) - Indexes Cube metadata with fuzzy search
- **Query** (`/src/query`) - Executes validated queries through Cube.js

### Admin UI (`/admin`)
- **Backend** (`/src/admin`) - Express API for management
- **Frontend** (`/admin/frontend`) - React admin dashboard

### Data Directory (`/data`)
```
data/
├── config.db                      # Database registry (SQLite)
├── cube-connections.json           # Exported connections for Cube.js driverFactory
└── databases/
    └── {database-id}/
        ├── agent_catalog.yaml     # Governance rules
        └── cube/model/cubes/      # Cube definitions (YAML)
```

## Quick Start

### Docker (recommended)

```bash
# Start everything (Postgres, Cube.js, DB-MCP server, Admin UI)
docker-compose up -d
```

This starts:
- **PostgreSQL** on port 5434 (mapped from 5432 in container)
- **Cube.js** on port 4000
- **DB-MCP server** on port 3000 (Admin API + MCP endpoints)
- **Admin UI** on port 3001 (nginx proxy to DB-MCP)

### Local Development

```bash
# Start infrastructure only
docker-compose up -d postgres cube

# Install dependencies
npm install

# Copy env template and configure (edit .env to add ANTHROPIC_API_KEY, etc.)
cp .env.example .env

# Start DB-MCP server in dev mode (port 3000)
npm run dev

# In another terminal: start admin frontend (port 3001)
cd admin/frontend && npm install && npm run dev
```

The `.env` file is loaded automatically via `dotenv`. In Docker, environment variables come from `docker-compose.yml` instead.

## MCP Tools Reference

### catalog.search

Search the data catalog for available measures, dimensions, and segments.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | Yes | Search query for finding members |
| `types` | array | No | Filter by types: `measure`, `dimension`, `segment`, `timeDimension` |
| `cubes` | array | No | Filter by cube names |
| `limit` | number | No | Max results (default: 10, max: 50) |

**Example Request:**
```json
{
  "query": "revenue",
  "types": ["measure"],
  "limit": 5
}
```

**Example Response:**
```json
{
  "results": [
    {
      "name": "Orders.total_amount",
      "type": "measure",
      "title": "Total Amount",
      "description": "Total revenue from orders",
      "cube": "Orders",
      "score": 0.95
    }
  ],
  "count": 1
}
```

### catalog.describe

Get detailed information about a specific member.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `member` | string | Yes | Full member name (e.g., `Orders.count`) |

**Example Response:**
```json
{
  "member": {
    "name": "Orders.count",
    "type": "measure",
    "title": "Count",
    "description": "Total number of orders",
    "cube": "Orders",
    "exposed": true,
    "pii": false,
    "allowedGroupBy": ["Orders.status", "Orders.created_at"]
  },
  "relatedMembers": [
    { "name": "Orders.status", "type": "dimension", "relationship": "same_cube" }
  ]
}
```

### query.semantic

Execute a governed semantic query against the data warehouse.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `measures` | array | No | Measures to query |
| `dimensions` | array | No | Dimensions for grouping |
| `timeDimensions` | array | No | Time dimensions with granularity and date range |
| `filters` | array | No | Filter conditions |
| `segments` | array | No | Segments to apply |
| `order` | object/array | No | Sort order |
| `limit` | number | **Yes** | Maximum rows (required, max: configurable) |
| `offset` | number | No | Rows to skip |

**Example Request:**
```json
{
  "measures": ["Orders.count", "Orders.total_amount"],
  "dimensions": ["Orders.status"],
  "timeDimensions": [{
    "dimension": "Orders.created_at",
    "granularity": "month",
    "dateRange": "last 6 months"
  }],
  "limit": 100
}
```

## Governance Configuration

Governance rules are defined per-database in `agent_catalog.yaml`.

### Example Configuration

```yaml
version: "1.0"

# Default settings for all members
defaults:
  exposed: true    # Members are queryable by default
  pii: false       # Members are not PII by default

# Per-member overrides
members:
  Users.email:
    exposed: false
    pii: true
    description: "User email address (PII - not available for querying)"

  Users.name:
    exposed: false
    pii: true
    description: "User full name (PII - not available for querying)"

  Orders.total_amount:
    description: "Total revenue from orders"
    allowedGroupBy:
      - Orders.status
      - Orders.created_at
      - Products.category

  Orders.count:
    description: "Total number of orders"
    requiresTimeDimension: false

# Applied to all queries automatically
defaultSegments: []

# Applied to all queries automatically
defaultFilters: []
```

### Member Override Options

| Option | Type | Description |
|--------|------|-------------|
| `exposed` | boolean | Whether the member can be queried |
| `pii` | boolean | Whether the member contains sensitive data (blocks queries) |
| `description` | string | Override the member description |
| `allowedGroupBy` | array | Only allow grouping by these dimensions |
| `deniedGroupBy` | array | Never allow grouping by these dimensions |
| `requiresTimeDimension` | boolean | Require a time dimension when using this measure |

### Environment-Level Deny List

Use `DENY_MEMBERS` to block specific members across all queries:

```bash
DENY_MEMBERS=Users.email,Users.ssn,Users.phone
```

## Admin API Reference

### Database Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/databases` | List all registered databases |
| POST | `/api/databases` | Create a new database |
| GET | `/api/databases/:id` | Get database details |
| PUT | `/api/databases/:id` | Update database configuration |
| DELETE | `/api/databases/:id` | Delete a database |
| POST | `/api/databases/:id/test` | Test database connection |
| POST | `/api/databases/:id/activate` | Activate a database |
| POST | `/api/databases/:id/deactivate` | Deactivate a database |
| POST | `/api/databases/initialize-default` | Initialize default database |

### Database Tables

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/database/tables?database=id` | List tables with columns |
| GET | `/api/database/tables/:name?database=id` | Get table details |
| GET | `/api/database/tables/:name/sample?database=id` | Get sample data (10 rows) |

### Cube Definitions

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/cubes?database=id` | List cubes from Cube.js /meta |
| GET | `/api/cubes/files?database=id` | List cube YAML files |
| GET | `/api/cubes/files/:name?database=id` | Read cube YAML file |
| PUT | `/api/cubes/files/:name?database=id` | Update cube YAML |
| POST | `/api/cubes/files?database=id` | Create new cube file |
| POST | `/api/cubes/generate` | Generate YAML from config |
| POST | `/api/cubes/generate-enhanced` | Generate LLM-enhanced cube |

### Catalog & Governance

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/catalog?database=id` | Get raw catalog config |
| GET | `/api/catalog/members?database=id` | Get all members with governance |
| PUT | `/api/catalog/members/:name?database=id` | Update member governance |
| DELETE | `/api/catalog/members/:name?database=id` | Remove member override |
| PUT | `/api/catalog/defaults?database=id` | Update default settings |

### Query Execution

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/query/validate?database=id` | Validate query against rules |
| POST | `/api/query/execute?database=id` | Execute query and return results |
| POST | `/api/query/sql?database=id` | Get generated SQL for query |

### Chat Interface

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/chat?database=id` | AI chat with MCP tool integration |

### MCP Server

| Endpoint | Description |
|----------|-------------|
| `POST /mcp/:databaseId` | Streamable HTTP MCP endpoint (initialize/call) |
| `GET /mcp/:databaseId` | SSE stream for existing MCP session |
| `DELETE /mcp/:databaseId` | Close MCP session |

### Debug

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/query/debug?database=id` | Debug database routing (JWT payload, Cube status) |

## Configuration Reference

Copy `.env.example` to `.env` and configure:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `CUBE_API_URL` | Yes | `http://localhost:4000/cubejs-api/v1` | Cube.js API endpoint |
| `CUBE_JWT_SECRET` | Yes | - | JWT secret for Cube.js (min 32 chars) |
| `CUBE_JWT_EXPIRES_IN` | No | `1h` | JWT token expiration |
| `MAX_LIMIT` | No | `1000` | Maximum rows per query |
| `DEFAULT_SEGMENTS` | No | - | Comma-separated default segments |
| `DENY_MEMBERS` | No | - | Comma-separated blocked members |
| `RETURN_SQL` | No | `false` | Include SQL in query responses |
| `LOG_LEVEL` | No | `info` | Logging level |
| `AGENT_CATALOG_PATH` | No | `agent_catalog.yaml` | Path to catalog config |
| `MCP_HTTP_ENABLED` | No | `false` | Enable HTTP MCP transport |
| `MCP_HTTP_PORT` | No | `3000` | HTTP server port (serves both Admin API and MCP) |
| `MCP_HTTP_HOST` | No | `0.0.0.0` | HTTP server bind host |
| `MCP_STDIO_ENABLED` | No | `false` | Enable STDIO MCP transport |
| `DATA_DIR` | No | `./data` | Data directory path |
| `ANTHROPIC_API_KEY` | No | - | Required for chat and LLM features |
| `ADMIN_SECRET` | No | - | Secret for encrypting stored credentials (min 32 chars) |

### PostgreSQL Connection (for default database)

| Variable | Default | Description |
|----------|---------|-------------|
| `POSTGRES_HOST` | `localhost` | PostgreSQL host |
| `POSTGRES_PORT` | `5432` | PostgreSQL port |
| `POSTGRES_DB` | `ecom` | Database name |
| `POSTGRES_USER` | `cube` | Database user |
| `POSTGRES_PASSWORD` | `cube` | Database password |

## MCP Integration

### HTTP Transport (Recommended for multi-database)

Connect to specific database:
```
http://localhost:3000/mcp/default
```

### STDIO Transport (Claude Desktop)

```json
{
  "mcpServers": {
    "db-mcp": {
      "command": "node",
      "args": ["/path/to/db-mcp/dist/index.js"],
      "env": {
        "CUBE_API_URL": "http://localhost:4000/cubejs-api/v1",
        "CUBE_JWT_SECRET": "your-secret"
      }
    }
  }
}
```

## Development

```bash
# Install dependencies
npm install

# Run in development mode (with hot reload)
npm run dev

# Build for production
npm run build

# Run tests
npm run test

# Run tests in watch mode
npm run test:watch

# Lint code
npm run lint
```

## Security Features

### JWT Authentication
All queries to Cube.js are authenticated using JWT tokens generated with the configured secret. Tokens include the database ID for multi-tenant isolation.

### PII Data Protection
- Mark members as PII in `agent_catalog.yaml` to block all queries
- Use `DENY_MEMBERS` environment variable for global blocks
- PII members are automatically filtered from search results

### Query Validation
Before execution, all queries are validated for:
- Required `limit` parameter (prevents unbounded queries)
- Limit within configured maximum
- Member existence and exposure status
- PII member blocking
- Group-by restrictions (allowedGroupBy/deniedGroupBy)
- Valid query structure (only allowed keys)

### Default Security Filters
Configure `defaultSegments` and `defaultFilters` to automatically apply security filters (e.g., tenant isolation, soft deletes) to all queries.

## Multi-Tenant Cube.js Configuration

The `cube/cube.js` file configures Cube.js for multi-database routing. Three functions are critical:

| Function | Purpose |
|----------|---------|
| `contextToAppId` | Isolates **schema compilation cache** per database |
| `contextToOrchestratorId` | Isolates the **query orchestrator and driver cache** per database |
| `repositoryFactory` | Loads **per-database cube schema files** from `data/databases/{id}/cube/model` |
| `driverFactory` | Creates the correct **database driver** based on `securityContext.databaseId` |

**Important**: `contextToOrchestratorId` is required for multi-database query isolation. Without it, all databases share the same driver cache and queries will hit the wrong database. After changes to `cube/cube.js`, restart Cube.js:

```bash
docker compose restart cube
```

## Troubleshooting

### Common Issues

**MCP connection fails**
- Ensure `MCP_HTTP_ENABLED=true` is set
- Check that port 3000 is not in use
- Verify the database exists and is activated

**Cube.js metadata not loading**
- Verify `CUBE_API_URL` is correct
- Check `CUBE_JWT_SECRET` is at least 32 characters
- Ensure Cube.js is running and accessible

**Queries return wrong data for a database**
- This is usually caused by missing `contextToOrchestratorId` in `cube/cube.js`
- Use the debug endpoint: `GET /api/query/debug?database=<id>` to verify JWT payload and schema
- Use the SQL endpoint: `POST /api/query/sql?database=<id>` to inspect the `dataSource` field
- Restart Cube.js after config changes: `docker compose restart cube`

**Query blocked by governance**
- Check if member is marked as `pii: true`
- Verify member is `exposed: true`
- Check `DENY_MEMBERS` environment variable
- Review `allowedGroupBy` restrictions

**Chat not working**
- Ensure `ANTHROPIC_API_KEY` is set
- Verify the MCP server is running

## License

MIT
