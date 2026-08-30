import type {
  CallToolResult,
  ToolAnnotations,
} from "@modelcontextprotocol/server";
import { z } from "zod";
import type { ToolContext } from "@/server/mcp/context";
import { getBacklinksOverviewTool } from "@/server/mcp/tools/get-backlinks-overview";
import { getBacklinksProfileTool } from "@/server/mcp/tools/get-backlinks-profile";
import { getDomainKeywordSuggestionsTool } from "@/server/mcp/tools/get-domain-keyword-suggestions";
import { getDomainOverviewTool } from "@/server/mcp/tools/get-domain-overview";
import { addRankTrackingKeywordsTool } from "@/server/mcp/tools/add-rank-tracking-keywords";
import { createRankTrackerTool } from "@/server/mcp/tools/create-rank-tracker";
import { estimateRankTrackerCostTool } from "@/server/mcp/tools/estimate-rank-tracker-cost";
import { getRankTrackerTool } from "@/server/mcp/tools/get-rank-tracker";
import { removeRankTrackingKeywordsTool } from "@/server/mcp/tools/remove-rank-tracking-keywords";
import { runRankTrackerTool } from "@/server/mcp/tools/run-rank-tracker";
import { getSerpResultsTool } from "@/server/mcp/tools/get-serp-results";
import {
  getGoogleAnalyticsAudienceBreakdownTool,
  getGoogleAnalyticsEcommercePerformanceTool,
  getGoogleAnalyticsKeyEventsTool,
  getGoogleAnalyticsMeasurementHealthTool,
  getGoogleAnalyticsOrganicLandingPagesTool,
  getGoogleAnalyticsOrganicOverviewTool,
  getGoogleAnalyticsPagePerformanceTool,
  getGoogleAnalyticsSiteSearchTool,
  getGoogleAnalyticsTrafficAcquisitionTool,
  getSearchOpportunitiesTool,
} from "@/server/mcp/tools/google-analytics-tools";
import { createProjectTool } from "@/server/mcp/tools/create-project";
import { listProjectsTool } from "@/server/mcp/tools/list-projects";
import {
  getProjectContextTool,
  updateProjectContextTool,
} from "@/server/mcp/tools/project-context";
import { listSavedKeywordsTool } from "@/server/mcp/tools/list-saved-keywords";
import {
  findSerpCompetitorsTool,
  getGoogleBusinessQuestionsTool,
  getKeywordMetricsTool,
  getLocalSerpResultsTool,
  getRankedKeywordsTool,
  searchLocalBusinessesTool,
} from "@/server/mcp/tools/dataforseo-research-tools";
import {
  getBusinessProfileTool,
  getBusinessReviewsTool,
  getBusinessUpdatesTool,
  getLocalRankGridTool,
  listBusinessCategoriesTool,
} from "@/server/mcp/tools/local-seo-tools";
import { researchKeywordsTool } from "@/server/mcp/tools/research-keywords";
import { saveKeywordsTool } from "@/server/mcp/tools/save-keywords";
import {
  getSearchConsolePerformanceTool,
  inspectUrlsTool,
} from "@/server/mcp/tools/search-console-tools";
import {
  getAuditIssuesTool,
  getAuditPagesTool,
  getAuditStatusTool,
  runSiteAuditTool,
} from "@/server/mcp/tools/site-audit-tools";
import { whoamiTool } from "@/server/mcp/tools/whoami";

// Tools declare inputSchema as either a raw Zod shape (most tools) or a full
// z.object (the GA4 tools); consumers normalize with objectSchema (MCP server)
// or toolInputShape (SAM).
type ToolSchema = z.ZodType | z.ZodRawShape;

