import { useQuery } from "@tanstack/react-query";

import {
  administrativeUnitName,
  getAdministrativeProvinces,
  getAdministrativeWards,
} from "@/lib/administrative-units";

const staleTime = 5 * 60 * 1000;

export function useAdministrativeUnitNames(
  provinceCode: string | null,
  wardCode: string | null,
  locale: "vi" | "en",
) {
  const provinces = useQuery({
    queryKey: ["administrative-units", locale, "provinces"],
    enabled: Boolean(provinceCode),
    queryFn: ({ signal }) => getAdministrativeProvinces(locale, signal),
    staleTime,
  });
  const wards = useQuery({
    queryKey: ["administrative-units", locale, provinceCode, "wards"],
    enabled: Boolean(provinceCode && wardCode),
    queryFn: ({ signal }) => getAdministrativeWards(provinceCode ?? "", locale, signal),
    staleTime,
  });
  return {
    provinceName: provinces.data ? administrativeUnitName(provinces.data, provinceCode) : null,
    wardName: wards.data ? administrativeUnitName(wards.data, wardCode) : null,
  };
}
