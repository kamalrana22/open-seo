import { describe, expect, it, vi } from "vitest";
import { buildOnboardingTools } from "./onboardingChatTools";
import type { BillingCustomerContext } from "@/server/billing/subscription";

const mocks = vi.hoisted(() => ({
  applyContextUpdates: vi.fn(() => Promise.resolve(null)),
}));

vi.mock("cloudflare:workers", () => ({ env: {}, waitUntil: vi.fn() }));
vi.mock(
  "@/server/features/project-context/services/ProjectContextService",
  () => ({
    ProjectContextService: { applyContextUpdates: mocks.applyContextUpdates },
  }),
);

const project = {
  id: "project_123",
  domain: "acme.com",
  locationCode: 2840,
  languageCode: "en",
  organizationId: "org_123",
};

const billingCustomer: BillingCustomerContext = {
  organizationId: "org_123",
  userId: "org_123",
  userEmail: "system-onboarding@openseo.so",
};

const callOptions = { toolCallId: "t", messages: [] };

// The op mapping is the contract: the onboarding strategy must land in the
// spec-0010 project-memory store under the "onboarding" author, filling
// business_overview (which also disables SAM's re-interview intake mode).
describe("save_strategy onboarding tool", () => {
  it("writes the strategy into project context as the onboarding author", async () => {
    const tools = buildOnboardingTools({ project, billingCustomer });
    // ToolSet erases per-tool arg/result types, so the call is untyped here.
    const result: unknown = await tools.save_strategy?.execute?.(
      {
        businessOverview: "Acme sells anvils to coyotes.",
        positioning: "Position as the anvil authority.",
        strategy: "## Themes\n- anvils\n\n## Target keywords\n| anvil | 10 |",
      },
      callOptions,
    );

    expect(mocks.applyContextUpdates).toHaveBeenCalledWith(
      "project_123",
      [
        {
          section: "business_overview",
          content: "Acme sells anvils to coyotes.",
        },
        { section: "positioning", content: "Position as the anvil authority." },
        {
          customSection: "seo-strategy",
          title: "SEO strategy",
          content: "## Themes\n- anvils\n\n## Target keywords\n| anvil | 10 |",
        },
        {
          appendResearchLog: {
            summary:
              "Onboarding strategy saved: positioning, content themes, and target keywords.",
          },
        },
      ],
      "onboarding",
    );
    expect(result).toEqual({ saved: true });
  });
});
