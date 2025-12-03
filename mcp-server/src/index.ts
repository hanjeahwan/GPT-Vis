#!/usr/bin/env node
/**
 * GPT-Vis Knowledge MCP Server
 *
 * This server provides tools to query GPT-Vis chart knowledge files
 * and list available chart types supported by the system.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { z } from 'zod';

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Constants
const KNOWLEDGES_DIR = path.resolve(__dirname, '../../knowledges');

// Chart type mapping: JSON type value -> file info
interface ChartTypeInfo {
  type: string; // JSON type value (e.g., 'radar', 'line')
  chineseName: string; // Chinese name (e.g., '雷达图')
  englishName: string; // English name (e.g., 'Radar Chart')
  fileName: string; // File name
  category: string; // Category (统计图表, 关系图, 地图)
  functions: string[]; // Functions (比较, 趋势, etc.)
}

// Extract chart type info from file content
function extractChartTypeFromContent(content: string, fileName: string): ChartTypeInfo | null {
  // Try to find the type value from TypeScript type definition
  const typeMatch = content.match(/type:\s*['"]([a-z-]+)['"]/);
  const typeValue = typeMatch ? typeMatch[1] : null;

  // Extract Chinese name
  const chineseNameMatch = content.match(/名称：([^\n]+)/);
  const chineseName = chineseNameMatch ? chineseNameMatch[1].trim() : '';

  // Extract English name from aliases
  const englishNameMatch = content.match(/英文名[：:]\s*([A-Za-z\s]+)/);
  const englishName = englishNameMatch ? englishNameMatch[1].trim() : '';

  // Extract category
  const categoryMatch = content.match(/图表类别：([^\n]+)/);
  const category = categoryMatch ? categoryMatch[1].trim() : '';

  // Extract functions
  const functionsMatch = content.match(/图表功能：([^\n]+)/);
  const functions = functionsMatch
    ? functionsMatch[1]
        .split(/[、,，]/)
        .map((f) => f.trim())
        .filter(Boolean)
    : [];

  if (!typeValue) {
    return null;
  }

  return {
    type: typeValue,
    chineseName,
    englishName,
    fileName,
    category,
    functions,
  };
}

// Load all knowledge files and build chart type index
async function loadKnowledgeFiles(): Promise<
  Map<string, { info: ChartTypeInfo; content: string }>
> {
  const chartIndex = new Map<string, { info: ChartTypeInfo; content: string }>();

  try {
    const files = await fs.readdir(KNOWLEDGES_DIR);

    for (const file of files) {
      if (file.endsWith('.md') && file !== '知识库总览.md') {
        const filePath = path.join(KNOWLEDGES_DIR, file);
        const content = await fs.readFile(filePath, 'utf-8');
        const info = extractChartTypeFromContent(content, file);

        if (info) {
          chartIndex.set(info.type, { info, content });
        }
      }
    }
  } catch (error) {
    console.error(`Error loading knowledge files: ${error}`);
  }

  return chartIndex;
}

// Initialize chart index
let chartIndex: Map<string, { info: ChartTypeInfo; content: string }>;

// Create MCP server instance
const server = new McpServer({
  name: 'gpt-vis-mcp-server',
  version: '1.0.0',
});

// Zod schemas for input validation
const GetKnowledgeInputSchema = z
  .object({
    chartType: z
      .enum([
        'line',
        'column',
        'bar',
        'pie',
        'area',
        'scatter',
        'radar',
        'histogram',
        'boxplot',
        'violin',
        'wordcloud',
        'funnel',
        'treemap',
        'sankey',
        'dualaxes',
        'liquid',
        'venn',
        'network-graph',
        'mind-map',
        'flow-diagram',
        'organization-chart',
        'fishbone',
        'pin-map',
        'heat-map',
        'table',
        'vis-text',
      ])
      .describe(
        "The chart type to query (e.g., 'radar', 'line', 'pie', 'bar', 'column', 'area', 'scatter', 'funnel', 'treemap', 'wordcloud', 'sankey', 'network-graph', 'mind-map', 'flow-diagram', 'organization-chart', 'fishbone', 'histogram', 'boxplot', 'violin', 'venn', 'liquid', 'dualaxes', 'pin-map', 'heat-map', 'table', 'vis-text')",
      ),
    section: z
      .enum(['all', 'properties', 'concept', 'usage', 'examples'])
      .default('all')
      .describe(
        "Which section of the knowledge to return: 'all' for full content, 'properties' for chart properties, 'concept' for basic concept, 'usage' for usage guide, 'examples' for examples",
      ),
  })
  .strict();

type GetKnowledgeInput = z.infer<typeof GetKnowledgeInputSchema>;

const ListChartTypesInputSchema = z
  .object({
    category: z
      .enum(['all', 'statistics', 'relationship', 'map'])
      .default('all')
      .describe(
        "Filter by category: 'all' for all types, 'statistics' for statistical charts, 'relationship' for relationship charts, 'map' for map charts",
      ),
  })
  .strict();

type ListChartTypesInput = z.infer<typeof ListChartTypesInputSchema>;

// Extract specific section from content
function extractSection(content: string, section: string): string {
  if (section === 'all') {
    return content;
  }

  // Define section headers and their corresponding patterns
  const sectionHeaders: Record<string, string> = {
    properties: '## 图表属性',
    concept: '## 基础概念',
    usage: '## 图表用法',
    examples: '## 使用示例',
  };

  const header = sectionHeaders[section];
  if (!header) {
    return content;
  }

  // Find the start of the section
  const startIndex = content.indexOf(header);
  if (startIndex === -1) {
    return `Section "${section}" not found in this knowledge file.`;
  }

  // Find the next section header (## ) or end of content
  const afterHeader = content.slice(startIndex + header.length);
  const nextHeaderMatch = afterHeader.match(/\n## [^#]/);

  let sectionContent: string;
  if (nextHeaderMatch && nextHeaderMatch.index !== undefined) {
    sectionContent = header + afterHeader.slice(0, nextHeaderMatch.index);
  } else {
    sectionContent = header + afterHeader;
  }

  return sectionContent.trim();
}

// Category mapping
const categoryMapping: Record<string, string[]> = {
  statistics: ['统计图表', '组合图表'],
  relationship: ['关系图'],
  map: ['地图'],
};

// Register get_knowledge tool
server.registerTool(
  'get_chart_knowledge',
  {
    title: 'Get Chart Knowledge',
    description: `Query GPT-Vis knowledge files by chart type and retrieve the markdown content.

Returns chart documentation including properties, concepts, TypeScript types, data requirements, and usage examples.

Examples:
  - chartType="pie", section="examples"
  - chartType="line", section="usage"`,
    inputSchema: GetKnowledgeInputSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async (params: GetKnowledgeInput) => {
    try {
      // Ensure chart index is loaded
      if (!chartIndex) {
        chartIndex = await loadKnowledgeFiles();
      }

      const normalizedType = params.chartType.toLowerCase().trim();
      const chartData = chartIndex.get(normalizedType);

      if (!chartData) {
        // Try to find by partial match or alias
        let foundType: string | null = null;
        for (const [type, data] of chartIndex.entries()) {
          if (
            type.includes(normalizedType) ||
            data.info.englishName.toLowerCase().includes(normalizedType) ||
            data.info.chineseName.includes(normalizedType)
          ) {
            foundType = type;
            break;
          }
        }

        if (foundType) {
          const data = chartIndex.get(foundType)!;
          const sectionContent = extractSection(data.content, params.section);
          return {
            content: [
              {
                type: 'text',
                text: `# ${data.info.chineseName} - ${data.info.englishName}\n\n${sectionContent}`,
              },
            ],
          };
        }

        const availableTypes = Array.from(chartIndex.keys()).sort().join(', ');
        return {
          content: [
            {
              type: 'text',
              text: `Error: Chart type "${params.chartType}" not found.

Available chart types:
${availableTypes}

Try using one of these exact type values.`,
            },
          ],
        };
      }

      const sectionContent = extractSection(chartData.content, params.section);

      const output = {
        chartType: chartData.info.type,
        chineseName: chartData.info.chineseName,
        englishName: chartData.info.englishName,
        category: chartData.info.category,
        functions: chartData.info.functions,
        section: params.section,
        content: sectionContent,
      };

      return {
        content: [
          {
            type: 'text',
            text: `# ${chartData.info.chineseName} - ${chartData.info.englishName}

**Category:** ${chartData.info.category}
**Functions:** ${chartData.info.functions.join(', ')}

---

${sectionContent}`,
          },
        ],
        structuredContent: output,
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: Failed to query knowledge - ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
      };
    }
  },
);

// Register list_chart_types tool
server.registerTool(
  'get_all_chart_types',
  {
    title: 'List Available Chart Types',
    description: `List all available chart types supported by GPT-Vis.

Returns a list of chart types with their names, categories, and supported functions.`,
    inputSchema: ListChartTypesInputSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async (params: ListChartTypesInput) => {
    try {
      // Ensure chart index is loaded
      if (!chartIndex) {
        chartIndex = await loadKnowledgeFiles();
      }

      let chartTypes: ChartTypeInfo[] = [];

      for (const [_, data] of chartIndex.entries()) {
        if (params.category === 'all') {
          chartTypes.push(data.info);
        } else {
          const categoryFilters = categoryMapping[params.category] || [];
          if (categoryFilters.some((cat) => data.info.category.includes(cat))) {
            chartTypes.push(data.info);
          }
        }
      }

      // Sort by type name
      chartTypes.sort((a, b) => a.type.localeCompare(b.type));

      if (chartTypes.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: `No chart types found for category: ${params.category}`,
            },
          ],
        };
      }

      // Format as markdown table
      const lines = [
        `# Available Chart Types`,
        ``,
        `**Category Filter:** ${params.category}`,
        `**Total:** ${chartTypes.length} chart types`,
        ``,
        `| Type | Chinese Name | English Name | Category | Functions |`,
        `|------|--------------|--------------|----------|-----------|`,
      ];

      for (const chart of chartTypes) {
        lines.push(
          `| \`${chart.type}\` | ${chart.chineseName} | ${chart.englishName} | ${chart.category} | ${chart.functions.join(', ')} |`,
        );
      }

      const output = {
        category: params.category,
        total: chartTypes.length,
        chartTypes: chartTypes.map((ct) => ({
          type: ct.type,
          chineseName: ct.chineseName,
          englishName: ct.englishName,
          category: ct.category,
          functions: ct.functions,
        })),
      };

      return {
        content: [
          {
            type: 'text',
            text: lines.join('\n'),
          },
        ],
        structuredContent: output,
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: Failed to list chart types - ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
      };
    }
  },
);

// Main function
async function main() {
  // Pre-load chart index
  console.error('Loading knowledge files...');
  chartIndex = await loadKnowledgeFiles();
  console.error(`Loaded ${chartIndex.size} chart types from knowledge files.`);

  // Start server with stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('GPT-Vis MCP server running via stdio');
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});
