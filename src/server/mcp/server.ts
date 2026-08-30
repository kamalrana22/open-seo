import { McpServer } from "@modelcontextprotocol/server";
import { createMcpToolContext, type McpProps } from "@/server/mcp/context";
import { objectSchema } from "@/server/mcp/output-schemas";
import { instrumentMcpToolHandler } from "@/server/mcp/instrumentation";
import {
  type AnyOpenSeoTool,
  TOOL_REGISTRY,
} from "@/server/mcp/tool-definition";

function registerOpenSeoTool(
  server: McpServer,
  tool: AnyOpenSeoTool,
  authProps: McpProps,
) {
  const outputSchema = objectSchema(tool.config.outputSchema);
  const handler = instrumentMcpToolHandler(
    tool.name,
    outputSchema,
    tool.handler,
  );

  server.registerTool(
    tool.name,
    {
      ...tool.config,
      inputSchema: objectSchema(tool.config.inputSchema),
      outputSchema,
    },
    (args, context) => {
      return handler(
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- args were validated against the tool's own inputSchema just above
        args as never,
        createMcpToolContext(context, authProps),
      );
    },
  );
}

export function createOpenSeoMcpServer(authProps: McpProps) {
  const server = new McpServer(
    {
      name: "OpenSEO MCP",
      title: "OpenSEO",
      version: "0.0.12",
      description:
        "SEO research tools for AI agents: keyword research and metrics, SERP and local SERP results, domain and backlink analysis, rank tracking, and Google Search Console performance.",
      websiteUrl: "https://openseo.so",
      icons: [
        {
          src: "https://openseo.so/android-chrome-512x512.png",
          mimeType: "image/png",
          sizes: ["512x512"],
        },
      ],
    },
    {
      instructions:
        "OpenSEO research tools use credits. Proceed with normal focused research, but ask the user for confirmation before planned batches over 2,000 credits.",
    },
  );

  for (const { tool } of TOOL_REGISTRY) {
    registerOpenSeoTool(server, tool, authProps);
  }

  return server;
}
