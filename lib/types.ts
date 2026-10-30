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

export type StoreTranslation = { locale: "vi" | "en"; name: string; description: string };

export type StoreCategory = {
  id: string;
  parent_id: string | null;
  slug: string;
  sort_order: number;
  is_active: boolean;
  depth: number;
  has_children: boolean;
  product_count: number;
  translations: StoreTranslation[];
  created_at: string;
  updated_at: string;
};

export type StoreProduct = {
  id: string;
  category_id: string;
  category_slug: string;
  sku: string;
  slug: string;
  unit_size: string;
  unit_label_vi: string;
  unit_label_en: string;
  retail_price_vnd: string;
  csa_quota_group_id: string | null;
  csa_quota_group: Pick<MembershipProduct, "id" | "name" | "translations"> | null;
  csa_quota_cost: number;
  primary_image_id: string | null;
  primary_image: MediaAsset | null;
  is_active: boolean;
  is_published: boolean;
  translations: Array<StoreTranslation & { short_description: string }>;
  created_at: string;
  updated_at: string;
};

export type MembershipStatus = "scheduled" | "active" | "ended" | "revoked";
export type MembershipQuotaPolicy = "expire" | "rollover";

export type WebsiteAccount = {
  id: string;
  name: string;
  email: string;
};

export type CSACustomerStatus = "active" | "scheduled" | "history_only" | "new";

export type CSAMembershipSummary = {
  id: string;
  status: MembershipStatus;
  start_date?: string;
};

export type MembershipCustomer = {
  id: string;
  name: string;
  phone: string | null;
  user: WebsiteAccount | null;
};

export type CSACustomer = MembershipCustomer & {
  province_code: string | null;
  ward_code: string | null;
  address: string;
  created_at: string;
  updated_at: string;
  current_membership: CSAMembershipSummary | null;
  next_scheduled_membership: CSAMembershipSummary | null;
  status: CSACustomerStatus;
  memberships?: AdminMembership[];
};

export type MembershipAuditActor = WebsiteAccount;

export type CSAContractSummary = {
  id: string;
  reference_code: string;
  status: "active" | "revoked";
};

export type CSAContractVersion = {
  id: string;
  version_number: number;
  version_reason: "issued" | "payment_confirmed" | "membership_revoked";
  contract_status: "active" | "revoked";
  created_at: string;
  available_locales: Array<"vi" | "en">;
  paid_amount?: string;
  remaining_amount?: string;
  paid_cycles?: number;
  total_cycles?: number;
};

export type AdminCSAContract = CSAContractSummary & {
  available_locales: Array<"vi" | "en">;
  issued_at: string;
  revoked_at: string | null;
  revocation_reason: string | null;
  current_version?: CSAContractVersion | null;
  versions?: CSAContractVersion[];
};

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
  product_is_active?: boolean;
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
  payment_plans?: AdminMembershipPaymentPlan[];
};

export type AdminMembershipPaymentPlan = {
  id: string;
  price_option_id: string;
  name: string;
  payment_type: "full" | "installment";
  total_amount: string;
  installment_count: number;
  initial_payment_amount: string | null;
  sort_order: number;
  is_active: boolean;
  in_use: boolean;
  installments: Array<{ sequence: number; amount: string; cycle_count: number }>;
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
  customer_id: string;
  user_id: string | null;
  package_id: string;
  price_option_id: string;
  customer: MembershipCustomer;
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
  contract?: CSAContractSummary | null;
};

export type CSAPurchaseRequestStatus =
  "pending" | "payment_confirmed" | "approved" | "rejected" | "expired";

export type CSAPurchaseRefundStatus = "not_applicable" | "pending" | "completed";

export type CSAPurchaseCustomerResolution =
  "keep_existing" | "use_request_data" | "reject_conflict";

export type CSAPurchasePayment = {
  id: string;
  installment_sequence: number;
  amount_due: string;
  amount_paid: string | null;
  cycle_count: number;
  status: "pending" | "reported" | "confirmed" | "rejected" | "overdue";
  due_at: string | null;
  confirmed_at: string | null;
  confirmed_by: { id: string; name: string } | null;
  rejected_at: string | null;
  rejected_by?: { id: string; name: string } | null;
  rejection_reason: string | null;
  note: string | null;
};

export type CSAPurchasePaymentSummary = {
  total_amount: string;
  paid_amount: string;
  remaining_amount: string;
  confirmed_installments: number;
  installment_count: number;
  paid_cycles: number;
  total_cycles: number;
};

