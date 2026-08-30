import { z } from "zod";
import { getBrandLookup } from "@/server/features/ai-search/services/brandLookup";
import { explorePrompt } from "@/server/features/ai-search/services/promptExplorer";
import { buildProjectMeta } from "@/server/mcp/context";
import { mcpResponse } from "@/server/mcp/formatters";
import {
  looseObjectOutputSchema,
  optionalMetaOutputSchema,
} from "@/server/mcp/output-schemas";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import { projectIdSchema } from "@/server/mcp/schemas";
import { formatMcpTable, truncatedCell } from "@/server/mcp/table";
import {
  brandLookupInputSchema,
  promptExplorerInputSchema,
  type BrandLookupResult,
  type PromptExplorerModelResult,
} from "@/types/schemas/ai-search";

// Text tables show the top rows; the full capped arrays (40 pages / 50
// queries) ride along in structuredContent.
const BRAND_TEXT_ROWS = 10;

const brandInputSchema = {
  projectId: projectIdSchema,
  query: brandLookupInputSchema.shape.query.describe(
    "Brand name or domain/URL to look up (e.g. 'OpenSEO' or 'openseo.so').",
  ),
  competitors: brandLookupInputSchema.shape.competitors.describe(
    "Up to 5 competitor brands or domains to compare share of voice against. Supplying any adds one metered call per platform.",
  ),
  scope: brandLookupInputSchema.shape.scope.describe(
    "Research scope for domain/URL queries (domain, subdomains, subfolder, exact_url). Ignored for brand-name queries. Omit to derive from the query.",
  ),
  locationCode: brandLookupInputSchema.shape.locationCode.describe(
    "DataForSEO location code for Google AI Overview data. Defaults to 2840 (United States). ChatGPT data is always US/English regardless.",
  ),
  languageCode: brandLookupInputSchema.shape.languageCode.describe(
    "Language code for Google AI Overview data. Defaults to 'en'.",
  ),
} as const;

type BrandArgs = z.infer<z.ZodObject<typeof brandInputSchema>>;

function brandLookupText(result: BrandLookupResult): string {
  const sections: string[] = [
    `AI visibility for ${result.resolvedTarget} (${result.detectedTargetType}): ${result.totalMentions ?? "?"} mentions, ${result.totalAiSearchVolume ?? "?"} AI search volume.`,
  ];
  if (!result.hasData) {
    sections.push(
      "No AI-search mentions found for this target on either platform.",
    );
  }
  sections.push(
    formatMcpTable(result.perPlatform, [
      { header: "platform", value: (row) => row.platform },
      { header: "status", value: (row) => row.status },
      { header: "mentions", value: (row) => row.mentions },
      { header: "ai search volume", value: (row) => row.aiSearchVolume },
    ]),
  );
  if (result.shareOfVoice) {
    sections.push(
      `Share of voice (${result.shareOfVoice.platforms.join(" + ")}):\n${formatMcpTable(
        result.shareOfVoice.entries,
        [
          {
            header: "brand",
            value: (row) =>
              row.isTarget ? `${row.label} (target)` : row.label,
          },
          { header: "mentions", value: (row) => row.mentions },
          { header: "share %", value: (row) => row.sharePct },
        ],
      )}`,
    );
  }
  if (result.topPages.length > 0) {
    sections.push(
      `Top cited pages (${Math.min(result.topPages.length, BRAND_TEXT_ROWS)} of ${result.topPages.length}; full list in structuredContent):\n${formatMcpTable(
        result.topPages.slice(0, BRAND_TEXT_ROWS),
        [
          {
            header: "url",
            value: (row) => row.url,
            format: truncatedCell(100),
          },
          { header: "platform", value: (row) => row.platform },
          { header: "mentions", value: (row) => row.mentions },
          { header: "captured volume", value: (row) => row.capturedVolume },
        ],
      )}`,
    );
  }
  if (result.topQueries.length > 0) {
    sections.push(
      `Top prompts mentioning the target (${Math.min(result.topQueries.length, BRAND_TEXT_ROWS)} of ${result.topQueries.length}; full list in structuredContent):\n${formatMcpTable(
        result.topQueries.slice(0, BRAND_TEXT_ROWS),
        [
          {
            header: "question",
            value: (row) => row.question,
            format: truncatedCell(120),
          },
          { header: "platform", value: (row) => row.platform },
          { header: "ai search volume", value: (row) => row.aiSearchVolume },
        ],
      )}`,
    );
  }
  return sections.join("\n\n");
}

