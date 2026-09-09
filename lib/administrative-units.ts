import { api } from "@/lib/client-api";
import type { AdministrativeUnit } from "@/lib/types";

export function getAdministrativeProvinces(locale: "vi" | "en", signal?: AbortSignal) {
  return api<AdministrativeUnit[]>("administrative-units/provinces", {
    headers: { "Accept-Language": locale },
    signal,
  });
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
  );
}

export function administrativeUnitName(units: AdministrativeUnit[], code: string | null) {
  if (!code) return null;
  return units.find((unit) => unit.code === code)?.name || null;
}
