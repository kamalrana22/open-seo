import { afterEach, describe, expect, it, vi } from "vitest";
import type { Tool } from "ai";
import { TOOL_REGISTRY } from "@/server/mcp/tool-definition";
import { makeToolContext } from "@/server/mcp/tools/tool-test-support";
import {
  buildSamMcpTools,
  SAM_TOOL_OVERRIDES,
  waitingAuditStatusTool,
} from "./samChatTools";

vi.mock("cloudflare:workers", () => ({
  env: {},
  DurableObject: class {
    kind = "mock";
  },
}));

// The server-side wait in SAM's get_audit_status: a completed audit must
// return without waiting, and a running one must return as soon as the status
// line changes — a regression in either turns every status check into the
// full 50-second budget.

const running = (line: string) => ({
  summary: line,
  data: { status: { status: "running" } },
});
const completed = {
  summary: "done",
  data: { status: { status: "completed" } },
};

function buildTool(outputs: unknown[]) {
  const execute = vi.fn(() => Promise.resolve(outputs.shift()));
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the wrapper only touches execute
  const tool = waitingAuditStatusTool(() => ({ execute }) as unknown as Tool);
  return { tool, execute };
}

const callOptions = { toolCallId: "t", messages: [] };

afterEach(() => {
  vi.useRealTimers();
});

// SAM's toolset is derived from TOOL_REGISTRY, so the MCP server and the
// in-app agent can't drift (this list once drifted for six weeks: audit, GA4,
// and rank-tracker management were MCP-only before anyone noticed).
describe("buildSamMcpTools", () => {
  it("mirrors the MCP tool registry plus SAM's own free tools", () => {
    const tools = buildSamMcpTools(makeToolContext().auth, {
      id: "project_123",
      domain: null,
    });
    expect(Object.keys(tools)).toEqual([
      "get_product_info",
      "map_links",
      "read_pages",
      ...TOOL_REGISTRY.filter((entry) => !entry.samExclude).map(
        (entry) => entry.tool.name,
      ),
    ]);
  });

  it("has unique registry names and overrides that target real tools", () => {
    const names = TOOL_REGISTRY.map((entry) => entry.tool.name);
    expect(new Set(names).size).toBe(names.length);
    for (const name of Object.keys(SAM_TOOL_OVERRIDES)) {
      expect(names).toContain(name);
    }
  });
});

describe("waitingAuditStatusTool", () => {
  it("returns a finished audit without waiting", async () => {
    const { tool, execute } = buildTool([completed]);
    await expect(tool.execute?.({}, callOptions)).resolves.toBe(completed);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("waits while running and returns as soon as progress changes", async () => {
    vi.useFakeTimers();
    const { tool, execute } = buildTool([
      running("phase crawl, 3/56 pages"),
      running("phase crawl, 3/56 pages"),
      running("phase lighthouse, 56/56 pages"),
    ]);
    const call: unknown = tool.execute?.({}, callOptions);
    await vi.advanceTimersByTimeAsync(10_000);
    await expect(call).resolves.toMatchObject({
      summary: "phase lighthouse, 56/56 pages",
    });
    expect(execute).toHaveBeenCalledTimes(3);
  });
});
