import { describe, expect, it } from "vitest";
import { monetizationProgress, socialLink } from "@/lib/growth";
describe("creator monetization", () => {
  it("does not qualify at 999 subscribers", () =>
    expect(monetizationProgress(999)).toEqual({ eligible: false, remaining: 1, percent: 99.9 }));
  it("qualifies starting at 1000 subscribers", () =>
    expect(monetizationProgress(1000)).toEqual({ eligible: true, remaining: 0, percent: 100 }));
  it("continues eligibility above 1000", () =>
    expect(monetizationProgress(1001).eligible).toBe(true));
});
it("preserves timestamps in tracked social links", () =>
  expect(
    new URL(socialLink("https://arin-x.lovable.app/watch/abc?t=90", "whatsapp")).searchParams.get(
      "t",
    ),
  ).toBe("90"));
