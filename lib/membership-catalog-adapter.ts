import { apiEnvelope } from "@/lib/client-api";
import type { MembershipPackageItem, MembershipProduct, PaginationMeta } from "@/lib/types";

export type CSAQuotaGroup = MembershipProduct;
export type PackageAllowance = { quotaGroupId: string; quotaUnits: number };
export type MembershipPackageItemWrite = { product_id: string; quota_units: number };

export function legacyPackageItemView(item: MembershipPackageItem) {
  return {
    quotaGroupId: item.product_id,
    quotaUnits: item.quota_units,
    isActive: item.product_is_active ?? true,
    name: item.product_name,
    shortDescription: item.short_description,
    translations: item.product_translations ?? [],
    unitSize: item.unit_size,
    unitLabelVi: item.unit_label_vi,
    unitLabelEn: item.unit_label_en,
  };
}

export function fromLegacyPackageItems(items: MembershipPackageItem[]): PackageAllowance[] {
  return items.map((item) => ({ quotaGroupId: item.product_id, quotaUnits: item.quota_units }));
}

export function toLegacyPackageItems(allowances: PackageAllowance[]): MembershipPackageItemWrite[] {
  return allowances.map(({ quotaGroupId, quotaUnits }) => ({
    product_id: quotaGroupId,
    quota_units: quotaUnits,
  }));
}

export function listActiveQuotaGroups(page: number) {
  return apiEnvelope<CSAQuotaGroup[], PaginationMeta>(
    `admin/membership-products?page=${page}&active=true`,
  );
}
