import { requireResponseEntity, requireResponseList } from "@/lib/api-response";
import { invalidApiResponse, isApiObject } from "@/lib/client-error";
import type { RedemptionDetail, RedemptionListItem, Reward } from "@/lib/types";

export function requireReward(reward: Reward, id?: string) {
  requireResponseEntity(reward, id);
  if (
    !Number.isSafeInteger(reward.point_cost) ||
    reward.point_cost <= 0 ||
    !Number.isSafeInteger(reward.position) ||
    typeof reward.is_active !== "boolean" ||
    !isApiObject(reward.image) ||
    typeof reward.image.url !== "string"
  )
    throw invalidApiResponse();
  requireResponseEntity(reward.image);
  requireResponseList(reward.image.variants, (variant) => {
    if (
      !isApiObject(variant) ||
      typeof variant.url !== "string" ||
      !Number.isSafeInteger(variant.width)
    )
      throw invalidApiResponse();
  });
  requireResponseList(reward.translations, (translation) => {
    if (
      !isApiObject(translation) ||
      !["vi", "en"].includes(translation.locale) ||
      typeof translation.name !== "string" ||
      typeof translation.short_description !== "string"
    )
      throw invalidApiResponse();
  });
  return reward;
}

export function requireRedemption<T extends RedemptionListItem>(row: T, id?: string) {
  requireResponseEntity(row, id);
  requireResponseEntity(row.user);
  if (
    !["pending", "contacted", "completed", "rejected"].includes(row.status) ||
    !Number.isSafeInteger(row.point_cost_snapshot) ||
    row.point_cost_snapshot <= 0 ||
    ![
      row.user.name,
      row.user.phone,
      row.reward_name_vi_snapshot,
      row.reward_name_en_snapshot,
      row.rejection_message,
    ].every((text) => typeof text === "string") ||
    (row.user.email !== null && typeof row.user.email !== "string")
  )
    throw invalidApiResponse();
  return row;
}

export function requireRedemptionDetail(row: RedemptionDetail, id: string) {
  requireRedemption(row, id);
  if (!Number.isSafeInteger(row.points_balance) || typeof row.internal_note !== "string") {
    throw invalidApiResponse();
  }
  for (const entry of [row.debit_transaction, row.refund_transaction]) {
    if (entry === null) continue;
    requireResponseEntity(entry);
    if (
      !["credit", "debit"].includes(entry.direction) ||
      !Number.isSafeInteger(entry.amount) ||
      entry.amount <= 0
    ) {
      throw invalidApiResponse();
    }
  }
  return row;
}
