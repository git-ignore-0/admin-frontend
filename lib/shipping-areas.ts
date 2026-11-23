import { administrativeWardSortName } from "@/lib/administrative-units";
import { api } from "@/lib/client-api";
import type { ShippingSettings, SupportedShippingProvince } from "@/lib/types";

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

export async function getSupportedShippingAreas(
  locale: "vi" | "en",
  signal?: AbortSignal,
): Promise<SupportedShippingProvince[]> {
  const items = await api<SupportedShippingAreaPayload[]>(
    `public/shipping-areas?locale=${locale}`,
    { signal },
  );
  const collator = new Intl.Collator(locale, { sensitivity: "base", numeric: true });
  return items
    .map((province) => ({
      code: province.province_code,
      name: province.province_name,
      wards: province.wards
        .map((ward) => ({
          code: ward.ward_code,
          name: ward.ward_name,
          shipping_fee_vnd: ward.shipping_fee_vnd,
        }))
        .sort(
          (left, right) =>
            collator.compare(
              administrativeWardSortName(left.name),
              administrativeWardSortName(right.name),
            ) || collator.compare(left.name, right.name),
        ),
    }))
    .sort((left, right) => collator.compare(left.name, right.name));
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
