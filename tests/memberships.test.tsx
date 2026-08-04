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
import { afterEach, describe, expect, it, vi } from "vitest";

import { AdminI18nProvider } from "@/components/admin-i18n-provider";
import { MembershipAssignmentForm } from "@/components/membership-assignment-form";
import { MembershipPackageDetail } from "@/components/membership-catalog-detail";
import { MembershipPackageEditor } from "@/components/membership-catalog-editors";
import { MembershipPackageList } from "@/components/membership-catalog-lists";
import { MembershipDetail } from "@/components/membership-detail";
import { MembershipList } from "@/components/membership-list";
import { ToastProvider } from "@/components/toast-provider";
import { api, apiEnvelope } from "@/lib/client-api";
import type {
  AdminMembership,
  AdminUserListItem,
  MembershipPackage,
  MembershipProduct,
  MembershipUsage,
  PaginationMeta,
} from "@/lib/types";

const navigation = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));

vi.mock("@/lib/client-api", () => ({ api: vi.fn(), apiEnvelope: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: navigation.push, replace: navigation.replace, refresh: vi.fn() }),
  usePathname: () => "/memberships",
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function providers(children: React.ReactNode) {
  return render(
    <AdminI18nProvider initialLocale="en">
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
  status: "active",
  date_joined: "2026-01-01T00:00:00Z",
  points_balance: 0,
};

const membership: AdminMembership = {
  id: "87703641-2dce-4cac-8fc4-91e55f03e95f",
  user_id: user.id,
  package_id: packageItem.id,
  price_option_id: activeOption.id,
  user,
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

const meta: PaginationMeta = { page: 1, page_size: 30, total: 1 };

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
    fireEvent.change(screen.getByLabelText("Product 1"), { target: { value: product.id } });
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
    fireEvent.change(screen.getByLabelText("Product 1"), { target: { value: product.id } });
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
    fireEvent.change(screen.getByLabelText("Product 1"), { target: { value: product.id } });
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
});

describe("manual Membership assignment", () => {
  const secondPackage: MembershipPackage = {
    ...packageItem,
    id: "fd58ec7b-7687-4c81-b21c-da0d1a201a12",
    name: "Twelve month CSA",
    description: "A full year package",
    price_options: [
      {
        ...activeOption,
        id: "ae999a35-d30f-48f7-8a04-e0cf39ad2849",
        duration_months: 12,
        total_price_vnd: "9000000",
      },
    ],
  };
  const secondUser: AdminUserListItem = {
    ...user,
    id: "7202b170-0dc2-4c4b-a027-8e6c43875943",
    name: "Second Member",
    email: "second@example.com",
  };

  function mockAssignment() {
    vi.mocked(apiEnvelope).mockImplementation(async (path) => {
      if (path.startsWith("admin/membership-packages")) return { data: [packageItem], meta };
      if (path.startsWith("admin/users?")) return { data: [user], meta };
      throw new Error(`Unexpected request: ${path}`);
    });
  }

  async function prepareAssignment() {
    mockAssignment();
    providers(<MembershipAssignmentForm />);
    await waitFor(() =>
      expect(apiEnvelope).toHaveBeenCalledWith(
        "admin/membership-packages?active=true&page=1",
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      ),
    );
    expect(
      vi.mocked(apiEnvelope).mock.calls.some(([path]) => path.startsWith("admin/users?")),
    ).toBe(false);
    const userSearch = screen.getByRole("search", {
      name: "Search users by email or phone number",
    });
    fireEvent.change(within(userSearch).getByLabelText("Search users by email or phone number"), {
      target: { value: "green@example.com" },
    });
    fireEvent.click(within(userSearch).getByRole("button", { name: "Search" }));
    const userResults = await screen.findByRole("radiogroup", { name: "Choose customer" });
    fireEvent.click(within(userResults).getByRole("radio"));
    const packageResults = await screen.findByRole("radiogroup", {
      name: "Choose an active package",
    });
    fireEvent.click(within(packageResults).getByRole("radio"));
    fireEvent.change(screen.getByLabelText("Price option *"), {
      target: { value: activeOption.id },
    });
    fireEvent.change(screen.getByLabelText("Farmbrite order reference *"), {
      target: { value: "FB-2026-0001" },
    });
    return screen.getByRole("button", { name: "Review and confirm" });
  }

  it("searches users server-side and offers only active price options", async () => {
    await prepareAssignment();
    expect(apiEnvelope).toHaveBeenCalledWith(
      expect.stringContaining("admin/users?page=1&search=green%40example.com"),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(screen.getByRole("option", { name: /750,000/ })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /769,000/ })).toBeNull();
  });

  it("finds and selects an active package on page 2", async () => {
    vi.mocked(apiEnvelope).mockImplementation(async (path) => {
      if (path === "admin/membership-packages?active=true&page=1") {
        return { data: [packageItem], meta: { page: 1, page_size: 1, total: 2 } };
      }
      if (path === "admin/membership-packages?active=true&page=2") {
        return { data: [secondPackage], meta: { page: 2, page_size: 1, total: 2 } };
      }
      throw new Error(`Unexpected request: ${path}`);
    });
    providers(<MembershipAssignmentForm />);
    const pagination = await screen.findByRole("navigation", { name: "Page {page}/{pages}" });
    fireEvent.click(within(pagination).getByRole("button", { name: "Next" }));
    const results = await screen.findByRole("radiogroup", { name: "Choose an active package" });
    fireEvent.click(within(results).getByRole("radio", { name: /Twelve month CSA/ }));
    expect(screen.getByText("Selected package").parentElement).toHaveTextContent(
      "Twelve month CSA",
    );
    expect(screen.getByRole("option", { name: /12 months/ })).toBeInTheDocument();
  });

  it("keeps the selected package and price option across another search", async () => {
    vi.mocked(apiEnvelope).mockImplementation(async (path) => {
      if (path.includes("search=other")) return { data: [secondPackage], meta };
      if (path.startsWith("admin/membership-packages")) return { data: [packageItem], meta };
      throw new Error(`Unexpected request: ${path}`);
    });
    providers(<MembershipAssignmentForm />);
    const results = await screen.findByRole("radiogroup", { name: "Choose an active package" });
    fireEvent.click(within(results).getByRole("radio"));
    fireEvent.change(screen.getByLabelText("Price option *"), {
      target: { value: activeOption.id },
    });
    const search = screen.getByRole("search", { name: "Search active CSA packages" });
    fireEvent.change(within(search).getByLabelText("Search active CSA packages"), {
      target: { value: "other" },
    });
    fireEvent.click(within(search).getByRole("button", { name: "Search" }));
    await screen.findByText("Twelve month CSA");
    expect(screen.getByText("Selected package").parentElement).toHaveTextContent(packageItem.name);
    expect(screen.getByLabelText("Price option *")).toHaveValue(activeOption.id);
    expect(screen.getByRole("option", { name: /6 months/ })).toBeInTheDocument();
  });

  it("prevents stale package responses from replacing a newer search", async () => {
    let resolveOld!: (value: { data: MembershipPackage[]; meta: PaginationMeta }) => void;
    const oldRequest = new Promise<{ data: MembershipPackage[]; meta: PaginationMeta }>(
      (resolve) => (resolveOld = resolve),
    );
    vi.mocked(apiEnvelope).mockImplementation(async (path) => {
      if (path.endsWith("search=old")) return oldRequest;
      if (path.endsWith("search=new")) return { data: [secondPackage], meta };
      return { data: [packageItem], meta };
    });
    providers(<MembershipAssignmentForm />);
    await screen.findByText(packageItem.name);
    const search = screen.getByRole("search", { name: "Search active CSA packages" });
    const input = within(search).getByLabelText("Search active CSA packages");
    fireEvent.change(input, { target: { value: "old" } });
    fireEvent.click(within(search).getByRole("button", { name: "Search" }));
    await waitFor(() =>
      expect(vi.mocked(apiEnvelope).mock.calls.some(([path]) => path.endsWith("search=old"))).toBe(
        true,
      ),
    );
    fireEvent.change(input, { target: { value: "new" } });
    fireEvent.click(within(search).getByRole("button", { name: "Searching…" }));
    expect(await screen.findByText(secondPackage.name)).toBeInTheDocument();
    await act(async () => resolveOld({ data: [packageItem], meta }));
    expect(screen.getByText(secondPackage.name)).toBeInTheDocument();
    expect(screen.queryByText(packageItem.name)).toBeNull();
  });

  it("aborts active package and user lookups on unmount", async () => {
    const signals: AbortSignal[] = [];
    vi.mocked(apiEnvelope).mockImplementation(
      (_path, init) =>
        new Promise(() => {
          if (init?.signal) signals.push(init.signal);
        }),
    );
    const view = providers(<MembershipAssignmentForm />);
    const userSearch = screen.getByRole("search", {
      name: "Search users by email or phone number",
    });
    fireEvent.change(within(userSearch).getByLabelText("Search users by email or phone number"), {
      target: { value: "green" },
    });
    fireEvent.click(within(userSearch).getByRole("button", { name: "Search" }));
    await waitFor(() => expect(signals).toHaveLength(2));
    view.unmount();
    expect(signals.every((signal) => signal.aborted)).toBe(true);
  });

  it("keeps the selected user across searches until another user is clicked", async () => {
    vi.mocked(apiEnvelope).mockImplementation(async (path) => {
      if (path.startsWith("admin/membership-packages")) return { data: [packageItem], meta };
      if (path.includes("search=second")) return { data: [secondUser], meta };
      if (path.startsWith("admin/users?")) return { data: [user], meta };
      throw new Error(`Unexpected request: ${path}`);
    });
    providers(<MembershipAssignmentForm />);
    const userSearch = screen.getByRole("search", {
      name: "Search users by email or phone number",
    });
    const input = within(userSearch).getByLabelText("Search users by email or phone number");
    fireEvent.change(input, { target: { value: "green" } });
    fireEvent.click(within(userSearch).getByRole("button", { name: "Search" }));
    fireEvent.click(
      within(await screen.findByRole("radiogroup", { name: "Choose customer" })).getByRole("radio"),
    );
    fireEvent.change(input, { target: { value: "second" } });
    fireEvent.click(within(userSearch).getByRole("button", { name: "Search" }));
    await screen.findByText(secondUser.name);
    expect(screen.getByText("Selected customer").parentElement).toHaveTextContent(user.name);

    const packageResults = await screen.findByRole("radiogroup", {
      name: "Choose an active package",
    });
    fireEvent.click(within(packageResults).getByRole("radio"));
    fireEvent.change(screen.getByLabelText("Price option *"), {
      target: { value: activeOption.id },
    });
    fireEvent.change(screen.getByLabelText("Farmbrite order reference *"), {
      target: { value: "FB-PRESERVED-USER" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Review and confirm" }));
    expect(screen.getByRole("dialog")).toHaveTextContent(user.name);
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));

    fireEvent.click(
      within(screen.getByRole("radiogroup", { name: "Choose customer" })).getByRole("radio"),
    );
    expect(screen.getByText("Selected customer").parentElement).toHaveTextContent(secondUser.name);
  });

  it("blocks a past start date before opening confirmation", async () => {
    const review = await prepareAssignment();
    fireEvent.change(screen.getByLabelText("Start date *"), {
      target: { value: "2000-01-01" },
    });
    fireEvent.click(review);
    expect(await screen.findByRole("alert")).toHaveTextContent("today or a future date");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(api).not.toHaveBeenCalled();
  });

  it("uses a non-past date, confirms accessibly, and submits exactly once", async () => {
    let resolveAssign!: (value: AdminMembership) => void;
    const pending = new Promise<AdminMembership>((resolve) => (resolveAssign = resolve));
    const review = await prepareAssignment();
    vi.mocked(api).mockReturnValue(pending);
    const date = screen.getByLabelText("Start date *");
    expect(date).toHaveAttribute("min");
    fireEvent.change(date, { target: { value: date.getAttribute("min") } });
    fireEvent.click(review);
    const dialog = screen.getByRole("dialog", { name: "Confirm Membership assignment" });
    expect(dialog).toHaveTextContent("FB-2026-0001");
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toHaveFocus();
    const confirm = within(dialog).getByRole("button", { name: "Assign Membership" });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(confirm).toBeDisabled();
    expect(vi.mocked(api).mock.calls).toHaveLength(1);
    const [path, init] = vi.mocked(api).mock.calls[0];
    expect(path).toBe("admin/memberships?locale=en");
    expect(JSON.parse(String(init?.body))).toEqual({
      user_id: user.id,
      package_id: packageItem.id,
      price_option_id: activeOption.id,
      start_date: date.getAttribute("min"),
      farmbrite_order_reference: "FB-2026-0001",
    });
    await act(async () => resolveAssign(membership));
    expect(navigation.replace).toHaveBeenCalledWith(`/memberships/${membership.id}`);
  });

  it("retains the form and shows duplicate Farmbrite conflicts", async () => {
    const review = await prepareAssignment();
    vi.mocked(api).mockRejectedValue(
      Object.assign(new Error("duplicate_farmbrite_order_reference"), { status: 409 }),
    );
    fireEvent.click(review);
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Assign Membership" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("already been used");
    expect(screen.getByLabelText("Farmbrite order reference *")).toHaveValue("FB-2026-0001");
    expect(navigation.replace).not.toHaveBeenCalled();
  });
});

describe("Membership list, snapshots, and usage regressions", () => {
  it("lists Memberships and displays immutable price/Farmbrite snapshots", async () => {
    vi.mocked(apiEnvelope).mockResolvedValue({ data: [membership], meta });
    const list = providers(<MembershipList />);
    expect(await screen.findByRole("link", { name: user.name })).toHaveAttribute(
      "href",
      `/memberships/${membership.id}`,
    );
    list.unmount();
    vi.mocked(api).mockResolvedValue(membership);
    vi.mocked(apiEnvelope).mockResolvedValue({ data: [], meta: { ...meta, total: 0 } });
    providers(<MembershipDetail membershipId={membership.id} />);
    expect(await screen.findByText("FB-2026-0001")).toBeInTheDocument();
    expect(screen.getByText("₫750,000")).toBeInTheDocument();
    expect(screen.getByText("₫4,500,000")).toBeInTheDocument();
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
});
