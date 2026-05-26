import { describe, it, expect } from "vitest";
import {
  computeFreeVisitDeadline,
  computeMedicineExpiry,
} from "@/lib/domain/report/rules";

describe("deadline rules", () => {
  it("free-visit deadline is 3 days after generation", () => {
    const gen = new Date("2026-05-25T09:00:00.000Z");
    expect(computeFreeVisitDeadline(gen).toISOString()).toBe(
      "2026-05-28T09:00:00.000Z",
    );
  });

  it("medicine expiry is 2 months after generation", () => {
    const gen = new Date("2026-05-25T09:00:00.000Z");
    expect(computeMedicineExpiry(gen).toISOString()).toBe(
      "2026-07-25T09:00:00.000Z",
    );
  });

  it("medicine expiry clamps month-end overflow (Jan 31 -> Mar 31, not slip into May)", () => {
    const gen = new Date("2026-01-31T00:00:00.000Z");
    expect(computeMedicineExpiry(gen).toISOString()).toBe(
      "2026-03-31T00:00:00.000Z",
    );
  });

  it("medicine expiry clamps when target month is shorter (Dec 31 -> Feb 28)", () => {
    const gen = new Date("2025-12-31T00:00:00.000Z");
    expect(computeMedicineExpiry(gen).toISOString()).toBe(
      "2026-02-28T00:00:00.000Z",
    );
  });
});
