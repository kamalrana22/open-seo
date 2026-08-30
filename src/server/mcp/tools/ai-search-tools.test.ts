import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/server/lib/errors";
import {
  exploreAiPromptTool,
  getBrandAiVisibilityTool,
} from "./ai-search-tools";
import { makeToolContext, textContent } from "./tool-test-support";

const mocks = vi.hoisted(() => ({
  getProjectForOrganization: vi.fn(),
  getBrandLookup: vi.fn(),
  explorePrompt: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/server/features/projects/services/ProjectService", () => ({
  ProjectService: {
    getProjectForOrganization: mocks.getProjectForOrganization,
  },
}));
vi.mock("@/server/features/ai-search/services/brandLookup", () => ({
  getBrandLookup: mocks.getBrandLookup,
}));
vi.mock("@/server/features/ai-search/services/promptExplorer", () => ({
  explorePrompt: mocks.explorePrompt,
}));

const toolContext = makeToolContext();

const brandArgs = {
  projectId: "project_1",
  query: "acme",
  competitors: [],
  locationCode: 2840,
  languageCode: "en",
};

const brandResult = {
  query: "acme",
  detectedTargetType: "keyword",
  resolvedTarget: "acme",
  scope: null,
  aggregatesAreDomainLevel: false,
  fetchedAt: "2026-08-30T00:00:00.000Z",
  hasData: true,
  totalMentions: 12,
  totalAiSearchVolume: 3400,
  perPlatform: [
    {
      platform: "chat_gpt",
      status: "success",
      mentions: 8,
      aiSearchVolume: 2000,
    },
    {
      platform: "google",
      status: "success",
      mentions: 4,
      aiSearchVolume: 1400,
    },
  ],
  shareOfVoice: null,
  topPages: [],
  topQueries: [],
  monthlyVolume: [],
};

beforeEach(() => {
  mocks.getProjectForOrganization.mockResolvedValue({ id: "project_1" });
});

describe("get_brand_ai_visibility MCP tool", () => {
  it("forwards the billing context and renders real values in the text", async () => {
    mocks.getBrandLookup.mockResolvedValue(brandResult);

    const result = await getBrandAiVisibilityTool.handler(
      brandArgs,
      toolContext,
    );

    // Billing forwarding is the contract: the service meters DataForSEO spend
    // against exactly this customer.
    expect(mocks.getBrandLookup).toHaveBeenCalledWith(
      brandArgs,
      expect.objectContaining({ organizationId: "org_123" }),
    );
    const text = textContent(result);
    expect(text).toContain("acme");
    expect(text).toContain("chat_gpt");
    expect(text).toContain("2000");
    expect(result.structuredContent).toMatchObject({
      resolvedTarget: "acme",
      totalMentions: 12,
      meta: { projectId: "project_1" },
    });
  });

  it("propagates the paid-plan gate", async () => {
    mocks.getBrandLookup.mockRejectedValue(
      new AppError("PAYMENT_REQUIRED", "Upgrade to the paid plan"),
    );
    await expect(
      getBrandAiVisibilityTool.handler(brandArgs, toolContext),
    ).rejects.toMatchObject({ code: "PAYMENT_REQUIRED" });
  });
});

describe("explore_ai_prompt MCP tool", () => {
  it("forwards the billing context and renders each model's answer", async () => {
    mocks.explorePrompt.mockResolvedValue({
      prompt: "best seo tool",
      highlightBrand: null,
      fetchedAt: "2026-08-30T00:00:00.000Z",
      results: [
        {
          status: "success",
          model: "claude",
          modelName: "claude-sonnet-4-5",
          text: "Here are some tools.",
          citations: [
            {
              url: "https://example.com/a",
              domain: "example.com",
              title: null,
              matchedBrand: false,
            },
          ],
          fanOutQueries: [],
          brandMentioned: null,
          outputTokens: 42,
          webSearch: true,
        },
        {
          status: "error",
          model: "gemini",
          errorCode: "UPSTREAM_ERROR",
          message: "upstream boom",
        },
      ],
    });

    const args = {
      projectId: "project_1",
      prompt: "best seo tool",
      models: ["claude", "gemini"] as ["claude", "gemini"],
      webSearch: true,
    };
    const result = await exploreAiPromptTool.handler(args, toolContext);

    expect(mocks.explorePrompt).toHaveBeenCalledWith(
      args,
      expect.objectContaining({ organizationId: "org_123" }),
    );
    const text = textContent(result);
    expect(text).toContain("Here are some tools.");
    expect(text).toContain("https://example.com/a");
    expect(text).toContain("gemini — error");
    expect(result.structuredContent).toMatchObject({
      prompt: "best seo tool",
      meta: { projectId: "project_1" },
    });
  });
});
