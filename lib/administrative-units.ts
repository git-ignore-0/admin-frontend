import { requireResponseList } from "@/lib/api-response";
import { api } from "@/lib/client-api";
import { invalidApiResponse, isApiObject } from "@/lib/client-error";
import type { AdministrativeUnit } from "@/lib/types";

export function administrativeWardSortName(name: string) {
  return name
    .trim()
    .replace(
      /^(?:phường|xã|thị trấn|đặc khu|ward|commune|township|special administrative zone|special zone)\s+/iu,
      "",
    )
    .replace(/\s+(?:ward|commune|township|special administrative zone|special zone)$/iu, "");
}

export function administrativeWardTypeRank(name: string) {
  const value = name.trim();
  if (/^(?:phường|ward)(?:\s|$)|\sward$/iu.test(value)) return 0;
  if (/^(?:xã|commune)(?:\s|$)|\scommune$/iu.test(value)) return 1;
  if (/^(?:thị trấn|township)(?:\s|$)|\stownship$/iu.test(value)) return 2;
  if (
    /^(?:đặc khu|special administrative zone|special zone)(?:\s|$)|\s(?:special administrative zone|special zone)$/iu.test(
      value,
    )
  )
    return 3;
  return 4;
}

function validateAdministrativeUnit(unit: AdministrativeUnit) {
  if (!isApiObject(unit) || typeof unit.code !== "string" || typeof unit.name !== "string") {
    throw invalidApiResponse();
  }
}

export function getAdministrativeProvinces(locale: "vi" | "en", signal?: AbortSignal) {
  return api<AdministrativeUnit[]>("administrative-units/provinces", {
    headers: { "Accept-Language": locale },
    signal,
  }).then((data) => requireResponseList(data, validateAdministrativeUnit));
}

export function getAdministrativeWards(
  provinceCode: string,
  locale: "vi" | "en",
  signal?: AbortSignal,
) {
  return api<AdministrativeUnit[]>(
    `administrative-units/wards?province=${encodeURIComponent(provinceCode)}`,
    {
      headers: { "Accept-Language": locale },
      signal,
    },
  ).then((data) => requireResponseList(data, validateAdministrativeUnit));
}

export function administrativeUnitName(units: AdministrativeUnit[], code: string | null) {
  if (!code) return null;
  return units.find((unit) => unit.code === code)?.name || null;
}
