import { describe, expect, it } from "vitest";

import {
  isEditablePhoneValid,
  normalizeEditablePhone,
  sanitizeEditablePhoneDigits,
  type EditablePhone,
} from "@/lib/phone-number";

const phone = (value: string): EditablePhone => ({ value, entry: "ready" });

describe("editable Vietnamese mobile phones", () => {
  it.each(["03", "05", "07", "08", "09"])(
    "retains the leading zero in %s and serializes +84",
    (prefix) => {
      const state = phone(prefix + "12345678");
      expect(sanitizeEditablePhoneDigits(state.value)).toBe(state.value);
      expect(isEditablePhoneValid(state, true)).toBe(true);
      expect(normalizeEditablePhone(state)).toBe("+84" + state.value.slice(1));
    },
  );

  it.each([
    "",
    "09123",
    "09123456789",
    "912345678",
    "0612345678",
    "02412345678",
    "0912345678\n",
    "84912345678",
    "+84912345678",
    "０９１２３４５６７８",
  ])("does not normalize an invalid editable value %j", (value) => {
    expect(isEditablePhoneValid(phone(value), true)).toBe(false);
    expect(normalizeEditablePhone(phone(value))).toBeNull();
  });

  it("distinguishes absent optional input from pending or rejected edits", () => {
    expect(isEditablePhoneValid(phone(""))).toBe(true);
    for (const entry of ["rejected", "composing"] as const) {
      for (const value of ["", "0912345678"]) {
        expect(isEditablePhoneValid({ value, entry })).toBe(false);
        expect(normalizeEditablePhone({ value, entry })).toBeNull();
      }
    }
  });

  it("removes everything except ASCII digits without altering their order or length", () => {
    expect(sanitizeEditablePhoneDigits("abc(0912) 345-678.\n₫１２٣")).toBe("0912345678");
    expect(sanitizeEditablePhoneDigits("+84912345678")).toBe("84912345678");
    expect(sanitizeEditablePhoneDigits("")).toBe("");
  });
});
