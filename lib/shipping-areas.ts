import { api } from "@/lib/client-api";
import type { ShippingSettings } from "@/lib/types";

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
