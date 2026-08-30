import { tool, type Tool, type ToolSet } from "ai";
import { z } from "zod";
import { withPgClient } from "@/db";
import type { CallToolResult } from "@modelcontextprotocol/server";
import { type ToolAuthContext, type ToolContext } from "@/server/mcp/context";
import { instrumentMcpToolHandler } from "@/server/mcp/instrumentation";
import {
  type AnyOpenSeoTool,
  TOOL_REGISTRY,
  toolInputShape,
} from "@/server/mcp/tool-definition";
import { buildUpdateProjectContextTool } from "@/server/mcp/tools/project-context";
import { getAuditStatusTool } from "@/server/mcp/tools/site-audit-tools";
import { discoverSiteUrls, readPages, readSite } from "@/server/lib/scrape";
import openSeoFactSheet from "@/server/features/onboarding/openseo-fact-sheet.md?raw";

// SAM reads more of a site than the onboarding preview: enough pages to work
// out what a business does, sells, and positions against on its own.
const SAM_MAX_SCRAPE_PAGES = 10;
const SAM_MAX_MAPPED_URLS = 60;

// Flatten an MCP CallToolResult into a plain value for the model: the handler's
// human-readable text summary plus the structured data it returned.
function toModelOutput(result: CallToolResult): unknown {
  const summary = (result.content ?? [])
    .filter(
      (part): part is { type: "text"; text: string } => part.type === "text",
    )
    .map((part) => part.text)
    .join("\n");
  return result.structuredContent
    ? { summary, data: result.structuredContent }
    : { summary };
}

