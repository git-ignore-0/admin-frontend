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
