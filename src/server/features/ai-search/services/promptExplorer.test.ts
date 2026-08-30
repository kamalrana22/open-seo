import { describe, expect, it, vi } from "vitest";
import { AppError } from "@/server/lib/errors";
import type { LlmResponseResult } from "@/server/lib/dataforseoLlmSchemas";

vi.mock("cloudflare:workers", () => ({ waitUntil: vi.fn() }));

const accessMock = vi.hoisted(() => ({
  requireAiSearchAccess: vi.fn(() => Promise.resolve()),
}));
vi.mock("@/server/features/ai-search/services/access", () => accessMock);

const { explorePrompt, extractCitations } = await import("./promptExplorer");

// DataForSEO's LLM Responses payload nests references as untyped
// `{ title, url }` objects under items[].sections[].annotations — mirroring the
// SDK's AnnotationInfo, which has no citation-type discriminator.
function response(
  annotations: Array<{ title?: string; url?: string }>,
): LlmResponseResult {
  return {
    model_name: "gpt-5",
    web_search: true,
    items: [
      {
        type: "reasoning",
        sections: [{ type: "summary_text", text: "thinking" }],
      },
      {
        type: "message",
        sections: [{ type: "text", text: "answer", annotations }],
      },
    ],
  };
}

describe("extractCitations", () => {
  it("keeps untyped annotations (no citation-type discriminator exists)", () => {
    const citations = extractCitations(
      response([
        { title: "Town & Country", url: "https://www.townandcountrymag.com/x" },
        { title: "Stylevana", url: "https://www.stylevana.com/y" },
      ]),
    );
    expect(citations.map((c) => c.url)).toEqual([
      "https://www.townandcountrymag.com/x",
      "https://www.stylevana.com/y",
    ]);
    expect(citations[0]?.domain).toBe("townandcountrymag.com");
    expect(citations[0]?.title).toBe("Town & Country");
  });

  it("dedupes repeated URLs and drops unsafe schemes", () => {
    const citations = extractCitations(
      response([
        { title: "A", url: "https://example.com/a" },
        { title: "A dup", url: "https://example.com/a" },
        { title: "evil", url: "javascript:alert(1)" },
        { title: "no url" },
      ]),
    );
    expect(citations).toHaveLength(1);
    expect(citations[0]?.url).toBe("https://example.com/a");
  });

  it("ignores annotations outside message items and returns [] when absent", () => {
    expect(extractCitations({ items: [] })).toEqual([]);
    expect(
      extractCitations({
        items: [
          {
            type: "reasoning",
            sections: [
              {
                type: "summary_text",
                text: "t",
                annotations: [{ title: "x", url: "https://x.test/1" }],
              },
            ],
          },
        ],
      }),
    ).toEqual([]);
  });
});

// MCP tools and server functions both rely on the service itself enforcing
// the hosted paid-plan gate; the prompt must fail before any paid model call.
describe("explorePrompt access gate", () => {
  it("propagates a gate rejection before any paid model call", async () => {
    accessMock.requireAiSearchAccess.mockRejectedValueOnce(
      new AppError("PAYMENT_REQUIRED", "Upgrade to the paid plan"),
    );
    await expect(
      explorePrompt(
        {
          projectId: "project_123",
          prompt: "best running shoes",
          models: ["chat_gpt"],
          webSearch: true,
        },
        {
          organizationId: "org_123",
          userId: "user_123",
          userEmail: "alice@example.com",
        },
      ),
    ).rejects.toMatchObject({ code: "PAYMENT_REQUIRED" });
  });
});
