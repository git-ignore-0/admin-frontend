const PHONE_INPUT_PATTERN = /^\+?[0-9]*$/;
const VIETNAM_NATIONAL_PATTERN = /^[1-9][0-9]{8,9}$/;

export function acceptPhoneInput(value: string): string | null {
  return PHONE_INPUT_PATTERN.test(value) ? value : null;
}

export function normalizeVietnamPhone(value: string): string | null {
  const raw = value.trim();
  const national = raw.startsWith("+84")
    ? raw.slice(3)
    : raw.startsWith("84")
      ? raw.slice(2)
      : raw.startsWith("0")
        ? raw.slice(1)
        : "";
  return VIETNAM_NATIONAL_PATTERN.test(national) ? `+84${national}` : null;
}