export type CSAPurchaseRequest = {
  id: string;
  request_code: string;
  status: CSAPurchaseRequestStatus;
  payment_plan?: {
    id: string;
    name: string;
    payment_type: "full" | "installment";
    total_amount: string;
    installment_count: number;
    initial_payment_amount: string | null;
    installments: Array<{ sequence: number; amount: string; cycle_count: number }>;
  } | null;
  payments?: CSAPurchasePayment[];
  payment_summary?: CSAPurchasePaymentSummary | null;
  contract?: CSAContractSummary | null;
  user: { id: string; name: string; email: string } | null;
  customer_id: string | null;
  membership_id: string | null;
  name: string;
  phone: string;
  province_code: string;
  ward_code: string;
  address: string;
  package_snapshot: { id: string; name: string };
  price_option_snapshot: { id: string; name: string; duration_months: number };
  amount: string;
  currency: string;
  transfer_content: string;
  bank_bin: string;
  bank_name: string;
  account_number: string;
  account_name: string;
  payment_config_version: number;
  expires_at: string | null;
  expired_at: string | null;
  expired_reason: string | null;
  payment_confirmed_at: string | null;
  approved_at: string | null;
  rejected_at: string | null;
  approved_by: { id: string; name: string } | null;
  rejected_by: { id: string; name: string } | null;
  rejection_reason: string;
  refund_status: CSAPurchaseRefundStatus;
  refund_marked_at: string | null;
  refund_marked_by: { id: string; name: string } | null;
  refund_note: string | null;
  created_at: string;
  updated_at: string;
};

export type CSAPurchaseResolutionContext = {
  customer: {
    id: string;
    name: string;
    phone: string;
    province_code: string;
    ward_code: string;
    address: string;
    memberships: Array<{
      id: string;
      package_name: string;
      status: MembershipStatus;
      start_date: string;
      end_date: string;
    }>;
  };
  request: {
    name: string;
    phone: string;
    province_code: string;
    ward_code: string;
    address: string;
  };
};

export type MembershipBank = {
  bin: string;
  name: string;
  short_name: string;
  code: string;
};

export type MembershipPaymentSettings = {
  key: "default";
  direct_transfer_enabled: boolean;
  bank_bin: string;
  bank_name: string;
  account_number: string;
  account_name: string;
  version: number;
  updated_at: string | null;
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
  province_code: string;
  ward_code: string;
  address: string;
  has_csa_customer: boolean;
  status: string;
  date_joined: string;
  points_balance: number;
};

export type AdministrativeUnit = {
  code: string;
  name: string;
};

export type SupportedShippingWard = AdministrativeUnit & {
  shipping_fee_vnd: string;
};

export type SupportedShippingProvince = AdministrativeUnit & {
  wards: SupportedShippingWard[];
};

export type ShippingArea = {
  id: string;
  province_code: string;
  province_name_vi: string;
  province_name_en: string;
  ward_code: string;
  ward_name_vi: string;
  ward_name_en: string;
  shipping_fee_vnd: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type ShippingSettings = {
  province_code: string;
  province_name_vi: string;
  province_name_en: string;
  default_shipping_fee_vnd: string;
  is_active: boolean;
  overrides: ShippingArea[];
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

export type TestimonialType = "customer" | "farmer";
export type TestimonialStatus = "draft" | "published" | "hidden";

export type TestimonialTranslation = {
  locale: Locale;
  role: string;
  location: string;
  quote: string;
  full_story: string;
  is_complete: boolean;
};

export type Testimonial = {
  id: string;
  version: number;
  type: TestimonialType;
  status: TestimonialStatus;
  display_name: string;
  image: MediaAsset | null;
  featured: boolean;
  sort_order: number;
  published_at: string | null;
  consent_confirmed: boolean;
  translations: TestimonialTranslation[];
  created_by: { id: string; name: string; email: string } | null;
  updated_by: { id: string; name: string; email: string } | null;
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
  kind: "facebook" | "youtube" | "store" | "forum" | "farms" | "other";
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

export type TrackerFarm = {
  id: string;
  name_en: string;
  name_vi: string;
  location_en: string;
  location_vi: string;
  description_en: string;
  description_vi: string;
  image: MediaAsset | null;
  photos?: MediaAsset[];
  signup_count: number;
  one_month_signup_count?: number;
  is_visible: boolean;
  sort_order: number;
  version: number;
  created_at: string;
  updated_at: string;
};

export type Farm = {
  id: string;
  name_en: string;
  name_vi: string;
  location_en: string;
  location_vi: string;
  description_en: string;
  description_vi: string;
  image: MediaAsset | null;
  photos: MediaAsset[];
  is_active: boolean;
  version: number;
  created_at: string;
  updated_at: string;
};

export type FarmProduct = {
  id: string;
  farm_id: string;
  product_id: string;
  sku: string;
  name_vi: string;
  name_en: string;
  unit_size: string;
  unit_label_vi: string;
  unit_label_en: string;
  is_active: boolean;
};

export type AvailableFarmProduct = Pick<FarmProduct, "sku" | "name_vi" | "name_en"> & {
  id: string;
};

export type FarmWeeklySupply = {
  id?: string;
  week_start: string;
  quantity_units: number;
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
