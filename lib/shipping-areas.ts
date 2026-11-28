import { queryOptions } from "@tanstack/react-query";

import { administrativeUnitComparators } from "@/lib/administrative-units";
import { api } from "@/lib/client-api";
import type { Locale, ShippingSettings, SupportedShippingProvince } from "@/lib/types";

type SupportedShippingAreaPayload = {
  province_code: string;
  province_name: string;
  wards: Array<{
    ward_code: string;
    ward_name: string;
    shipping_fee_vnd: string;
  }>;
};

export type ShippingOverrideInput = {
  ward_code: string;
  shipping_fee_vnd: string | null;
  is_active: boolean;
};

export type ShippingSettingsInput = {
  default_shipping_fee_vnd: string;
  is_active: boolean;
  overrides: ShippingOverrideInput[];
};

export const supportedShippingAreasKey = ["supported-shipping-areas"] as const;

export function supportedShippingAreasOptions(locale: Locale) {
  return queryOptions({
    queryKey: [...supportedShippingAreasKey, locale] as const,
    queryFn: ({ signal }) => getSupportedShippingAreas(locale, signal),
    staleTime: 30_000,
  });
}

export function findSupportedShippingLocation(
  areas: SupportedShippingProvince[] | undefined,
  address: { province_code: string; ward_code: string },
) {
  const province = areas?.find(({ code }) => code === address.province_code);
  const ward = province?.wards.find(({ code }) => code === address.ward_code);
  return { province, ward };
}

export async function getSupportedShippingAreas(
  locale: Locale,
  signal?: AbortSignal,
): Promise<SupportedShippingProvince[]> {
  const items = await api<SupportedShippingAreaPayload[]>(
    `public/shipping-areas?locale=${locale}`,
    { signal },
  );
  const { compareProvinces, compareWards } = administrativeUnitComparators(locale);
  return items
    .filter((province) => province.wards.length > 0)
    .map((province) => ({
      code: province.province_code,
      name: province.province_name,
      wards: province.wards
        .map((ward) => ({
          code: ward.ward_code,
          name: ward.ward_name,
          shipping_fee_vnd: ward.shipping_fee_vnd,
        }))
        .sort(compareWards),
    }))
    .sort(compareProvinces);
}

export function getShippingSettings(provinceCode: string, signal?: AbortSignal) {
  const path = `admin/shipping-settings/${encodeURIComponent(provinceCode)}`;
  return signal ? api<ShippingSettings>(path, { signal }) : api<ShippingSettings>(path);
}

export function saveShippingSettings(provinceCode: string, payload: ShippingSettingsInput) {
  return api<ShippingSettings>(`admin/shipping-settings/${encodeURIComponent(provinceCode)}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}
