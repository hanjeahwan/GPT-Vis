# GPT-Vis MCP Server

An MCP (Model Context Protocol) server for querying GPT-Vis chart knowledge files.

## Features

- **gpt_vis_get_knowledge**: Query knowledge files by chart type and retrieve markdown content
- **gpt_vis_list_chart_types**: List all available chart types supported by GPT-Vis

## Installation

```bash
cd mcp-server
pnpm install
pnpm run build
```

## Usage

### Run via stdio (for Claude Desktop, Cursor, etc.)

```bash
node dist/index.js
```

### Configure in Claude Desktop

Add to your Claude Desktop config (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "gpt-vis": {
      "command": "node",
      "args": ["<path-to>/mcp-server/dist/index.js"]
    }
  }
}
```

## Available Tools

### gpt_vis_get_knowledge

Query chart knowledge by type.

**Parameters:**

- `chartType` (required): The chart type to query (e.g., 'radar', 'line', 'pie')
- `section` (optional): Which section to return
  - `all` - Full content (default)
  - `properties` - Chart properties
  - `concept` - Basic concept
  - `usage` - Usage guide with TypeScript types
  - `examples` - Usage examples with JSON code

**Example:**

```json
{
  "chartType": "radar",
  "section": "usage"
}
```

### gpt_vis_list_chart_types

List all available chart types.

**Parameters:**

- `category` (optional): Filter by category
  - `all` - All chart types (default)
  - `statistics` - Statistical charts
  - `relationship` - Relationship charts
  - `map` - Map charts

**Example:**

```json
{
  "category": "statistics"
}
```

## Supported Chart Types

- **Statistical Charts**: line, column, bar, pie, area, scatter, radar, histogram, boxplot, violin, wordcloud, funnel, treemap, sankey, dual-axes, liquid, venn
- **Relationship Charts**: network-graph, mind-map, flow-diagram, organization-chart, fishbone-diagram
- **Map Charts**: pin-map, heat-map
- **Others**: table, vis-text