// Structurally-erased tool definition so heterogeneously-typed tools fit one
// registry. `args: never` keeps every concrete handler assignable (function
// parameters are contravariant); consumers rebuild the concrete arg value and
// cast at the call site, where the SDK / adapter has already validated it
// against the tool's own inputSchema.
export type AnyOpenSeoTool = {
  name: string;
  config: {
    title?: string;
    description: string;
    inputSchema: ToolSchema;
    outputSchema?: ToolSchema;
    annotations?: ToolAnnotations;
  };
  handler: (
    args: never,
    context: ToolContext,
  ) => CallToolResult | Promise<CallToolResult>;
};

// The raw shape behind a tool's inputSchema, whichever way it was declared.
export function toolInputShape(schema: ToolSchema): z.ZodRawShape {
  if (schema instanceof z.ZodObject) return schema.shape;
  if (schema instanceof z.ZodType) {
    throw new Error("Tool inputSchema must be a raw shape or a z.object");
  }
  return schema;
}

type ToolRegistryEntry = {
  tool: AnyOpenSeoTool;
  /**
   * Left out of SAM's in-app toolset: a project-bound chat can't use it, or
   * an injected context block already covers it.
   */
  samExclude?: true;
};

/**
 * Single source of truth for the OpenSEO tool surface. The MCP server
 * registers every entry in order, and SAM derives its toolset from the same
 * list (minus `samExclude` entries), so the two can no longer drift — a
 * parity test in samChatTools.test.ts enforces it.
 */
export const TOOL_REGISTRY: readonly ToolRegistryEntry[] = [
  { tool: whoamiTool },
  // SAM is bound to the session's project, so discovering or creating other
  // projects isn't part of its job.
  { tool: listProjectsTool, samExclude: true },
  { tool: createProjectTool, samExclude: true },
  // SAM gets the project's memory injected into every turn as a read-only
  // context block, so a read tool would just re-fetch it.
  { tool: getProjectContextTool, samExclude: true },
  { tool: updateProjectContextTool },
  { tool: listSavedKeywordsTool },
  { tool: researchKeywordsTool },
  { tool: saveKeywordsTool },
  { tool: getDomainOverviewTool },
  { tool: getDomainKeywordSuggestionsTool },
  { tool: getBacklinksOverviewTool },
  { tool: getBacklinksProfileTool },
  { tool: getSerpResultsTool },
  { tool: createRankTrackerTool },
  { tool: getRankTrackerTool },
  { tool: addRankTrackingKeywordsTool },
  { tool: removeRankTrackingKeywordsTool },
  { tool: estimateRankTrackerCostTool },
  { tool: runRankTrackerTool },
  { tool: getRankedKeywordsTool },
  { tool: findSerpCompetitorsTool },
  { tool: searchLocalBusinessesTool },
  { tool: getLocalSerpResultsTool },
  { tool: getGoogleBusinessQuestionsTool },
  { tool: getBusinessProfileTool },
  { tool: getBusinessReviewsTool },
  { tool: getBusinessUpdatesTool },
  { tool: listBusinessCategoriesTool },
  { tool: getLocalRankGridTool },
  { tool: getKeywordMetricsTool },
  { tool: getSearchConsolePerformanceTool },
  { tool: inspectUrlsTool },
  { tool: getGoogleAnalyticsOrganicLandingPagesTool },
  { tool: getGoogleAnalyticsPagePerformanceTool },
  { tool: getGoogleAnalyticsKeyEventsTool },
  { tool: getSearchOpportunitiesTool },
  { tool: getGoogleAnalyticsOrganicOverviewTool },
  { tool: getGoogleAnalyticsTrafficAcquisitionTool },
  { tool: getGoogleAnalyticsMeasurementHealthTool },
  { tool: getGoogleAnalyticsEcommercePerformanceTool },
  { tool: getGoogleAnalyticsSiteSearchTool },
  { tool: getGoogleAnalyticsAudienceBreakdownTool },
  { tool: runSiteAuditTool },
  { tool: getAuditStatusTool },
  { tool: getAuditIssuesTool },
  { tool: getAuditPagesTool },
];
