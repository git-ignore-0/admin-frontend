const countryPrefix = "+84";
const localPrefix = "0";
const storedPrefixes = [countryPrefix, countryPrefix.slice(1), localPrefix];
const nonDigits = /[^0-9]/;
const nationalPatterns = {
  contact: /^[1-9][0-9]{8,9}$/,
  identity: /^(?:[35789][0-9]{8}|2[0-9]{9})$/,
};
type PhoneDomain = keyof typeof nationalPatterns;

export const MAX_EDITABLE_PHONE_DIGITS = 10;
export type EditablePhone = {
  value: string;
  entry: "ready" | "rejected" | "composing";
  /** Set by a host for an unchanged stored value, including legacy numbers. */
  untouched?: true;
};

export function sanitizeEditablePhoneDigits(value: string): string {
  return value.replace(/[^0-9]/g, "");
}

export function normalizeEditablePhone({ value, entry }: EditablePhone): string | null {
  // The identity domain also accepts 11-digit landlines. The editable limit
  // narrows it to the domestic mobile prefixes without changing that contract.
  return entry === "ready" && value.length === MAX_EDITABLE_PHONE_DIGITS
    ? normalizeLocalPhone(value, "identity")
    : null;
}

export function isEditablePhoneValid(phone: EditablePhone, required = false): boolean {
  return (
    phone.entry === "ready" &&
    ((!required && phone.value === "") || normalizeEditablePhone(phone) !== null)
  );
}

function nationalDigits(value: string): string {
  for (const prefix of storedPrefixes) {
    if (value.startsWith(prefix)) return value.slice(prefix.length);
  }
  return "";
}

function canonicalPhone(national: string, domain: PhoneDomain): string | null {
  return nationalPatterns[domain].test(national) ? countryPrefix + national : null;
}

/** Validate the raw domestic form value and return the canonical API value. */
export function normalizeLocalPhone(value: string, domain: PhoneDomain): string | null {
  if (!value.startsWith(localPrefix) || nonDigits.test(value)) return null;
  return canonicalPhone(nationalDigits(value), domain);
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
