import type { ClipboardEvent } from "react";

const countryPrefix = "+84";
const localPrefix = "0";
const storedPrefixes = [countryPrefix, countryPrefix.slice(1), localPrefix];
const nonDigits = /[^0-9]/;
const nationalPatterns = {
  contact: /^[1-9][0-9]{8,9}$/,
  identity: /^(?:[35789][0-9]{8}|2[0-9]{9})$/,
};
type PhoneDomain = keyof typeof nationalPatterns;

function nationalDigits(value: string): string {
  for (const prefix of storedPrefixes) {
    if (value.startsWith(prefix)) return value.slice(prefix.length);
  }
  return "";
}

function canonicalPhone(national: string, domain: PhoneDomain): string | null {
  return nationalPatterns[domain].test(national) ? countryPrefix + national : null;
}

export function isLocalPhoneDraft(value: string): boolean {
  return !nonDigits.test(value);
}

/** Validate the raw domestic form value and return the canonical API value. */
export function normalizeLocalPhone(value: string, domain: PhoneDomain): string | null {
  if (!value.startsWith(localPrefix) || !isLocalPhoneDraft(value)) return null;
  return canonicalPhone(nationalDigits(value), domain);
}

export function handlePhonePaste(
  event: ClipboardEvent<HTMLInputElement>,
  updatePhone: (value: string) => void,
) {
  const text = event.clipboardData.getData("text/plain");
  if (!nonDigits.test(text)) return;
  event.preventDefault();
  const { value, selectionStart, selectionEnd } = event.currentTarget;
  // A single-line input can discard newlines. Keep them visible as invalid spaces.
  updatePhone(
    value.slice(0, selectionStart ?? value.length) +
      text.replace(/[\r\n]/g, " ") +
      value.slice(selectionEnd ?? value.length),
  );
}

/** Normalize an internal CSA or Store contact value for comparison or lookup. */
export function normalizeVietnamPhone(value: string): string | null {
  return canonicalPhone(nationalDigits(value.trim()), "contact");
}

/** Format a stored phone for display, preserving unrecognized legacy values. */
export function formatVietnamPhone(value: string | null | undefined): string | null {
  if (value == null) return null;
  const national = nationalDigits(value.replace(/[ ().-]/g, ""));
  return nationalPatterns.contact.test(national) ? localPrefix + national : value;
}
