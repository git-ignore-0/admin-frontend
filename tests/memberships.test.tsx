import {
  act,
  cleanup,
  createEvent,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AdminI18nProvider } from "@/components/admin-i18n-provider";
import { MembershipPackageDetail } from "@/components/membership-catalog-detail";
import {
  MembershipPackageEditor,
  MembershipProductEditor,
} from "@/components/membership-catalog-editors";
import { MembershipPackageList } from "@/components/membership-catalog-lists";
import { MembershipDetail } from "@/components/membership-detail";
import { ToastProvider } from "@/components/toast-provider";
import { api, apiEnvelope, apiFile } from "@/lib/client-api";
import type {
  AdminMembership,
  AdminUserListItem,
  MembershipCycle,
  MembershipPackage,
  MembershipProduct,
  MembershipUsage,
  PaginationMeta,
} from "@/lib/types";

const navigation = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));

vi.mock("@/lib/client-api", () => ({ api: vi.fn(), apiEnvelope: vi.fn(), apiFile: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: navigation.push, replace: navigation.replace, refresh: vi.fn() }),
  usePathname: () => "/memberships",
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

function providers(children: React.ReactNode, locale: "vi" | "en" = "en") {
  return render(
    <AdminI18nProvider initialLocale={locale}>
      <ToastProvider>{children}</ToastProvider>
    </AdminI18nProvider>,
  );
}

const product: MembershipProduct = {
  id: "317b49bc-5cc6-4c25-b73b-14d925d9d518",
  name: "Vegetable basket",
  short_description: "Fresh vegetables",
  translations: [
    { locale: "vi", name: "Giỏ rau", short_description: "Rau tươi" },
    { locale: "en", name: "Vegetable basket", short_description: "Fresh vegetables" },
  ],
  unit_size: "0.500",
  unit_label_vi: "kg",
  unit_label_en: "kg",
  is_active: true,
  created_at: "2026-07-20T02:00:00Z",
  updated_at: "2026-07-21T02:00:00Z",
};

const activeOption = {
  id: "a0c0313a-85df-4c29-930a-f19a05f3d8c4",
  duration_months: 6,
  monthly_price_vnd: "750000",
  total_price_vnd: "4500000",
  is_active: true,
  sort_order: 0,
  created_at: "2026-07-20T02:00:00Z",
  updated_at: "2026-07-21T02:00:00Z",
};

const historicalOption = {
  ...activeOption,
  id: "d7cb3209-1433-407d-8a7c-e9683aa83823",
  monthly_price_vnd: "769000",
  total_price_vnd: "4614000",
  is_active: false,
  sort_order: 1,
};

const packageItem: MembershipPackage = {
  id: "f37b7348-77af-4a03-86b2-7dfecb1552be",
  name: "Six month CSA",
  description: "Seasonal vegetables",
  translations: [
    { locale: "vi", name: "Gói CSA sáu tháng", description: "Rau theo mùa" },
    { locale: "en", name: "Six month CSA", description: "Seasonal vegetables" },
  ],
  price_options: [activeOption, historicalOption],
  quota_policy: "expire",
  items: [
    {
      product_id: product.id,
      product_name: product.name,
      short_description: product.short_description,
      product_translations: product.translations,
      unit_size: product.unit_size,
      unit_label_vi: product.unit_label_vi,
      unit_label_en: product.unit_label_en,
      quota_units: 2,
    },
  ],
  is_active: true,
  created_at: "2026-07-20T02:00:00Z",
  updated_at: "2026-07-21T02:00:00Z",
};

const user: AdminUserListItem = {
  id: "58cbea40-4749-4400-9fa3-188de573abaf",
  name: "Green Member",
  email: "green@example.com",
  phone: "0918765432",
  province_code: "79",
  ward_code: "26734",
  address: "12 Main Street",
  has_csa_customer: false,
  status: "active",
  date_joined: "2026-01-01T00:00:00Z",
  points_balance: 0,
};

const membership: AdminMembership = {
  id: "87703641-2dce-4cac-8fc4-91e55f03e95f",
  customer_id: "24803641-2dce-4cac-8fc4-91e55f03e95f",
  user_id: user.id,
  package_id: packageItem.id,
  price_option_id: activeOption.id,
  customer: {
    id: "24803641-2dce-4cac-8fc4-91e55f03e95f",
    name: user.name,
    phone: user.phone,
    user: { id: user.id, name: user.name, email: user.email },
  },
  status: "active",
  package_name: packageItem.name,
  package_description: packageItem.description,
  price_option: {
    duration_months: 6,
    monthly_price_vnd: "750000",
    total_price_vnd: "4500000",
  },
  duration_months: 6,
  monthly_price_vnd: "750000",
  total_price_vnd: "4500000",
  farmbrite_order_reference: "FB-2026-0001",
  quota_policy: "expire",
  start_date: "2026-08-04",
  end_date: "2027-02-04",
  activated_at: "2026-08-04T02:00:00Z",
  quota: [
    {
      product_id: product.id,
      product_name: product.name,
      unit_size: product.unit_size,
      unit_label_vi: product.unit_label_vi,
      unit_label_en: product.unit_label_en,
      quota_units_per_cycle: 2,
      remaining_units: 2,
    },
  ],
  cycles: [],
};

function membershipCycle(
  sequence: number,
  startDate: string,
  endDate: string,
  granted: number,
  remaining: number,
  expired = 0,
): MembershipCycle {
  return {
    sequence,
    start_date: startDate,
    end_date: endDate,
    granted_at: `${startDate}T00:00:00Z`,
    quotas: [
      {
        product_id: product.id,
        product_name: product.name,
        granted_units: granted,
        remaining_units: remaining,
        expired_units: expired,
      },
    ],
  };
}

const meta: PaginationMeta = { page: 1, page_size: 30, total: 1 };

describe("CSA quota group editor", () => {
  it("explains why a group used by an active package cannot be disabled", async () => {
    vi.mocked(api)
      .mockResolvedValueOnce(product)
      .mockRejectedValueOnce(new Error("csa_quota_group_in_use"));
    providers(<MembershipProductEditor productId={product.id} />);
    await screen.findByDisplayValue("Vegetable basket");
    fireEvent.click(screen.getByLabelText("Active"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This quota group is used by an active CSA package or a store product.",
    );
  });
});

function mockCatalogLookups() {
  vi.mocked(apiEnvelope).mockImplementation(async (path) => {
    if (path.startsWith("admin/membership-products")) return { data: [product], meta };
    if (path.startsWith("admin/membership-packages")) return { data: [packageItem], meta };
    throw new Error(`Unexpected envelope request: ${path}`);
  });
}

async function fillBilingualNames() {
  fireEvent.change(screen.getByLabelText("Package name *"), { target: { value: "CSA package" } });
  fireEvent.click(screen.getByRole("tab", { name: /Tiếng Việt/ }));
  fireEvent.change(screen.getByLabelText("Package name *"), { target: { value: "Gói CSA" } });
}

describe("CSA package price options", () => {
  it("blocks saving a package whose existing quota group is inactive", async () => {
    const inactivePackage = {
      ...packageItem,
      items: [{ ...packageItem.items[0], product_is_active: false }],
    };
    vi.mocked(api).mockResolvedValue(inactivePackage);
    vi.mocked(apiEnvelope).mockResolvedValue({ data: [], meta: { ...meta, total: 0 } });
    providers(<MembershipPackageEditor packageId={packageItem.id} />);
    await screen.findByLabelText("CSA quota group 1");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Inactive");
    expect(vi.mocked(api).mock.calls.filter(([, init]) => init?.method === "PATCH")).toHaveLength(
      0,
    );
  });
  it("formats VND only on blur, previews with BigInt, and sends only writable option fields", async () => {
    mockCatalogLookups();
    vi.mocked(api).mockResolvedValue(packageItem);
    providers(<MembershipPackageEditor />);
    await fillBilingualNames();

    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
    const monthly = screen.getByLabelText("Monthly price *");
    expect(monthly).toHaveAttribute("maxLength", "19");
    expect(screen.queryByLabelText("Sort order")).not.toBeInTheDocument();
    fireEvent.focus(monthly);
    fireEvent.change(monthly, { target: { value: "750000" } });
    expect(monthly).toHaveValue("750000");
    fireEvent.blur(monthly);
    expect(monthly).toHaveValue("₫750,000");
    expect(screen.getByText("₫4,500,000")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("CSA quota group 1"), { target: { value: product.id } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(api).toHaveBeenCalled());
    const call = vi.mocked(api).mock.calls.find(([path]) => path === "admin/membership-packages");
    const body = JSON.parse(String(call?.[1]?.body));
    expect(body.price_options).toEqual([
      {
        duration_months: 6,
        monthly_price_vnd: "750000",
        is_active: true,
        sort_order: 0,
      },
    ]);
    expect(JSON.stringify(body)).not.toContain("total_price_vnd");
    expect(JSON.stringify(body)).not.toContain("active_duration_key");
  });

  it("keeps each price option in one desktop row with compact duration and an accessible icon remove action", () => {
    mockCatalogLookups();
    providers(<MembershipPackageEditor />);

    const optionCard = screen.getByRole("group", { name: "Option 1" });
    const row = optionCard.querySelector(".price-option-grid") as HTMLElement;
    expect(row).toBeTruthy();
    expect(within(row).getByLabelText("Months *").closest("label")).toHaveClass(
      "price-option-duration-field",
    );
    expect(within(row).getByLabelText("Months *")).toHaveClass("price-option-duration-input");
    expect(within(row).getByLabelText("Monthly price *")).toHaveClass(
      "price-option-monthly-price-input",
    );
    expect(within(row).getByText("Total price (preview)")).toBeVisible();
    expect(within(row).getByRole("checkbox", { name: "Active" })).toBeVisible();
    const remove = within(row).getByRole("button", { name: "Remove price option 1" });
    expect(remove).toHaveClass("icon-only-action", "price-option-remove-action");
    expect(remove).toHaveAttribute("title", "Remove price option 1");
    expect(remove).toHaveTextContent("");
    expect(remove.querySelector("svg")).toHaveAttribute("aria-hidden", "true");

    const css = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8");
    expect(css).toMatch(/\.price-option-duration-field \{\s*max-width: 96px;/u);
    expect(css).toMatch(/\.price-option-grid \{[\s\S]*?minmax\(80px, 96px\)/u);
    expect(css).toMatch(
      /\.price-option-monthly-price-input \{[\s\S]*?width: min\(100%, 13\.75rem\);[\s\S]*?field-sizing: content;[\s\S]*?white-space: nowrap;/u,
    );
    expect(css).not.toContain("minmax(11rem, 1fr)");
    expect(css).toMatch(/@media \(max-width: 680px\) \{[\s\S]*?\.price-option-grid/u);
    expect(css).toMatch(
      /@media \(max-width: 680px\) \{[\s\S]*?\.price-option-monthly-price-input \{[\s\S]*?width: 100%;/u,
    );

    cleanup();
    mockCatalogLookups();
    providers(<MembershipPackageEditor />, "vi");
    expect(screen.getByRole("button", { name: "Bỏ lựa chọn giá 1" })).toHaveAttribute(
      "title",
      "Bỏ lựa chọn giá 1",
    );
  });

  it("does not submit the package editor when Enter is pressed in a price input", async () => {
    mockCatalogLookups();
    providers(<MembershipPackageEditor />);

    const monthly = screen.getByLabelText("Monthly price *");
    const enter = createEvent.keyDown(monthly, {
      bubbles: true,
      cancelable: true,
      key: "Enter",
    });
    fireEvent(monthly, enter);

    expect(enter.defaultPrevented).toBe(true);
    expect(api).not.toHaveBeenCalled();
  });

  it("blocks duplicate active durations and requires one active option", async () => {
    mockCatalogLookups();
    providers(<MembershipPackageEditor />);
    await fillBilingualNames();
    fireEvent.change(screen.getByLabelText("Monthly price *"), { target: { value: "750000" } });
    fireEvent.change(screen.getByLabelText("CSA quota group 1"), { target: { value: product.id } });
    fireEvent.click(screen.getByRole("button", { name: "+ Add price option" }));
    const durations = screen.getAllByLabelText("Months *");
    const prices = screen.getAllByLabelText("Monthly price *");
    fireEvent.change(durations[1], { target: { value: "6" } });
    fireEvent.change(prices[1], { target: { value: "800000" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Two active options cannot have the same duration",
    );
    expect(api).not.toHaveBeenCalled();

    screen
      .getAllByRole("checkbox", { name: "Active" })
      .forEach((checkbox) => fireEvent.click(checkbox));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("at least one active price option");
  });

  it("blocks total overflow before sending", async () => {
    mockCatalogLookups();
    providers(<MembershipPackageEditor />);
    await fillBilingualNames();
    fireEvent.change(screen.getByLabelText("Months *"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("Monthly price *"), {
      target: { value: "5000000000000000000" },
    });
    fireEvent.change(screen.getByLabelText("CSA quota group 1"), { target: { value: product.id } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("total price exceeds");
    expect(api).not.toHaveBeenCalled();
  });

  it("groups historical inactive options and preserves backend conflicts without clearing the form", async () => {
    mockCatalogLookups();
    vi.mocked(api).mockImplementation(async (path, init) => {
      if (!init && path.includes(packageItem.id)) return packageItem;
      const error = Object.assign(new Error("validation_error"), {
        status: 400,
        field: "price_options",
      });
      throw error;
    });
    providers(<MembershipPackageEditor packageId={packageItem.id} />);
    expect(await screen.findByRole("heading", { name: "Inactive history" })).toBeInTheDocument();
    const monthly = screen.getAllByLabelText("Monthly price *")[0];
    fireEvent.focus(monthly);
    fireEvent.change(monthly, { target: { value: "800000" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Sold options cannot change");
    expect(monthly).toHaveValue("800000");
  });

  it("deactivates a sold option and creates a new active price for the same duration", async () => {
    mockCatalogLookups();
    vi.mocked(api).mockImplementation(async (path, init) => {
      if (!init && path.includes(packageItem.id)) return packageItem;
      return packageItem;
    });
    providers(<MembershipPackageEditor packageId={packageItem.id} />);
    const oldOption = await screen.findByRole("group", { name: "Option 1" });
    fireEvent.click(within(oldOption).getByRole("checkbox", { name: "Active" }));
    fireEvent.click(screen.getByRole("button", { name: "+ Add price option" }));
    const replacement = screen.getByRole("group", { name: "Option 3" });
    fireEvent.change(within(replacement).getByLabelText("Months *"), {
      target: { value: "6" },
    });
    fireEvent.change(within(replacement).getByLabelText("Monthly price *"), {
      target: { value: "800000" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(
        vi
          .mocked(api)
          .mock.calls.some(
            ([path, init]) => path.includes(packageItem.id) && init?.method === "PATCH",
          ),
      ).toBe(true),
    );
    const update = vi
      .mocked(api)
      .mock.calls.find(([path, init]) => path.includes(packageItem.id) && init?.method === "PATCH");
    const options = JSON.parse(String(update?.[1]?.body)).price_options;
    expect(options[0]).toMatchObject({ id: activeOption.id, is_active: false });
    expect(options[2]).toMatchObject({
      duration_months: 6,
      monthly_price_vnd: "800000",
      is_active: true,
    });
  });

  it("shows active and historical prices in list/detail", async () => {
    vi.mocked(apiEnvelope).mockResolvedValue({ data: [packageItem], meta });
    const list = providers(<MembershipPackageList />);
    expect(await screen.findByText(/6 months · ₫750,000\/month/)).toBeInTheDocument();
    expect(screen.queryByText(/769,000\/month/)).toBeNull();
    list.unmount();
    vi.mocked(api).mockResolvedValue(packageItem);
    providers(<MembershipPackageDetail packageId={packageItem.id} />);
    expect(await screen.findByRole("heading", { name: "Inactive history" })).toBeInTheDocument();
    expect(screen.getByText("₫4,614,000")).toBeInTheDocument();
  });

  it("keeps package detail limited to price options without payment-plan requests", async () => {
    const oneMonthOption = {
      ...activeOption,
      id: "e7cb3209-1433-407d-8a7c-e9683aa83823",
      duration_months: 1,
      monthly_price_vnd: "800000",
      total_price_vnd: "800000",
    };
    vi.mocked(api).mockResolvedValue({
      ...packageItem,
      price_options: [oneMonthOption, activeOption],
    });

    providers(<MembershipPackageDetail packageId={packageItem.id} />);

    expect(await screen.findAllByText("₫800,000")).toHaveLength(2);
    expect(screen.queryByText(/Payment methods/)).toBeNull();
    expect(vi.mocked(api).mock.calls.map(([path]) => path)).toEqual([
      `admin/membership-packages/${packageItem.id}`,
    ]);
  });

  it("renders payment plans only inside saved multi-month price options without N+1 requests", async () => {
    mockCatalogLookups();
    const oneMonthOption = {
      ...activeOption,
      id: "e7cb3209-1433-407d-8a7c-e9683aa83823",
      duration_months: 1,
      monthly_price_vnd: "800000",
      total_price_vnd: "800000",
    };
    vi.mocked(api).mockResolvedValue({
      ...packageItem,
      price_options: [oneMonthOption, activeOption],
    });

    providers(<MembershipPackageEditor packageId={packageItem.id} />);

    const first = await screen.findByRole("group", { name: "Option 1" });
    const second = screen.getByRole("group", { name: "Option 2" });
    expect(within(first).queryByText(/Payment methods/)).toBeNull();
    expect(within(second).getByRole("heading", { name: "Payment methods" })).toBeVisible();
    expect(vi.mocked(api).mock.calls.map(([path]) => path)).toEqual([
      `admin/membership-packages/${packageItem.id}`,
    ]);
  });

  it("compares savings against the current price option without loading another package", async () => {
    mockCatalogLookups();
    const oneMonthOption = {
      ...activeOption,
      id: "e7cb3209-1433-407d-8a7c-e9683aa83823",
      duration_months: 1,
      monthly_price_vnd: "1000000",
      total_price_vnd: "1000000",
    };
    vi.mocked(api).mockResolvedValue({
      ...packageItem,
      price_options: [oneMonthOption, activeOption],
    });

    providers(<MembershipPackageEditor packageId={packageItem.id} />);
    const multiMonth = await screen.findByRole("group", { name: "Option 2" });
    fireEvent.click(within(multiMonth).getByRole("button", { name: "Add method" }));
    const comparison = within(multiMonth)
      .getByRole("heading", { name: "Savings comparison" })
      .closest(".payment-plan-comparison") as HTMLElement;
    fireEvent.change(within(multiMonth).getByRole("textbox", { name: /^Package total value/ }), {
      target: { value: "4000000" },
    });
    fireEvent.change(within(multiMonth).getByRole("textbox", { name: /^Amount per payment/ }), {
      target: { value: "4000000" },
    });
    expect(within(comparison).getByText("₫4,500,000")).toBeVisible();
    expect(within(comparison).getByText(/₫500,000 · 11\.11%/)).toBeVisible();
    expect(vi.mocked(api).mock.calls.map(([path]) => path)).toEqual([
      `admin/membership-packages/${packageItem.id}`,
    ]);
  });

  it("does not use another package price when the current option has its own baseline", async () => {
    mockCatalogLookups();
    const otherId = "c0c0313a-85df-4c29-930a-f19a05f3d8c4";
    const otherOneMonth = {
      ...activeOption,
      id: "e7cb3209-1433-407d-8a7c-e9683aa83823",
      duration_months: 1,
      monthly_price_vnd: "1000000",
      total_price_vnd: "1000000",
    };
    vi.mocked(api).mockImplementation(async (path) => {
      if (path === `admin/membership-packages/${packageItem.id}`) {
        return { ...packageItem, price_options: [activeOption] };
      }
      if (path === `admin/membership-packages/${otherId}`) {
        return { ...packageItem, id: otherId, price_options: [otherOneMonth] };
      }
      throw new Error(`Unexpected request: ${path}`);
    });

    providers(<MembershipPackageEditor packageId={packageItem.id} />);
    const multiMonth = await screen.findByRole("group", { name: "Option 1" });
    fireEvent.click(within(multiMonth).getByRole("button", { name: "Add method" }));
    const comparison = within(multiMonth)
      .getByRole("heading", { name: "Savings comparison" })
      .closest(".payment-plan-comparison") as HTMLElement;
    fireEvent.change(within(multiMonth).getByRole("textbox", { name: /^Package total value/ }), {
      target: { value: "4000000" },
    });
    fireEvent.change(within(multiMonth).getByRole("textbox", { name: /^Amount per payment/ }), {
      target: { value: "4000000" },
    });
    expect(within(comparison).getByText("₫4,500,000")).toBeVisible();
    expect(within(comparison).getByText(/₫500,000 · 11\.11%/)).toBeVisible();
    expect(vi.mocked(api).mock.calls.map(([path]) => path)).toEqual([
      `admin/membership-packages/${packageItem.id}`,
    ]);
  });

  it("waits for changed price data to be saved before editing its plans", async () => {
    mockCatalogLookups();
    vi.mocked(api).mockResolvedValue(packageItem);
    providers(<MembershipPackageEditor packageId={packageItem.id} />);
    const first = await screen.findByRole("group", { name: "Option 1" });
    expect(within(first).getByRole("heading", { name: "Payment methods" })).toBeVisible();
    fireEvent.focus(within(first).getByLabelText("Monthly price *"));
    fireEvent.change(within(first).getByLabelText("Monthly price *"), {
      target: { value: "700000" },
    });
    expect(within(first).queryByText(/Payment methods/)).toBeNull();
    expect(
      within(first).getByText(
        /Save this duration and price option before configuring payment methods/,
      ),
    ).toBeVisible();
    expect(vi.mocked(api).mock.calls.map(([path]) => path)).toEqual([
      `admin/membership-packages/${packageItem.id}`,
    ]);
  });

  it("warns about a legacy one-month installment without allowing edits", async () => {
    mockCatalogLookups();
    const oneMonthOption = {
      ...activeOption,
      duration_months: 1,
      monthly_price_vnd: "800000",
      total_price_vnd: "800000",
      payment_plans: [
        {
          id: "b0c0313a-85df-4c29-930a-f19a05f3d8c4",
          price_option_id: activeOption.id,
          name: "Legacy installments",
          payment_type: "installment" as const,
          total_amount: "800000",
          installment_count: 2,
          sort_order: 0,
          is_active: false,
          in_use: true,
          initial_payment_amount: "400000",
          installments: [
            { sequence: 1, amount: "400000", cycle_count: 1 },
            { sequence: 2, amount: "400000", cycle_count: 1 },
          ],
        },
      ],
    };
    vi.mocked(api).mockResolvedValue({ ...packageItem, price_options: [oneMonthOption] });

    providers(<MembershipPackageEditor packageId={packageItem.id} />);

    const first = await screen.findByRole("group", { name: "Option 1" });
    expect(
      within(first).getByText(/Existing payment methods for a one-month option/),
    ).toBeVisible();
    expect(within(first).getByText(/2 installments/)).toBeVisible();
    expect(within(first).queryByRole("button", { name: "Add method" })).toBeNull();
    expect(within(first).queryByRole("button", { name: "Edit" })).toBeNull();
    expect(vi.mocked(api).mock.calls.map(([path]) => path)).toEqual([
      `admin/membership-packages/${packageItem.id}`,
    ]);
  });
});

describe("Membership detail snapshots and usage regressions", () => {
  it("keeps Contract detail visible while one version PDF is loading or fails", async () => {
    const version = {
      id: "11111111-1111-4111-8111-111111111111",
      version_number: 1,
      version_reason: "issued",
      contract_status: "active",
      created_at: "2026-09-10T02:00:00Z",
      available_locales: ["vi", "en"],
    };
    const contract = {
      id: "77777777-7777-4777-8777-777777777777",
      reference_code: "CSA-202609-8F3K2M",
      status: "active",
      available_locales: ["vi", "en"],
      current_version: version,
      versions: [version],
    };
    vi.mocked(api).mockImplementation(async (path) => {
      if (path === `admin/memberships/${membership.id}?locale=en`)
        return { ...membership, contract };
      if (path === `admin/memberships/${membership.id}/contract`) return contract;
      throw new Error(`Unexpected request: ${path}`);
    });
    vi.mocked(apiEnvelope).mockResolvedValue({ data: [], meta: { ...meta, total: 0 } });
    let rejectDownload: (reason: Error) => void = () => undefined;
    vi.mocked(apiFile).mockImplementation(
      () =>
        new Promise((_, reject) => {
          rejectDownload = reject;
        }),
    );
    providers(<MembershipDetail membershipId={membership.id} />);
    const versionRow = (await screen.findByRole("heading", { name: "Version 1" })).closest("li")!;
    const viButton = within(versionRow).getByRole("button", {
      name: "Download Vietnamese contract",
    });
    fireEvent.click(viButton);
    expect(viButton).toBeDisabled();
    expect(
      within(versionRow).getByRole("button", { name: "Download English contract" }),
    ).toBeEnabled();
    fireEvent.click(viButton);
    expect(apiFile).toHaveBeenCalledTimes(1);
    await act(async () => rejectDownload(new Error("private-storage-secret")));
    expect(await screen.findByText("The contract is temporarily unavailable.")).toBeVisible();
    expect(screen.getByText(contract.reference_code)).toBeVisible();
    expect(screen.queryByText("private-storage-secret")).toBeNull();
    expect(viButton).toBeEnabled();
  });

  it("shows ordered Contract versions and downloads old/current PDFs independently", async () => {
    const oldVersion = {
      id: "11111111-1111-4111-8111-111111111111",
      version_number: 1,
      version_reason: "issued",
      contract_status: "active",
      created_at: "2026-09-10T02:00:00Z",
      available_locales: ["vi"],
    };
    const currentVersion = {
      id: "22222222-2222-4222-8222-222222222222",
      version_number: 2,
      version_reason: "membership_revoked",
      contract_status: "revoked",
      created_at: "2026-09-12T02:00:00Z",
      available_locales: ["vi", "en"],
      paid_amount: "1000000",
      remaining_amount: "3500000",
    };
    const contract = {
      id: "77777777-7777-4777-8777-777777777777",
      reference_code: "CSA-202609-8F3K2M",
      status: "revoked",
      available_locales: ["vi", "en"],
      issued_at: "2026-09-10T02:00:00Z",
      revoked_at: "2026-09-12T02:00:00Z",
      revocation_reason: "Cancelled",
      current_version: currentVersion,
      versions: [currentVersion, oldVersion],
    };
    vi.mocked(api).mockImplementation(async (path) => {
      if (path === `admin/memberships/${membership.id}?locale=en`)
        return { ...membership, contract };
      if (path === `admin/memberships/${membership.id}/contract`) return contract;
      throw new Error(`Unexpected request: ${path}`);
    });
    vi.mocked(apiEnvelope).mockResolvedValue({ data: [], meta: { ...meta, total: 0 } });
    vi.mocked(apiFile).mockResolvedValue({
      blob: new Blob(["pdf"], { type: "application/pdf" }),
      filename: "CSA-CODE.v1.vi.pdf",
    });
    const createObjectURL = vi.fn(() => "blob:contract-version");
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectURL });
    const downloads: string[] = [];
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      downloads.push(this.download);
    });

    providers(<MembershipDetail membershipId={membership.id} />);
    expect(await screen.findByRole("heading", { name: "Contract version history" })).toBeVisible();
    const rows = screen
      .getAllByRole("listitem")
      .filter((row) => row.className === "membership-contract-version");
    expect(within(rows[0]).getByRole("heading", { name: "Version 1" })).toBeVisible();
    expect(within(rows[1]).getByRole("heading", { name: "Version 2" })).toBeVisible();
    expect(within(rows[0]).queryByText("Current version")).toBeNull();
    expect(within(rows[1]).getByText("Current version")).toBeVisible();
    expect(within(rows[0]).getByText("VI")).toBeVisible();
    expect(within(rows[0]).queryByRole("button", { name: "Download English contract" })).toBeNull();
    expect(screen.getAllByRole("button", { name: "Download Vietnamese contract" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Download English contract" })).toHaveLength(1);
    expect(within(rows[1]).getByText("₫1,000,000")).toBeVisible();
    expect(within(rows[1]).getByText("₫3,500,000")).toBeVisible();

    vi.useFakeTimers();
    await act(async () => {
      fireEvent.click(
        within(rows[0]).getByRole("button", { name: "Download Vietnamese contract" }),
      );
    });
    expect(apiFile).toHaveBeenCalledWith(
      `admin/memberships/${membership.id}/contract/pdf?locale=vi&version_id=${oldVersion.id}`,
    );
    expect(downloads).toEqual(["CSA-CODE.v1.vi.pdf"]);
    expect(click).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1_000));
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:contract-version");

    await act(async () => {
      fireEvent.click(within(rows[1]).getByRole("button", { name: "Download English contract" }));
    });
    expect(apiFile).toHaveBeenCalledWith(
      `admin/memberships/${membership.id}/contract/pdf?locale=en&version_id=${currentVersion.id}`,
    );
    expect(createObjectURL).toHaveBeenCalledTimes(2);
    expect(screen.getByText(contract.reference_code)).toBeVisible();
  });

  it("loads and renders the current contract with only its available PDF locales", async () => {
    const contract = {
      id: "77777777-7777-4777-8777-777777777777",
      reference_code: "CSA-202609-8F3K2M",
      status: "active" as const,
      available_locales: ["vi", "en"] as Array<"vi" | "en">,
      issued_at: "2026-09-10T02:00:00Z",
      revoked_at: null,
      revocation_reason: null,
    };
    vi.mocked(api).mockImplementation(async (path) => {
      if (path === `admin/memberships/${membership.id}?locale=en`)
        return { ...membership, contract };
      if (path === `admin/memberships/${membership.id}/contract`) return contract;
      throw new Error(`Unexpected request: ${path}`);
    });
    vi.mocked(apiEnvelope).mockResolvedValue({ data: [], meta: { ...meta, total: 0 } });
    vi.mocked(apiFile).mockResolvedValue({
      blob: new Blob(["pdf"], { type: "application/pdf" }),
      filename: "contract.vi.pdf",
    });
    const createObjectURL = vi.fn(() => "blob:contract");
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectURL });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);

    providers(<MembershipDetail membershipId={membership.id} />);

    expect(await screen.findByText(contract.reference_code)).toBeVisible();
    expect(
      screen.getByText(
        "This legacy contract has no version history. Its current contract is available above.",
      ),
    ).toBeVisible();
    expect(screen.getByText("Active", { selector: "dd" })).toBeVisible();
    vi.useFakeTimers();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Download Vietnamese contract" }));
    });
    expect(apiFile).toHaveBeenCalledWith(
      `admin/memberships/${membership.id}/contract/pdf?locale=vi`,
    );
    expect(click).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(999));
    expect(revokeObjectURL).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Download English contract" }));
    });
    expect(apiFile).toHaveBeenCalledWith(
      `admin/memberships/${membership.id}/contract/pdf?locale=en`,
    );
    expect(click).toHaveBeenCalledTimes(2);
    expect(createObjectURL).toHaveBeenCalledTimes(2);
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(1_000));
    expect(revokeObjectURL).toHaveBeenCalledTimes(2);
  });

  it("shows the empty and localized failure states for Membership contracts", async () => {
    vi.mocked(api).mockResolvedValue(membership);
    vi.mocked(apiEnvelope).mockResolvedValue({ data: [], meta: { ...meta, total: 0 } });
    const empty = providers(<MembershipDetail membershipId={membership.id} />);
    expect(await screen.findByText("No contract yet")).toBeVisible();
    expect(api).not.toHaveBeenCalledWith(`admin/memberships/${membership.id}/contract`);
    empty.unmount();

    vi.mocked(api).mockImplementation(async (path) => {
      if (path === `admin/memberships/${membership.id}?locale=en`)
        return {
          ...membership,
          contract: {
            id: "77777777-7777-4777-8777-777777777777",
            reference_code: "CSA-202609-8F3K2M",
            status: "active",
          },
        };
      if (path.endsWith("/contract")) throw new Error("csa_contract_unavailable");
      throw new Error(`Unexpected request: ${path}`);
    });
    providers(<MembershipDetail membershipId={membership.id} />);
    expect(
      await screen.findByText("The contract details could not be loaded. Please try again."),
    ).toBeVisible();
  });

  it("shows a localized error when the current contract PDF is unavailable", async () => {
    const contract = {
      id: "77777777-7777-4777-8777-777777777777",
      reference_code: "CSA-202609-8F3K2M",
      status: "active" as const,
      available_locales: ["en"] as Array<"vi" | "en">,
      issued_at: "2026-09-10T02:00:00Z",
      revoked_at: null,
      revocation_reason: null,
    };
    vi.mocked(api).mockImplementation(async (path) => {
      if (path === `admin/memberships/${membership.id}?locale=en`)
        return { ...membership, contract };
      return contract;
    });
    vi.mocked(apiEnvelope).mockResolvedValue({ data: [], meta: { ...meta, total: 0 } });
    vi.mocked(apiFile).mockRejectedValue(new Error("internal_storage_key_failure"));
    providers(<MembershipDetail membershipId={membership.id} />);
    fireEvent.click(await screen.findByRole("button", { name: "Download English contract" }));
    expect(await screen.findByText("The contract is temporarily unavailable.")).toBeVisible();
    expect(screen.queryByText("internal_storage_key_failure")).toBeNull();
  });

  it("focuses on the package and returns to its CSA customer", async () => {
    vi.mocked(api).mockResolvedValue(membership);
    vi.mocked(apiEnvelope).mockResolvedValue({ data: [], meta: { ...meta, total: 0 } });
    providers(<MembershipDetail membershipId={membership.id} />);
    expect(await screen.findByText("FB-2026-0001")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "CSA customers" })).toHaveAttribute(
      "href",
      `/csa-customers/${membership.customer_id}`,
    );
    expect(screen.queryByRole("heading", { name: "Customer" })).toBeNull();
    expect(screen.queryByText(user.name)).toBeNull();
    expect(screen.queryByText(user.email)).toBeNull();
    expect(screen.queryByText(user.phone)).toBeNull();
    expect(screen.getByText("₫750,000")).toBeInTheDocument();
    expect(screen.getByText("₫4,500,000")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Remaining quantity" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Quantity tracking by period" })).toBeVisible();
    expect(screen.queryByRole("table", { name: "Quantity tracking by period" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Product collection history" })).toBeVisible();
    await waitFor(() => expect(api).toHaveBeenCalledTimes(1));
  });

  it("combines multi-period quantities and totals in one table", async () => {
    vi.mocked(api).mockResolvedValue({
      ...membership,
      cycles: [
        membershipCycle(1, "2026-06-15", "2026-07-15", 10, 2),
        membershipCycle(2, "2026-07-15", "2026-08-15", 10, 10),
      ],
    });
    vi.mocked(apiEnvelope).mockResolvedValue({ data: [], meta: { ...meta, total: 0 } });
    providers(<MembershipDetail membershipId={membership.id} />, "vi");

    const table = await screen.findByRole("table", { name: "Theo dõi số lượng theo kỳ" });
    for (const heading of ["Kỳ nhận", "Khoảng thời gian", "Được nhận", "Đã nhận", "Còn lại"]) {
      expect(within(table).getByRole("columnheader", { name: heading })).toBeVisible();
    }
    expect(within(table).queryByRole("columnheader", { name: "Trạng thái" })).toBeNull();
    expect(table.querySelector(".membership-status")).toBeNull();
    expect(screen.getByText("Đang hoạt động")).toBeVisible();
    expect(
      within(within(table).getByRole("row", { name: /Kỳ 1/ }))
        .getAllByRole("cell")
        .map((cell) => cell.textContent),
    ).toEqual(["Kỳ 1", "15/06/2026 – 14/07/2026", "10", "8", "2"]);
    expect(
      within(within(table).getByRole("row", { name: /Kỳ 2/ }))
        .getAllByRole("cell")
        .map((cell) => cell.textContent),
    ).toEqual(["Kỳ 2", "15/07/2026 – 14/08/2026", "10", "0", "10"]);
    const total = within(table).getByRole("row", { name: /Tổng/ });
    expect(
      within(total)
        .getAllByRole("cell")
        .map((cell) => cell.textContent),
    ).toEqual(["", "20", "8", "12"]);
    expect(screen.queryByRole("heading", { name: "Số lượng còn lại" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Lịch sử nhận sản phẩm" })).toBeVisible();
    await waitFor(() => expect(api).toHaveBeenCalledTimes(1));
  });

  it("renders exactly one API-provided period for a one-month package", async () => {
    vi.mocked(api).mockResolvedValue({
      ...membership,
      duration_months: 1,
      cycles: [membershipCycle(1, "2026-06-15", "2026-07-15", 5, 5)],
    });
    vi.mocked(apiEnvelope).mockResolvedValue({ data: [], meta: { ...meta, total: 0 } });
    providers(<MembershipDetail membershipId={membership.id} />);

    const table = await screen.findByRole("table", { name: "Quantity tracking by period" });
    expect(table.querySelectorAll("tbody tr")).toHaveLength(1);
    expect(within(table).getByText("Period 1")).toBeVisible();
    expect(within(table).getByText("15/06/2026 – 14/07/2026")).toBeVisible();
    await waitFor(() => expect(api).toHaveBeenCalledTimes(1));
  });

  it("keeps usage idempotent and undo retry-safe", async () => {
    const usage: MembershipUsage = {
      id: "ac7d02ac-d36c-4558-b839-9124620dde44",
      membership_id: membership.id,
      status: "applied",
      note: "Basket",
      created_at: "2026-08-04T03:00:00Z",
      reversed_at: null,
      lines: [{ product_id: product.id, product_name: product.name, units: 1 }],
    };
    let usageCreated = false;
    vi.mocked(api).mockImplementation(async (path, init) => {
      if (path === `admin/memberships/${membership.id}?locale=en`) return membership;
      if (path === "admin/membership-usage?locale=en" && init?.method === "POST") {
        usageCreated = true;
        return usage;
      }
      if (path.endsWith("/undo?locale=en")) return { ...usage, status: "reversed" };
      throw new Error(`Unexpected request: ${path}`);
    });
    vi.mocked(apiEnvelope).mockImplementation(async () => ({
      data: usageCreated ? [usage] : [],
      meta: { ...meta, total: usageCreated ? 1 : 0 },
    }));
    providers(<MembershipDetail membershipId={membership.id} />);
    fireEvent.click(await screen.findByRole("button", { name: "Record received products" }));
    const dialog = screen.getByRole("dialog", { name: "Record received products" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Record received products" }));
    await waitFor(() =>
      expect(
        vi.mocked(api).mock.calls.filter(([path]) => path === "admin/membership-usage?locale=en"),
      ).toHaveLength(1),
    );
    const usageBody = JSON.parse(
      String(
        vi.mocked(api).mock.calls.find(([path]) => path === "admin/membership-usage?locale=en")?.[1]
          ?.body,
      ),
    );
    expect(usageBody.idempotency_key).toMatch(/[0-9a-f-]{36}/);
    expect(usageBody.lines).toEqual([{ product_id: product.id, units: 1 }]);
    fireEvent.click(await screen.findByRole("button", { name: "Undo product collection" }));
    const undoDialog = screen.getByRole("dialog", { name: "Confirm product collection undo" });
    fireEvent.change(within(undoDialog).getByLabelText("Reason *"), {
      target: { value: "Entered twice" },
    });
    fireEvent.click(within(undoDialog).getByRole("button", { name: "Confirm undo" }));
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith(
        `admin/membership-usage/${usage.id}/undo?locale=en`,
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ reason: "Entered twice" }),
        }),
      ),
    );
  });

  it.each([
    {
      locale: "en" as const,
      auditLabel: "CSA package revocation details",
      time: "Revoked at 05/08/2026 09:00",
      actor: "by Website Admin · admin@example.com",
      reasonLabel: "Reason:",
      status: "Revoked",
      warning: "Legacy package data has no English content",
    },
    {
      locale: "vi" as const,
      auditLabel: "Thông tin thu hồi gói CSA",
      time: "Thu hồi lúc 05/08/2026 09:00",
      actor: "bởi Website Admin · admin@example.com",
      reasonLabel: "Lý do:",
      status: "Đã thu hồi",
      warning: "Dữ liệu gói cũ chưa có nội dung tiếng Anh",
    },
  ])(
    "shows the compact $locale revoke audit and hides undo for applied history",
    async ({ locale, auditLabel, time, actor, reasonLabel, status, warning }) => {
      const usage: MembershipUsage = {
        id: "ac7d02ac-d36c-4558-b839-9124620dde44",
        membership_id: membership.id,
        status: "applied",
        note: "Closed delivery",
        created_at: "2026-08-04T03:00:00Z",
        reversed_at: null,
        lines: [{ product_id: product.id, product_name: product.name, units: 1 }],
      };
      vi.mocked(api).mockResolvedValue({
        ...membership,
        status: "revoked",
        snapshot_complete: false,
        current_slot: null,
        revoked_at: "2026-08-05T02:00:00Z",
        revoked_by: {
          id: "10d3127f-34cf-443d-b6b4-eafe7391bd24",
          name: "Website Admin",
          email: "admin@example.com",
        },
        revoke_reason: "Close audit record",
      });
      vi.mocked(apiEnvelope).mockResolvedValue({ data: [usage], meta });

      providers(<MembershipDetail membershipId={membership.id} />, locale);

      expect(await screen.findByText(locale === "vi" ? "Đã ghi nhận" : "Recorded")).toBeVisible();
      const audit = screen.getByRole("region", { name: auditLabel });
      expect(within(audit).getByText(time)).toBeVisible();
      expect(within(audit).getByText(actor)).toBeVisible();
      expect(within(audit).getByText(reasonLabel)).toBeVisible();
      expect(within(audit).getByText("Close audit record")).toBeVisible();
      expect(within(audit).queryByText(packageItem.name)).toBeNull();
      expect(audit).not.toHaveClass("error-box");
      expect(audit).not.toHaveClass("revoke-info-box");
      const heroes = document.querySelectorAll(".membership-hero");
      expect(heroes).toHaveLength(1);
      expect(heroes[0]).toContainElement(audit);
      expect(
        within(heroes[0] as HTMLElement).getByRole("heading", { name: packageItem.name }),
      ).toBeVisible();
      expect(
        within(heroes[0] as HTMLElement)
          .getByText(warning)
          .closest("p"),
      ).toHaveClass("membership-snapshot-warning");
      expect(screen.getAllByText(status, { selector: ".membership-status" })).toHaveLength(1);
      expect(
        screen.queryByRole("button", {
          name: locale === "vi" ? "Hoàn tác lần nhận hàng" : "Undo product collection",
        }),
      ).toBeNull();
    },
  );

  it("uses a localized fallback when a revoked Membership has no audit actor", async () => {
    vi.mocked(api).mockResolvedValue({
      ...membership,
      status: "revoked",
      current_slot: null,
      revoked_at: null,
      revoked_by: null,
      revoke_reason: "Legacy audit",
    });
    vi.mocked(apiEnvelope).mockResolvedValue({ data: [], meta });

    providers(<MembershipDetail membershipId={membership.id} />);

    const audit = await screen.findByRole("region", {
      name: "CSA package revocation details",
    });
    expect(within(audit).getByText("Revoked at —")).toBeVisible();
    expect(within(audit).getByText("by unknown actor")).toBeVisible();
  });

  it("keeps a stale undo dialog open when the backend rejects it after revoke", async () => {
    const usage: MembershipUsage = {
      id: "ac7d02ac-d36c-4558-b839-9124620dde44",
      membership_id: membership.id,
      status: "applied",
      note: "Open delivery",
      created_at: "2026-08-04T03:00:00Z",
      reversed_at: null,
      lines: [{ product_id: product.id, product_name: product.name, units: 1 }],
    };
    vi.mocked(api).mockImplementation(async (path, init) => {
      if (path === `admin/memberships/${membership.id}?locale=en`) return membership;
      if (path === `admin/membership-usage/${usage.id}/undo?locale=en` && init?.method === "POST") {
        throw Object.assign(new Error("usage_undo_conflict"), { status: 409 });
      }
      throw new Error(`Unexpected request: ${path}`);
    });
    vi.mocked(apiEnvelope).mockResolvedValue({ data: [usage], meta });
    providers(<MembershipDetail membershipId={membership.id} />);

    fireEvent.click(await screen.findByRole("button", { name: "Undo product collection" }));
    const dialog = screen.getByRole("dialog", { name: "Confirm product collection undo" });
    fireEvent.change(within(dialog).getByLabelText("Reason *"), {
      target: { value: "Stale open dialog" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm undo" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "The request failed. Please try again.",
    );
    expect(api).toHaveBeenCalledWith(
      `admin/membership-usage/${usage.id}/undo?locale=en`,
      expect.objectContaining({ method: "POST" }),
    );
    expect(screen.getByRole("dialog", { name: "Confirm product collection undo" })).toBeVisible();
  });

  it.each(["active", "scheduled"] as const)("shows revoke for a %s Membership", async (status) => {
    vi.mocked(api).mockResolvedValue({ ...membership, status });
    vi.mocked(apiEnvelope).mockResolvedValue({ data: [], meta: { ...meta, total: 0 } });

    providers(<MembershipDetail membershipId={membership.id} />);

    expect(await screen.findByRole("button", { name: "Revoke CSA package" })).toBeVisible();
    expect(screen.queryByRole("region", { name: "CSA package revocation details" })).toBeNull();
  });

  it.each(["ended", "revoked"] as const)("hides revoke for a %s Membership", async (status) => {
    vi.mocked(api).mockResolvedValue({
      ...membership,
      status,
      ...(status === "revoked"
        ? {
            revoked_at: "2026-08-05T02:00:00Z",
            revoked_by: {
              id: "10d3127f-34cf-443d-b6b4-eafe7391bd24",
              name: "Website Admin",
              email: "admin@example.com",
            },
            revoke_reason: "Audit reason",
          }
        : {}),
    });
    vi.mocked(apiEnvelope).mockResolvedValue({ data: [], meta: { ...meta, total: 0 } });

    providers(<MembershipDetail membershipId={membership.id} />);

    await waitFor(() => expect(api).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: "Revoke CSA package" })).toBeNull();
    if (status === "ended") {
      expect(screen.queryByRole("region", { name: "CSA package revocation details" })).toBeNull();
    }
  });

  it("returns focus to the revoke trigger when Escape closes the dialog", async () => {
    vi.mocked(api).mockResolvedValue(membership);
    vi.mocked(apiEnvelope).mockResolvedValue({ data: [], meta: { ...meta, total: 0 } });
    providers(<MembershipDetail membershipId={membership.id} />);

    const trigger = await screen.findByRole("button", { name: "Revoke CSA package" });
    trigger.focus();
    fireEvent.click(trigger);
    expect(screen.getByLabelText("Revoke reason")).toHaveFocus();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("dialog", { name: "Confirm CSA package revocation" })).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it("requires a reason, submits revoke once, and reloads the revoked detail", async () => {
    const revoked = {
      ...membership,
      status: "revoked" as const,
      current_slot: null,
      revoked_at: "2026-08-05T02:00:00Z",
      revoked_by: {
        id: "10d3127f-34cf-443d-b6b4-eafe7391bd24",
        name: "Website Admin",
        email: "admin@example.com",
      },
      revoke_reason: "Assigned by mistake",
    };
    let current = membership;
    let resolveRevoke!: (value: AdminMembership) => void;
    const pending = new Promise<AdminMembership>((resolve) => (resolveRevoke = resolve));
    vi.mocked(api).mockImplementation(async (path, init) => {
      if (path === `admin/memberships/${membership.id}?locale=en`) return current;
      if (
        path === `admin/memberships/${membership.id}/revoke?locale=en` &&
        init?.method === "POST"
      ) {
        current = revoked;
        return pending;
      }
      throw new Error(`Unexpected request: ${path}`);
    });
    vi.mocked(apiEnvelope).mockResolvedValue({ data: [], meta: { ...meta, total: 0 } });
    providers(<MembershipDetail membershipId={membership.id} />);

    fireEvent.click(await screen.findByRole("button", { name: "Revoke CSA package" }));
    const dialog = screen.getByRole("dialog", { name: "Confirm CSA package revocation" });
    const confirm = within(dialog).getByRole("button", { name: "Revoke CSA package" });
    expect(within(dialog).getByLabelText("Revoke reason")).toBeRequired();
    expect(confirm).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText("Revoke reason"), {
      target: { value: "Assigned by mistake" },
    });
    expect(confirm).toBeEnabled();

    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(
      vi
        .mocked(api)
        .mock.calls.filter(
          ([path]) => path === `admin/memberships/${membership.id}/revoke?locale=en`,
        ),
    ).toHaveLength(1);
    expect(api).toHaveBeenCalledWith(`admin/memberships/${membership.id}/revoke?locale=en`, {
      method: "POST",
      body: JSON.stringify({ reason: "Assigned by mistake" }),
    });

    await act(async () => resolveRevoke(revoked));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByText("Revoked", { selector: ".membership-status" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Revoke CSA package" })).toBeNull();
    expect(screen.getByRole("heading", { name: packageItem.name })).toHaveFocus();
    expect(
      vi
        .mocked(api)
        .mock.calls.filter(([path]) => path === `admin/memberships/${membership.id}?locale=en`),
    ).toHaveLength(2);
  });

  it("keeps the authoritative revoked state when the detail reload fails", async () => {
    const usage: MembershipUsage = {
      id: "ac7d02ac-d36c-4558-b839-9124620dde44",
      membership_id: membership.id,
      status: "applied",
      note: "Open delivery",
      created_at: "2026-08-04T03:00:00Z",
      reversed_at: null,
      lines: [{ product_id: product.id, product_name: product.name, units: 1 }],
    };
    const revoked: AdminMembership = {
      ...membership,
      status: "revoked",
      current_slot: null,
      revoked_at: "2026-08-05T02:00:00Z",
      revoked_by: {
        id: "10d3127f-34cf-443d-b6b4-eafe7391bd24",
        name: "Website Admin",
        email: "admin@example.com",
      },
      revoke_reason: "Assigned by mistake",
      quota: undefined,
      cycles: undefined,
    };
    let detailRequests = 0;
    let revokeRequests = 0;
    vi.mocked(api).mockImplementation(async (path, init) => {
      if (path === `admin/memberships/${membership.id}?locale=en`) {
        detailRequests += 1;
        if (detailRequests === 1) return membership;
        throw Object.assign(new Error("server_error"), { status: 500 });
      }
      if (
        path === `admin/memberships/${membership.id}/revoke?locale=en` &&
        init?.method === "POST"
      ) {
        revokeRequests += 1;
        return revoked;
      }
      throw new Error(`Unexpected request: ${path}`);
    });
    vi.mocked(apiEnvelope).mockResolvedValue({ data: [usage], meta });
    providers(<MembershipDetail membershipId={membership.id} />);

    fireEvent.click(await screen.findByRole("button", { name: "Revoke CSA package" }));
    const dialog = screen.getByRole("dialog", { name: "Confirm CSA package revocation" });
    fireEvent.change(within(dialog).getByLabelText("Revoke reason"), {
      target: { value: "Assigned by mistake" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Revoke CSA package" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByText("Revoked", { selector: ".membership-status" })).toBeVisible();
    expect(screen.getByText("Assigned by mistake")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Revoke CSA package" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Record received products" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Undo product collection" })).toBeNull();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "The backend encountered an error. Check the Django terminal.",
    );
    expect(screen.getByRole("button", { name: "Try again" })).toBeVisible();
    expect(revokeRequests).toBe(1);
    expect(detailRequests).toBe(2);
  });

  it("keeps the revoke dialog open and shows an error after a 409", async () => {
    vi.mocked(api).mockImplementation(async (path, init) => {
      if (path === `admin/memberships/${membership.id}?locale=en`) return membership;
      if (
        path === `admin/memberships/${membership.id}/revoke?locale=en` &&
        init?.method === "POST"
      ) {
        throw Object.assign(new Error("membership_not_revocable"), { status: 409 });
      }
      throw new Error(`Unexpected request: ${path}`);
    });
    vi.mocked(apiEnvelope).mockResolvedValue({ data: [], meta: { ...meta, total: 0 } });
    providers(<MembershipDetail membershipId={membership.id} />);

    fireEvent.click(await screen.findByRole("button", { name: "Revoke CSA package" }));
    const dialog = screen.getByRole("dialog", { name: "Confirm CSA package revocation" });
    fireEvent.change(within(dialog).getByLabelText("Revoke reason"), {
      target: { value: "Assigned by mistake" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Revoke CSA package" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "The request failed. Please try again.",
    );
    expect(screen.getByRole("dialog", { name: "Confirm CSA package revocation" })).toBeVisible();
  });
});
