import { describe, expect, it, vi } from "vitest";
import { requireAiSearchAccess } from "./access";

const mocks = vi.hoisted(() => ({
  isHostedServerAuthMode: vi.fn(() => Promise.resolve(false)),
  customerHasPaidPlan: vi.fn(() => Promise.resolve(false)),
}));

vi.mock("@/server/lib/runtime-env", () => ({
  isHostedServerAuthMode: mocks.isHostedServerAuthMode,
}));
vi.mock("@/server/billing/subscription", () => ({
  customerHasPaidPlan: mocks.customerHasPaidPlan,
}));

describe("requireAiSearchAccess", () => {
  it("never gates self-hosted deployments", async () => {
    await expect(requireAiSearchAccess("org_123")).resolves.toBeUndefined();
    expect(mocks.customerHasPaidPlan).not.toHaveBeenCalled();
  });

  it("allows hosted orgs on the paid plan", async () => {
    mocks.isHostedServerAuthMode.mockResolvedValueOnce(true);
    mocks.customerHasPaidPlan.mockResolvedValueOnce(true);
    await expect(requireAiSearchAccess("org_123")).resolves.toBeUndefined();
  });

  it("rejects hosted free-plan orgs with PAYMENT_REQUIRED", async () => {
    mocks.isHostedServerAuthMode.mockResolvedValueOnce(true);
    await expect(requireAiSearchAccess("org_123")).rejects.toMatchObject({
      code: "PAYMENT_REQUIRED",
    });
  });
});