// Adapt one OpenSEO tool into an AI SDK tool. The shared handler receives the
// same explicit auth context as the MCP transport, and runs through the same
// instrumentation wrapper, so project scoping, credit metering, and the
// mcp:tool_call telemetry (source "in_app_agent", null clientId) all match the
// external MCP path.
//
// SAM always runs inside one project (the session row), so we bind that project
// server-side: any tool with a `projectId` input has it stripped from the schema
// the model sees and injected at call time. The model never has to know or pass
// the id, can't target another project, and can't hallucinate a wrong one.
function adaptMcpTool(
  def: AnyOpenSeoTool,
  context: ToolContext,
  projectId: string,
): Tool {
  const shape = toolInputShape(def.config.inputSchema);
  const { projectId: _projectIdSchema, ...modelShape } = shape;
  const bindsProject = "projectId" in shape;
  const handler = instrumentMcpToolHandler(def.name, undefined, def.handler);

  return tool({
    description: def.config.description,
    inputSchema: z.object(bindsProject ? modelShape : shape),
    execute: async (args) => {
      // Reconstruct the handler's validated arg shape by injecting the session
      // projectId that we stripped from the model-facing schema above.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- projectId re-added to rebuild the tool's arg shape; the handler re-validates project access
      const fullArgs = (bindsProject
        ? { ...args, projectId }
        : args) as unknown as never;
      try {
        // Tool calls run inside Think's inference loop, outside any ambient
        // request scope, so each execution scopes its own Postgres client
        // (no-op in D1 mode) — same rule as the DO's other DB-touching seams.
        return toModelOutput(
          await withPgClient(() => handler(fullArgs, context)),
        );
      } catch (error) {
        // Surface the failure to the model so it can recover or report it,
        // rather than aborting the whole turn on one bad tool call.
        return {
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });
}

// Audits run for minutes, and a chat model cannot sleep — given an instant
// status tool it spin-polls, and every call plus its result is persisted into
// the session history. SAM's get_audit_status therefore waits server-side:
// while the audit is running, it re-reads every few seconds and returns as
// soon as the status line changes (or when the budget runs out), so one tool
// call buys ~a minute of quiet waiting. The sleep sits BETWEEN adapted calls,
// so each re-read scopes its own short-lived DB client rather than holding one
// through the wait; each re-read also emits its own mcp:tool_call event, so
// telemetry counts server polls, not model calls.
const AUDIT_STATUS_POLL_MS = 2_000;
const AUDIT_STATUS_WAIT_BUDGET_MS = 50_000;

// The adapted tool returns toModelOutput's { summary, data } flattening; the
// summary line carries phase + page counts, so a changed line IS progress.
const auditProgressLine = (result: unknown): string | null =>
  typeof result === "object" &&
  result !== null &&
  "summary" in result &&
  typeof result.summary === "string"
    ? result.summary
    : null;

const auditIsRunning = (result: unknown): boolean => {
  if (typeof result !== "object" || result === null || !("data" in result)) {
    return false;
  }
  const data = result.data;
  if (typeof data !== "object" || data === null || !("status" in data)) {
    return false;
  }
  const status = data.status;
  return (
    typeof status === "object" &&
    status !== null &&
    "status" in status &&
    status.status === "running"
  );
};

export function waitingAuditStatusTool(
  adapt: (definition: AnyOpenSeoTool) => Tool,
): Tool {
  const base = adapt({
    ...getAuditStatusTool,
    config: {
      ...getAuditStatusTool.config,
      description: `${getAuditStatusTool.config.description} While the audit is running this call waits up to ~1 minute server-side and returns as soon as progress changes, so never call it in a tight loop: check a few times, narrating progress to the user in between, and if it is still running after that, say so and let the user come back for the results.`,
    },
  });
  const baseExecute = base.execute;
  if (!baseExecute) return base;

  return {
    ...base,
    execute: async (args, options) => {
      const deadline = Date.now() + AUDIT_STATUS_WAIT_BUDGET_MS;
      let result: unknown = await baseExecute(args, options);
      const initial = auditProgressLine(result);
      while (
        auditIsRunning(result) &&
        auditProgressLine(result) === initial &&
        Date.now() < deadline
      ) {
        await new Promise((resolve) =>
          setTimeout(resolve, AUDIT_STATUS_POLL_MS),
        );
        result = await baseExecute(args, options);
      }
      return result;
    },
  };
}

// Free (credit-less) site-reading tools, mirroring the onboarding agent's
// read_website but split into discovery + reading so the model can pick which
// pages to read instead of blindly taking the first N sitemap entries.
function scrapeTools(projectDomain: string | null): ToolSet {
  return {
    map_links: tool({
      description:
        "List a site's page URLs (homepage plus its sitemap) so you can choose which pages to read with read_pages. Defaults to the project's own site; pass `domain` to map another site (e.g. a competitor). Uses no credits.",
      inputSchema: z.object({
        domain: z
          .string()
          .optional()
          .describe("Domain or URL to map. Omit for the project's own site."),
      }),
      execute: async ({ domain }) => {
        const target = domain ?? projectDomain;
        if (!target) {
          return {
            error:
              "This project has no website set — ask the user for their site first.",
          };
        }
        const result = await discoverSiteUrls(target, SAM_MAX_MAPPED_URLS);
        return result.blocked
          ? { blocked: true, urls: [], note: "Could not reach the site." }
          : { blocked: false, urls: result.urls };
      },
    }),
    read_pages: tool({
      description: `Read up to ${SAM_MAX_SCRAPE_PAGES} web pages as plain text — the project's own pages or anyone else's (competitors, references). Pass specific \`urls\` (usually picked from map_links); omit to read a representative sample of the project's own site. Uses no credits.`,
      inputSchema: z.object({
        urls: z
          .array(z.string().url())
          .max(SAM_MAX_SCRAPE_PAGES)
          .optional()
          .describe(
            `Specific page URLs to read (max ${SAM_MAX_SCRAPE_PAGES}). Omit to read the project's own site.`,
          ),
      }),
      execute: async ({ urls }) => {
        const site =
          urls && urls.length > 0
            ? await readPages(urls, SAM_MAX_SCRAPE_PAGES)
            : projectDomain
              ? await readSite(projectDomain, SAM_MAX_SCRAPE_PAGES)
              : null;
        if (!site) {
          return {
            error:
              "This project has no website set — ask the user for their site, or pass explicit urls.",
          };
        }
        if (site.blocked) {
          return {
            blocked: true,
            pages: [],
            note: "Could not read the requested page(s). Ask the user to describe the site instead, and say you couldn't read it.",
          };
        }
        return { blocked: false, pages: site.pages };
      },
    }),
  };
}

// The two places SAM's version of a registry tool deliberately diverges from
// the MCP server's. Anything not listed here is adapted verbatim, so a new
// registry entry reaches SAM with zero wiring.
export const SAM_TOOL_OVERRIDES: Record<
  string,
  (adapt: (definition: AnyOpenSeoTool) => Tool) => Tool
> = {
  // SAM writes the shared project memory under its own author tag, so the
  // settings UI shows who wrote what.
  update_project_context: (adapt) =>
    adapt(buildUpdateProjectContextTool("sam")),
  // Server-side wait so the model doesn't spin-poll a minutes-long audit.
  get_audit_status: (adapt) => waitingAuditStatusTool(adapt),
};

/**
 * Builds SAM's tool surface as an AI SDK ToolSet: every TOOL_REGISTRY entry
 * (minus the `samExclude` ones a project-bound chat can't use) plus the free
 * site-reading tools. Auth and billing context are passed directly to the
 * shared tool handlers. DataForSEO spend is metered inside the shared client,
 * so tool calls draw down the org's credits automatically. A parity test in
 * samChatTools.test.ts keeps this derived list and the registry in lockstep.
 */
export function buildSamMcpTools(
  authContext: ToolAuthContext,
  project: { id: string; domain: string | null },
): ToolSet {
  const toolContext: ToolContext = { auth: authContext };
  const adaptTool = (definition: AnyOpenSeoTool) =>
    adaptMcpTool(definition, toolContext, project.id);

  const registryTools = Object.fromEntries(
    TOOL_REGISTRY.filter((entry) => !entry.samExclude).map((entry) => [
      entry.tool.name,
      (
        SAM_TOOL_OVERRIDES[entry.tool.name] ??
        ((adapt: (definition: AnyOpenSeoTool) => Tool) => adapt(entry.tool))
      )(adaptTool),
    ]),
  );

  return {
    // On-demand product reference (kept out of the system prompt: inlining it
    // made the agent narrate hosted/self-hosted framing at signed-in users).
    get_product_info: tool({
      description:
        "The OpenSEO fact sheet: what the product does, plans/pricing, credit costs, integrations, MCP setup. Call before answering questions about OpenSEO itself. Uses no credits.",
      inputSchema: z.object({}),
      execute: () => Promise.resolve({ factSheet: openSeoFactSheet }),
    }),
    ...scrapeTools(project.domain),
    ...registryTools,
  };
}
