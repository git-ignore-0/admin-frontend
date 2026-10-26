import { describe, expect, it } from "vitest";

import {
  formatDecimalInput,
  parsePositiveDecimal,
  parsePositiveInteger,
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
