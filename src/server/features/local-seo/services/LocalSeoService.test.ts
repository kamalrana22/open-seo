import { describe, expect, it, vi } from "vitest";
import type { BillingCustomerContext } from "@/server/billing/subscription";
import { LocalSeoService } from "./LocalSeoService";

const mocks = vi.hoisted(() => ({
  fetchBusinessDataTaskResult: vi.fn(),
  reviewsTaskPost: vi.fn(),
}));

vi.mock("@/server/lib/dataforseo", () => ({
  fetchBusinessDataTaskResult: mocks.fetchBusinessDataTaskResult,
  createDataforseoClient: vi.fn(() => ({
    business: { reviewsTaskPost: mocks.reviewsTaskPost },
  })),
}));

const market = { locationCode: 2840, languageCode: "en" };
const billingCustomer: BillingCustomerContext = {
  organizationId: "org_123",
  userId: "user_123",
  userEmail: "alice@example.com",
};

// The public taskId encodes which endpoint collects it ("google:" vs
// "extended:"); a round-trip mismatch would collect the wrong task type or
// strand a paid task.
describe("business reviews taskId round-trip", () => {
  it("start returns an endpoint-tagged id that collect decodes", async () => {
    mocks.reviewsTaskPost.mockResolvedValue("task_1");
    mocks.fetchBusinessDataTaskResult.mockResolvedValue({
      status: "pending",
      result: null,
    });

    const google = await LocalSeoService.startBusinessReviews(
      { businessName: "Joe's Pizza" },
      market,
      billingCustomer,
    );
    expect(google.taskId).toBe("google:task_1");

    const extended = await LocalSeoService.startBusinessReviews(
      { businessName: "Joe's Pizza", includeOtherSources: true },
      market,
      billingCustomer,
    );
    expect(extended.taskId).toBe("extended:task_1");

    await LocalSeoService.collectBusinessReviews(extended.taskId);
    expect(mocks.fetchBusinessDataTaskResult).toHaveBeenCalledWith({
      endpoint: "extended_reviews",
      taskId: "task_1",
    });
  });

  it("rejects a taskId this feature did not hand out", async () => {
    await expect(
      LocalSeoService.collectBusinessReviews("task_1"),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
});

describe("collectBusinessReviews", () => {
  it("maps a completed outcome to trimmed reviews plus totals", async () => {
    mocks.fetchBusinessDataTaskResult.mockResolvedValue({
      status: "completed",
      result: {
        title: "Joe's Pizza",
        reviews_count: 120,
        rating: { value: 4.6 },
        cid: "123",
        place_id: "abc",
        items: [
          {
            rating: { value: 5 },
            review_text: "Great",
            profile_name: "Sam",
            // Provider noise the trim must drop.
            review_url: "https://maps.google.com/very-long-base64",
          },
        ],
      },
    });

    const outcome = await LocalSeoService.collectBusinessReviews("google:t1");
    expect(outcome).toEqual({
      status: "completed",
      reviews: [
        { rating: { value: 5 }, review_text: "Great", profile_name: "Sam" },
      ],
      totals: {
        title: "Joe's Pizza",
        reviews_count: 120,
        rating: { value: 4.6 },
        cid: "123",
        place_id: "abc",
      },
    });
  });

  it("reports a still-running task as processing", async () => {
    mocks.fetchBusinessDataTaskResult.mockResolvedValue({
      status: "pending",
      result: null,
    });
    await expect(
      LocalSeoService.collectBusinessReviews("google:t1"),
    ).resolves.toEqual({ status: "processing" });
  });
});
