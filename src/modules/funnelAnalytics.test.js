import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock db
const mockDb = { store: {}, get: vi.fn(), set: vi.fn(), del: vi.fn() };
mockDb.get.mockImplementation((key) => Promise.resolve(mockDb.store[key] || null));
mockDb.set.mockImplementation((key, value) => {
  mockDb.store[key] = value;
  return Promise.resolve();
});

vi.mock("./utils.js", () => ({ db: mockDb }));
vi.mock("./logger.js", () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("./backendUrl.js", () => ({ getBackendUrl: () => "https://test.example.com" }));
vi.mock("./subscription.js", () => ({ getOrCreateDeviceId: () => Promise.resolve("test-device-123") }));

const { trackFunnel, hasFunnelEvent, getFunnelEvents, trackSupportEvent, getSupportEvents } = await import("./funnelAnalytics.js");

describe("funnelAnalytics", () => {
  beforeEach(() => {
    mockDb.store = {};
    mockDb.get.mockClear();
    mockDb.set.mockClear();
  });

  describe("trackFunnel", () => {
    it("records a valid funnel event", async () => {
      await trackFunnel("setup_started");
      const events = await getFunnelEvents();
      expect(events.setup_started).toBeGreaterThan(0);
    });

    it("is idempotent — second call does not overwrite timestamp", async () => {
      await trackFunnel("first_audit_completed");
      const firstTs = (await getFunnelEvents()).first_audit_completed;

      // Simulate passage of time
      await new Promise((r) => setTimeout(r, 5));
      await trackFunnel("first_audit_completed");
      const secondTs = (await getFunnelEvents()).first_audit_completed;

      expect(firstTs).toBe(secondTs);
    });

    it("ignores invalid event names", async () => {
      await trackFunnel("invalid_event_xyz");
      const events = await getFunnelEvents();
      expect(Object.keys(events)).toHaveLength(0);
    });

    it("records multiple distinct events", async () => {
      await trackFunnel("app_opened");
      await trackFunnel("setup_started");
      await trackFunnel("setup_completed");
      const events = await getFunnelEvents();
      expect(Object.keys(events)).toHaveLength(3);
    });
  });

  describe("hasFunnelEvent", () => {
    it("returns false for unrecorded events", async () => {
      expect(await hasFunnelEvent("converted")).toBe(false);
    });

    it("returns true after recording", async () => {
      await trackFunnel("bank_connected");
      expect(await hasFunnelEvent("bank_connected")).toBe(true);
    });
  });

  describe("trackSupportEvent", () => {
    it("records a support-risk event", async () => {
      await trackSupportEvent("restore_failed", { reason: "corrupt" });
      const events = await getSupportEvents();
      expect(events).toHaveLength(1);
      expect(events[0].event).toBe("restore_failed");
      expect(events[0].context.reason).toBe("corrupt");
    });

    it("sanitizes support-risk context before storing it", async () => {
      await trackSupportEvent("restore_failed", {
        email: "founder@example.com",
        token: "1234567890abcdef1234567890abcdef",
      });
      const events = await getSupportEvents();
      expect(events[0].context.email).toBe("[EMAIL]");
      expect(events[0].context.token).toBe("[TOKEN]");
    });

    it("is non-idempotent — multiple calls create multiple entries", async () => {
      await trackSupportEvent("sync_failed");
      await trackSupportEvent("sync_failed");
      await trackSupportEvent("sync_failed");
      const events = await getSupportEvents();
      expect(events).toHaveLength(3);
    });

    it("ignores invalid support event names", async () => {
      await trackSupportEvent("not_a_real_event");
      const events = await getSupportEvents();
      expect(events).toHaveLength(0);
    });

    it("caps stored events at MAX_SUPPORT_EVENTS", async () => {
      // Fill beyond the cap
      for (let i = 0; i < 110; i++) {
        await trackSupportEvent("export_used");
      }
      const events = await getSupportEvents();
      expect(events.length).toBeLessThanOrEqual(100);
    });
  });
});
