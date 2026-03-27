import { beforeEach, describe, expect, it, vi } from "vitest";

const { resolveMxMock } = vi.hoisted(() => ({
  resolveMxMock: vi.fn(),
}));

vi.mock("node:dns/promises", () => ({
  resolveMx: resolveMxMock,
}));

describe("resolveMxTargets", () => {
  beforeEach(() => {
    resolveMxMock.mockReset();
  });

  it("sorts MX targets by priority and hostname", async () => {
    resolveMxMock.mockResolvedValue([
      { exchange: "b.example.com.", priority: 20 },
      { exchange: "a.example.com.", priority: 10 },
      { exchange: "c.example.com.", priority: 20 },
    ]);

    const { resolveMxTargets } = await import("../src/services/mx.js");

    await expect(resolveMxTargets("example.com")).resolves.toEqual([
      { exchange: "a.example.com", priority: 10 },
      { exchange: "b.example.com", priority: 20 },
      { exchange: "c.example.com", priority: 20 },
    ]);
  });

  it("rejects null MX domains", async () => {
    resolveMxMock.mockResolvedValue([{ exchange: ".", priority: 0 }]);

    const { MxLookupError, resolveMxTargets } = await import("../src/services/mx.js");

    await expect(resolveMxTargets("example.com")).rejects.toBeInstanceOf(MxLookupError);
  });
});
