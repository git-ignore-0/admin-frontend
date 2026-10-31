import { describe, expect, it } from "vitest";

import {
  formatStockQuantityTotal,
  stockBatchRangeForPreset,
  validateStockBatchInput,
} from "@/lib/farm-stock";

describe("stockBatchRangeForPreset", () => {
  it("uses the inclusive current Vietnam week", () => {
    expect(stockBatchRangeForPreset("week", "2026-10-31")).toEqual({
      start_date: "2026-10-26",
      end_date: "2026-11-01",
    });
  });

  it("uses the inclusive current calendar month", () => {
    expect(stockBatchRangeForPreset("month", "2026-10-31")).toEqual({
      start_date: "2026-10-01",
      end_date: "2026-10-31",
    });
  });
});

describe("validateStockBatchInput", () => {
  it("accepts a current range with a positive integer quantity", () => {
    expect(
      validateStockBatchInput(
        { start_date: "2026-10-26", end_date: "2026-11-01", quantity: "10" },
        "2026-10-31",
      ),
    ).toEqual({
      value: { start_date: "2026-10-26", end_date: "2026-11-01", quantity_units: 10 },
      errors: {},
    });
  });

  it("rejects an expired range, reversed dates, and zero quantity", () => {
    expect(
      validateStockBatchInput(
        { start_date: "2026-10-30", end_date: "2026-10-29", quantity: "0" },
        "2026-10-31",
      ),
    ).toEqual({
      value: null,
      errors: { end_date: "date_order", quantity: "positive_integer" },
    });
    expect(
      validateStockBatchInput(
        { start_date: "2026-10-01", end_date: "2026-10-30", quantity: "1" },
        "2026-10-31",
      ).errors,
    ).toEqual({ end_date: "expired" });
  });
});

it("formats the exact total from sale units without floating-point drift", () => {
  expect(formatStockQuantityTotal(10, "0.500", "kg")).toBe("5 kg");
  expect(formatStockQuantityTotal(3, "0.333", "kg")).toBe("0.999 kg");
  expect(formatStockQuantityTotal(10, "1.000", "quả")).toBe("10 quả");
});
