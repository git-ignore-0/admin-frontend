import { describe, expect, it } from "vitest";

import {
  formatDecimalInput,
  parsePositiveDecimal,
  parsePositiveInteger,
  parsePositiveQuotaUnits,
  sanitizeDecimalInput,
  sanitizeIntegerInput,
} from "@/lib/numeric-input";

describe("numeric input boundaries", () => {
  it.each([
    ["500.000", "500"],
    ["0.500", "0.5"],
    ["1.250", "1.25"],
    ["1.001", "1.001"],
  ])("formats stored decimal %s without insignificant zeroes", (input, expected) => {
    expect(formatDecimalInput(input)).toBe(expected);
  });

  it.each([
    ["abc", ""],
    ["1e3", "13"],
    ["+1", "1"],
    ["-1", "1"],
    ["1.5", "15"],
    ["abc12e+3", "123"],
  ])("keeps only integer digits from %s", (input, expected) => {
    expect(sanitizeIntegerInput(input)).toBe(expected);
  });

  it.each([
    ["abc", ""],
    ["1e3", "13"],
    ["-1,25", "1.25"],
    ["1.2.3", "1.23"],
    ["0.1234", "0.1234"],
  ])("normalizes decimal input %s without scientific notation", (input, expected) => {
    expect(sanitizeDecimalInput(input)).toBe(expected);
  });

  it.each([".25", "0.25", "0,25", "0.5", "0.75", "1", "2", "2147483647"])(
    "accepts fractional point input %s as a JSON number",
    (value) =>
      expect(parsePositiveQuotaUnits(value)).toEqual({ value: Number(value.replace(",", ".")) }),
  );

  it.each([
    "0.1",
    "0.2",
    "0.9",
    "1.1",
    "1.25",
    "2.5",
    "0",
    "-0.25",
    "0.001",
    "NaN",
    "Infinity",
    "1e2",
    "2147483647.01",
  ])("rejects invalid point input %s", (value) =>
    expect(parsePositiveQuotaUnits(value)).toHaveProperty("error"),
  );

  it("validates positive values and ranges before conversion", () => {
    expect(parsePositiveInteger("")).toEqual({ error: "required" });
    expect(parsePositiveInteger("0")).toEqual({ error: "positive_integer" });
    expect(parsePositiveInteger("121", { max: 120 })).toEqual({ error: "integer_range" });
    expect(parsePositiveInteger("00012", { max: 120 })).toEqual({ value: 12 });
    expect(parsePositiveDecimal("0")).toEqual({ error: "positive_decimal" });
    expect(parsePositiveDecimal("0.1234")).toEqual({ error: "decimal_format" });
    expect(parsePositiveDecimal("0.125")).toEqual({ value: 0.125 });
  });
});
