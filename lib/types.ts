export type Locale = "vi" | "en";

export type Dashboard = {
  upcoming: number;
  drafts: number;
  incomplete_translations: number;
  recent_activity: Array<{
    action: string;
    entity_type: string;
    entity_id: string;
    created_at: string;
  }>;
};

export type PaginationMeta = { page: number; page_size: number; total: number };

export type MembershipStatus = "scheduled" | "active" | "ended" | "revoked";
export type MembershipQuotaPolicy = "expire" | "rollover";

export type MembershipCustomer = {
  id: string;
  name: string;
  email: string;
  phone: string;
};

export type MembershipAuditActor = Pick<MembershipCustomer, "id" | "name" | "email">;

export type MembershipProduct = {
  id: string;
  name: string;
  short_description: string;
  translations: Array<{
    locale: "vi" | "en";
    name: string;
    short_description: string;
  }>;
  unit_size: string;
  unit_label_vi: string;
  unit_label_en: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type MembershipPackageItem = {
  product_id: string;
  product_name: string;
  short_description: string;
  product_translations?: MembershipProduct["translations"];
  unit_size: string;
  unit_label_vi: string;
  unit_label_en: string;
  quota_units: number;
  requested_locale?: "vi" | "en";
  content_locale?: "vi" | "en";
  is_fallback?: boolean;
  snapshot_complete?: boolean;
};

export type MembershipPackage = {
  id: string;
  name: string;
  description: string;
  translations: Array<{
    locale: "vi" | "en";
    name: string;
    description: string;
  }>;
  price_options: MembershipPackagePriceOption[];
  quota_policy: MembershipQuotaPolicy;
  items: MembershipPackageItem[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type MembershipPackagePriceOption = {
  id: string;
  duration_months: number;
  monthly_price_vnd: string;
  total_price_vnd: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type MembershipQuota = {
  product_id: string;
  product_name: string;
  unit_size: string;
  unit_label_vi: string;
  unit_label_en: string;
  quota_units_per_cycle: number;
  remaining_units: number;
  requested_locale?: "vi" | "en";
  content_locale?: "vi" | "en";
  is_fallback?: boolean;
  snapshot_complete?: boolean;
};

export type MembershipCycle = {
  sequence: number;
  start_date: string;
  end_date: string;
  granted_at: string;
  quotas: Array<{
    product_id: string;
    product_name: string;
    granted_units: number;
    remaining_units: number;
    expired_units: number;
    snapshot_complete?: boolean;
  }>;
};

export type AdminMembership = {
  id: string;
  user_id: string;
  package_id: string;
  price_option_id: string;
  user: MembershipCustomer;
  status: MembershipStatus;
  package_name: string;
  package_description: string;
  requested_locale?: "vi" | "en";
  content_locale?: "vi" | "en";
  is_fallback?: boolean;
  snapshot_complete?: boolean;
  price_option: Pick<
    MembershipPackagePriceOption,
    "duration_months" | "monthly_price_vnd" | "total_price_vnd"
  >;
  duration_months: number;
  monthly_price_vnd: string;
  total_price_vnd: string;
  farmbrite_order_reference: string;
  quota_policy: MembershipQuotaPolicy;
  start_date: string;
  end_date: string;
  activated_at: string;
  current_slot?: boolean | null;
  revoked_at?: string | null;
  revoked_by?: MembershipAuditActor | null;
  revoke_reason?: string;
  quota?: MembershipQuota[];
  cycles?: MembershipCycle[];
};

export type MembershipUsage = {
  id: string;
  membership_id: string;
  status: "applied" | "reversed";
  note: string;
  created_at: string;
  reversed_at: string | null;
  reversal?: { reason: string; created_at: string };
  lines: Array<{
    product_id: string;
    product_name: string;
    requested_locale?: "vi" | "en";
    content_locale?: "vi" | "en";
    is_fallback?: boolean;
    snapshot_complete?: boolean;
    units: number;
    allocations?: Array<{ cycle: number; units: number }>;
  }>;
};

export type AdminUserListItem = {
  id: string;
  name: string;
  email: string;
  phone: string;
  status: string;
  date_joined: string;
  points_balance: number;
};

export type InvitedAdminUser = {
  id: string;
  name: string;
  email: string;
  status: string;
  referred_at: string;
};

export type AdminUserDetail = AdminUserListItem & {
  referral_code: string;
  source: "organic" | "referred";
  referrer: { id: string; name: string } | null;
  invited_count: number;
  invited_users: InvitedAdminUser[];
};

export type PointDirection = "credit" | "debit";

export type PointTransaction = {
  id: string;
  direction: PointDirection;
  amount: number;
  message: string;
  actor: { id: string; name: string } | null;
  created_at: string;
};

export type RewardTranslation = {
  locale: Locale;
  name: string;
  short_description: string;
};

export type Reward = {
  id: string;
  point_cost: number;
  image: MediaAsset;
  position: number;
  is_active: boolean;
  translations: RewardTranslation[];
  created_at: string;
  updated_at: string;
};

export type RedemptionStatus = "pending" | "contacted" | "completed" | "rejected";

export type RedemptionTransaction = {
  id: string;
  direction: PointDirection;
  amount: number;
  template: string;
  message: string;
  created_at: string;
};

export type RedemptionListItem = {
  id: string;
  reward_id: string;
  reward_name_vi_snapshot: string;
  reward_name_en_snapshot: string;
  point_cost_snapshot: number;
  status: RedemptionStatus;
  rejection_message: string;
  user: { id: string; name: string; email: string; phone: string };
  created_at: string;
  contacted_at: string | null;
  completed_at: string | null;
  rejected_at: string | null;
  updated_at: string;
};

export type RedemptionDetail = RedemptionListItem & {
  points_balance: number;
  debit_transaction: RedemptionTransaction | null;
  refund_transaction: RedemptionTransaction | null;
  contacted_by: { id: string; name: string } | null;
  processed_by: { id: string; name: string } | null;
  internal_note: string;
};

export type PointHistoryMeta = PaginationMeta & { balance: number };

export type ExternalLink = {
  id?: number;
  kind: "facebook" | "youtube" | "store" | "forum" | "other";
  label: string;
  url: string;
  position: number;
  is_enabled: boolean;
};

export type SiteSettings = {
  version: number;
  email: string;
  is_email_enabled: boolean;
  phone_display: string;
  is_phone_enabled: boolean;
  links: ExternalLink[];
  updated_at: string;
};

export type MediaAsset = {
  id: string;
  url: string;
  width: number;
  height: number;
  variants: Array<{ url: string; width: number; height: number }>;
};

export type TiptapDocument = Record<string, unknown>;

export type WorkshopStatus = "upcoming" | "ongoing" | "completed";

export type WorkshopTranslation = {
  locale: Locale;
  title: string;
  summary: string;
  body: TiptapDocument;
  is_ready: boolean;
};

export type Workshop = {
  id: string;
  revision_id: string;
  revision_number: number;
  version: number;
  default_locale: Locale;
  start_at: string;
  end_at: string;
  event_timezone: string;
  effective_status: WorkshopStatus;
  registration_url: string;
  has_published_revision: boolean;
  translations: WorkshopTranslation[];
  updated_at: string;
};

export const emptyDocument: TiptapDocument = {
  type: "doc",
  content: [{ type: "paragraph" }],
};

export function emptyTranslation(locale: Locale): WorkshopTranslation {
  return {
    locale,
    title: "",
    summary: "",
    body: emptyDocument,
    is_ready: false,
  };
}