export const getBrandAiVisibilityTool = {
  name: "get_brand_ai_visibility",
  config: {
    title: "Get brand AI visibility",
    description:
      "Check how visible a brand or domain is in AI search answers (ChatGPT and Google AI Overview): mention counts, AI search volume, share of voice against competitors, top cited pages, and the prompts that surface them. Spends credits: 3 metered DataForSEO calls per platform (6 total), plus 1 more per platform when competitors are supplied. Results are cached for 24 hours, so repeating the same lookup is free. Hosted accounts require the paid plan; self-hosted deployments are not plan-gated.",
    inputSchema: brandInputSchema,
    outputSchema: z
      .object({
        query: z.string(),
        detectedTargetType: z.string(),
        resolvedTarget: z.string(),
        hasData: z.boolean(),
        totalMentions: z.number().nullable(),
        totalAiSearchVolume: z.number().nullable(),
        perPlatform: z.array(looseObjectOutputSchema),
        shareOfVoice: looseObjectOutputSchema.nullable(),
        topPages: z.array(looseObjectOutputSchema),
        topQueries: z.array(looseObjectOutputSchema),
        monthlyVolume: z.array(looseObjectOutputSchema),
        ...optionalMetaOutputSchema,
      })
      .passthrough(),
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: BrandArgs, context) => {
    const result = await getBrandLookup(args, context.billing);
    return mcpResponse({
      text: brandLookupText(result),
      meta: buildProjectMeta(
        context,
        args.projectId,
        `/p/${args.projectId}/brand-lookup`,
        { q: args.query },
      ),
      structuredContent: result,
    });
  }),
};

const promptInputSchema = {
  projectId: projectIdSchema,
  prompt: promptExplorerInputSchema.shape.prompt.describe(
    "The prompt to ask each model, phrased the way a real user would ask an AI assistant.",
  ),
  models: promptExplorerInputSchema.shape.models.describe(
    "Which models to ask: chat_gpt, claude, gemini, perplexity. Each selected model is one metered call.",
  ),
  highlightBrand: promptExplorerInputSchema.shape.highlightBrand.describe(
    "Brand name to flag in each answer: sets brandMentioned per model and marks matching citations.",
  ),
  webSearch: promptExplorerInputSchema.shape.webSearch.describe(
    "Let models search the web while answering (default true). Grounded answers are what AI search visibility is about; turn off only to probe pure model knowledge.",
  ),
  webSearchCountryCode:
    promptExplorerInputSchema.shape.webSearchCountryCode.describe(
      "Two-letter country code steering the web-search component (e.g. 'US', 'DE'). Omit for the provider default.",
    ),
} as const;

type PromptArgs = z.infer<z.ZodObject<typeof promptInputSchema>>;

function promptModelText(result: PromptExplorerModelResult): string {
  if (result.status === "error") {
    return `## ${result.model} — error\n${result.message}`;
  }
  const lines = [
    `## ${result.model}${result.modelName ? ` (${result.modelName})` : ""}${
      result.brandMentioned === null
        ? ""
        : result.brandMentioned
          ? " — brand mentioned"
          : " — brand NOT mentioned"
    }`,
    result.text,
  ];
  if (result.citations.length > 0) {
    lines.push(
      `Citations:\n${formatMcpTable(result.citations, [
        { header: "url", value: (row) => row.url, format: truncatedCell(100) },
        {
          header: "matched brand",
          value: (row) => (row.matchedBrand ? "yes" : "no"),
        },
      ])}`,
    );
  }
  return lines.join("\n");
}

export const exploreAiPromptTool = {
  name: "explore_ai_prompt",
  config: {
    title: "Explore AI prompt",
    description:
      "Ask one prompt across up to four AI models (ChatGPT, Claude, Gemini, Perplexity) and compare their answers and cited sources side by side — the way to see whether and how a brand shows up in AI answers. Spends credits: 1 metered DataForSEO LLM call per selected model. Each (prompt, model) answer is cached for 7 days, so repeats are free. Hosted accounts require the paid plan; self-hosted deployments are not plan-gated.",
    inputSchema: promptInputSchema,
    outputSchema: z
      .object({
        prompt: z.string(),
        highlightBrand: z.string().nullable(),
        fetchedAt: z.string(),
        results: z.array(looseObjectOutputSchema),
        ...optionalMetaOutputSchema,
      })
      .passthrough(),
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: PromptArgs, context) => {
    const result = await explorePrompt(args, context.billing);
    return mcpResponse({
      text: result.results.map(promptModelText).join("\n\n"),
      meta: buildProjectMeta(
        context,
        args.projectId,
        `/p/${args.projectId}/prompt-explorer`,
        { q: args.prompt },
      ),
      structuredContent: result,
    });
  }),
};
