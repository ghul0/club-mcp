import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type { GetClient } from '@hhc-mcp/core';
import { type StdioConfig } from './env.js';
import { type Logger } from './logger.js';
import { callTool, listToolDefinitions } from './tools.js';

export type ServerDeps = {
  readonly config: StdioConfig;
  readonly client: GetClient;
  readonly logger: Logger;
};

const SERVER_NAME = 'hhc-mcp';
const SERVER_VERSION = '0.0.1';

export const createMcpServer = (deps: ServerDeps): McpServer => {
  const mcp = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { tools: {} } },
  );

  mcp.server.setRequestHandler(ListToolsRequestSchema, () => {
    const defs = listToolDefinitions();
    deps.logger.debug('tools/list', { count: defs.length });
    return Promise.resolve({
      tools: defs.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
        annotations: t.annotations,
      })),
    });
  });

  mcp.server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const name = req.params.name;
    deps.logger.debug('tools/call', { name });
    const result = await callTool({ client: deps.client }, name, req.params.arguments ?? {});
    return result;
  });

  return mcp;
};

export const runStdioServer = async (deps: ServerDeps): Promise<void> => {
  const server = createMcpServer(deps);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  deps.logger.info('stdio server connected', { name: SERVER_NAME, version: SERVER_VERSION });
};
