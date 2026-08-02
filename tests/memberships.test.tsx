import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useCallback } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import PackageListPage from "@/app/(admin)/membership-catalog/packages/page";
import ProductListPage from "@/app/(admin)/membership-catalog/products/page";
import { AdminI18nProvider } from "@/components/admin-i18n-provider";
import { AdminShell } from "@/components/admin-shell";
import {
  MembershipPackageDetail,
  MembershipProductDetail,
} from "@/components/membership-catalog-detail";
import {
  MembershipPackageEditor,
  MembershipProductEditor,
} from "@/components/membership-catalog-editors";
import {
  MembershipPackageList,
  MembershipProductList,
} from "@/components/membership-catalog-lists";
import { MembershipCatalogOverview } from "@/components/membership-catalog-overview";
import { MembershipDetail } from "@/components/membership-detail";
import { MembershipList } from "@/components/membership-list";
import { MembershipPaymentSettingsForm } from "@/components/membership-payment-settings-form";
import { MembershipRequestDetail } from "@/components/membership-request-detail";
import { MembershipRequestList } from "@/components/membership-request-list";
import { ToastProvider } from "@/components/toast-provider";
import { api, apiEnvelope } from "@/lib/client-api";
import type {
  AdminMembership,
  MembershipPackage,
  MembershipPaymentSettings,
  MembershipProduct,
  MembershipRequest,
  MembershipUsage,
  PaginationMeta,
} from "@/lib/types";
import { usePaginatedList } from "@/lib/use-paginated-list";

const navigation = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));

vi.mock("@/lib/client-api", () => ({ api: vi.fn(), apiEnvelope: vi.fn() }));
vi.mock("@/lib/admin-locale", () => ({ getAdminLocale: vi.fn(async () => "en") }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: navigation.push, refresh: vi.fn(), replace: navigation.replace }),
  usePathname: () => "/memberships",
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function providers(children: React.ReactNode, locale: "vi" | "en" = "en") {
  return render(
    <AdminI18nProvider initialLocale={locale}>
      <ToastProvider>{children}</ToastProvider>
    </AdminI18nProvider>,
  );
}

function PaginatedListHarness({
  fetcher,
  requestKey,
}: {
  fetcher: (
    requestKey: string,
    page: number,
  ) => Promise<{ data: MembershipProduct[]; meta: PaginationMeta }>;
  requestKey: string;
}) {
  const fetchPage = useCallback((page: number) => fetcher(requestKey, page), [fetcher, requestKey]);
  const getErrorMessage = useCallback(() => "load failed", []);
  const { items, loading, meta } = usePaginatedList({ fetchPage, getErrorMessage });
  return (
    <section aria-busy={loading}>
      {items?.map((item) => (
        <span key={item.id}>{item.name}</span>
      ))}
      {meta && <span data-testid="harness-total">{meta.total}</span>}
    </section>
  );
}

const customer = {
  id: "58cbea40-4749-4400-9fa3-188de573abaf",
  name: "Green Member",
  email: "green@example.com",
  phone: "0918765432",
};

const membershipRequest: MembershipRequest = {
  id: "1025dad7-1599-401e-a9e3-7d2c5d3ca4db",
  short_code: "CSA8CODE",
  status: "payment_submitted",
  user: customer,
  package: {
    id: "f37b7348-77af-4a03-86b2-7dfecb1552be",
    name: "Six month CSA",
    description: "Seasonal vegetables",
    upfront_price: "6000000",
    duration_months: 6,
    quota_policy: "expire",
    items: [
      {
        product_id: "317b49bc-5cc6-4c25-b73b-14d925d9d518",
        product_name: "Vegetable basket",
        short_description: "Fresh vegetables",
        unit_size: "0.500",
        unit_label_vi: "kg",
        unit_label_en: "kg",
        quota_units: 2,
      },
    ],
  },
  payment_instruction: {
    bank_bin: "970436",
    bank_name: "Ngân hàng TMCP Ngoại Thương Việt Nam",
    bank_code: "VCB",
    account_number: "0123456789",
    account_name: "NATURAL FARMING VIETNAM",
    amount: "6000000",
    phone_snapshot: "0918765432",
    transfer_content: "0918765432-CSA8CODE",
    issued_at: "2026-07-20T02:00:00Z",
  },
  return_reason: "",
  rejection_reason: "",
  contacted_at: null,
  payment_submitted_at: "2026-07-20T02:00:00Z",
  returned_at: null,
  approved_at: null,
  rejected_at: null,
  created_at: "2026-07-20T02:00:00Z",
  updated_at: "2026-07-20T02:00:00Z",
  events: [],
};

const catalogProduct: MembershipProduct = {
  id: membershipRequest.package.items[0].product_id,
  name: "Vegetable basket",
  short_description: "Fresh vegetables",
  unit_size: "0.500",
  unit_label_vi: "kg",
  unit_label_en: "kg",
  is_active: true,
  created_at: "2026-07-20T02:00:00Z",
  updated_at: "2026-07-21T02:00:00Z",
};

const catalogPackage: MembershipPackage = {
  ...membershipRequest.package,
  is_active: true,
  created_at: "2026-07-20T02:00:00Z",
  updated_at: "2026-07-21T02:00:00Z",
};

const bankOptions = [
  {
    bin: "970436",
    name: "Ngân hàng TMCP Ngoại Thương Việt Nam",
    short_name: "Vietcombank",
    code: "VCB",
  },
  {
    bin: "970415",
    name: "Ngân hàng TMCP Công thương Việt Nam",
    short_name: "VietinBank",
    code: "ICB",
  },
];

const membership: AdminMembership = {
  id: "87703641-2dce-4cac-8fc4-91e55f03e95f",
  user_id: customer.id,
  request_id: membershipRequest.id,
  user: customer,
  status: "active",
  package_name: "Six month CSA",
  package_description: "Seasonal vegetables",
  upfront_price: "6000000",
  duration_months: 6,
  quota_policy: "expire",
  start_date: "2026-07-20",
  end_date: "2027-01-20",
  activated_at: "2026-07-20T02:00:00Z",
  quota: [
    {
      product_id: membershipRequest.package.items[0].product_id,
      product_name: "Vegetable basket",
      unit_size: "0.500",
      unit_label_vi: "kg",
      unit_label_en: "kg",
      quota_units_per_cycle: 2,
      remaining_units: 2,
    },
  ],
  cycles: [],
};

describe("Membership administration", () => {
  it("validates and enables direct transfer through the BFF once while saving", async () => {
    let resolveSave!: (value: MembershipPaymentSettings) => void;
    const savePromise = new Promise<MembershipPaymentSettings>((resolve) => {
      resolveSave = resolve;
    });
    vi.mocked(api).mockImplementation(async (path, init) => {
      if (path === "admin/membership-payment-settings" && !init) return null;
      if (path === "admin/membership-banks") return bankOptions;
      if (path === "admin/membership-payment-settings" && init) return savePromise;
      throw new Error(`Unexpected request: ${path}`);
    });
    providers(<MembershipPaymentSettingsForm />);

    fireEvent.change(await screen.findByLabelText("Search banks"), {
      target: { value: "vietcom" },
    });
    fireEvent.change(screen.getByLabelText("Bank"), { target: { value: "970436" } });
    expect(screen.getByRole("option", { name: "Vietcombank — VCB" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Account number"), {
      target: { value: "0123456789" },
    });
    fireEvent.change(screen.getByLabelText("Account holder"), {
      target: { value: "NATURAL FARMING VIETNAM" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: "Enable direct transfer" }));
    const save = screen.getByRole("button", { name: "Save settings" });
    fireEvent.click(save);
    fireEvent.click(save);

    const mutations = vi
      .mocked(api)
      .mock.calls.filter(([, init]) => init?.method === "PUT" || init?.method === "PATCH");
    expect(mutations).toHaveLength(1);
    expect(mutations[0][0]).toBe("admin/membership-payment-settings");
    expect(mutations[0][1]?.method).toBe("PUT");
    expect(JSON.parse(String(mutations[0][1]?.body))).toEqual({
      direct_transfer_enabled: true,
      bank_bin: "970436",
      account_number: "0123456789",
      account_name: "NATURAL FARMING VIETNAM",
      version: 0,
    });
    expect(save).toBeDisabled();

    await act(async () =>
      resolveSave({
        direct_transfer_enabled: true,
        bank_bin: "970436",
        bank_name: "Ngân hàng TMCP Ngoại Thương Việt Nam",
        account_number: "0123456789",
        account_name: "NATURAL FARMING VIETNAM",
        version: 1,
        updated_at: "2026-07-21T02:00:00Z",
      }),
    );
  });

  it("blocks the switch without a bank and accepts digits only in the account number", async () => {
    vi.mocked(api).mockImplementation(async (path) => {
      if (path === "admin/membership-payment-settings") return null;
      if (path === "admin/membership-banks") return bankOptions;
      throw new Error(`Unexpected request: ${path}`);
    });
    providers(<MembershipPaymentSettingsForm />);

    const toggle = await screen.findByRole("checkbox", {
      name: "Enable direct transfer",
    });
    fireEvent.change(screen.getByLabelText("Account number"), {
      target: { value: "12A 34-567890123456789999" },
    });
    expect(screen.getByLabelText("Account number")).toHaveValue("1234567890123456789");
    fireEvent.change(screen.getByLabelText("Account holder"), {
      target: { value: "NATURAL FARMING VIETNAM" },
    });
    fireEvent.click(toggle);

    expect(toggle).not.toBeChecked();
    expect(
      screen.getByText("This field is required when direct transfer is enabled."),
    ).toBeVisible();
    expect(vi.mocked(api).mock.calls.filter(([, init]) => init?.method === "PUT")).toHaveLength(0);

    fireEvent.change(screen.getByLabelText("Bank"), { target: { value: "970436" } });
    fireEvent.click(toggle);

    expect(toggle).toBeChecked();
    expect(screen.queryAllByRole("alert")).toHaveLength(0);
    expect(vi.mocked(api).mock.calls.filter(([, init]) => init?.method === "PUT")).toHaveLength(0);
  });

  it("saves disabled settings with empty bank fields", async () => {
    vi.mocked(api).mockImplementation(async (path, init) => {
      if (path === "admin/membership-banks") return bankOptions;
      if (path === "admin/membership-payment-settings" && !init) return null;
      if (path === "admin/membership-payment-settings" && init)
        return {
          direct_transfer_enabled: false,
          bank_bin: "",
          bank_name: "",
          account_number: "",
          account_name: "",
          version: 1,
          updated_at: "2026-07-21T02:00:00Z",
        };
      throw new Error(`Unexpected request: ${path}`);
    });
    providers(<MembershipPaymentSettingsForm />);

    fireEvent.click(await screen.findByRole("button", { name: "Save settings" }));
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith(
        "admin/membership-payment-settings",
        expect.objectContaining({ method: "PUT" }),
      ),
    );
    const mutation = vi.mocked(api).mock.calls.find(([, init]) => init?.method === "PUT");
    expect(JSON.parse(String(mutation?.[1]?.body))).toEqual({
      direct_transfer_enabled: false,
      bank_bin: "",
      account_number: "",
      account_name: "",
      version: 0,
    });
  });

  it("keeps direct transfer unavailable while bank loading fails and retries", async () => {
    let bankAttempts = 0;
    vi.mocked(api).mockImplementation(async (path) => {
      if (path === "admin/membership-payment-settings") return null;
      if (path === "admin/membership-banks") {
        bankAttempts += 1;
        if (bankAttempts === 1) throw new Error("bank_directory_unavailable");
        return bankOptions;
      }
      throw new Error(`Unexpected request: ${path}`);
    });
    providers(<MembershipPaymentSettingsForm />);

    expect(
      await screen.findByText("We could not load the bank list. Please try again."),
    ).toBeVisible();
    expect(screen.getByRole("checkbox", { name: "Enable direct transfer" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByRole("option", { name: "Vietcombank — VCB" })).toBeVisible();
    expect(screen.getByRole("checkbox", { name: "Enable direct transfer" })).toBeEnabled();
    expect(bankAttempts).toBe(2);
  });

  it("shows a stale payment settings conflict and reloads before another save", async () => {
    const current: MembershipPaymentSettings = {
      direct_transfer_enabled: false,
      bank_bin: "970436",
      bank_name: bankOptions[0].name,
      account_number: "0123456789",
      account_name: "FIRST ADMIN",
      version: 4,
      updated_at: "2026-08-01T02:00:00Z",
    };
    let settingsLoads = 0;
    vi.mocked(api).mockImplementation(async (path, init) => {
      if (path === "admin/membership-banks") return bankOptions;
      if (path === "admin/membership-payment-settings" && !init) {
        settingsLoads += 1;
        return settingsLoads === 1
          ? current
          : { ...current, account_name: "SECOND ADMIN", version: 5 };
      }
      if (path === "admin/membership-payment-settings" && init) {
        throw new Error("payment_settings_conflict");
      }
      throw new Error(`Unexpected request: ${path}`);
    });
    providers(<MembershipPaymentSettingsForm />);

    fireEvent.click(await screen.findByRole("button", { name: "Save settings" }));
    expect(await screen.findByText(/Another administrator updated these settings/)).toBeVisible();
    const mutation = vi.mocked(api).mock.calls.find(([, init]) => init?.method === "PATCH");
    expect(JSON.parse(String(mutation?.[1]?.body))).toMatchObject({ version: 4 });
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByDisplayValue("SECOND ADMIN")).toBeVisible();
    expect(settingsLoads).toBe(2);
  });

  it("removes the old standalone payment settings navigation", () => {
    providers(
      <AdminShell user={{ email: "admin@example.com", name: "Admin" }}>
        <div />
      </AdminShell>,
    );

    expect(screen.queryByRole("link", { name: "CSA payment" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Website" }));
    expect(screen.getByRole("link", { name: "Website information" })).toHaveAttribute(
      "href",
      "/settings",
    );
  });

  it("shows a CSA catalog overview linking to separate product and package managers", () => {
    providers(<MembershipCatalogOverview />);

    expect(screen.getByRole("link", { name: "Manage products" })).toHaveAttribute(
      "href",
      "/membership-catalog/products",
    );
    expect(screen.getByRole("link", { name: "Manage packages" })).toHaveAttribute(
      "href",
      "/membership-catalog/packages",
    );
    expect(screen.queryByRole("table")).toBeNull();
    expect(apiEnvelope).not.toHaveBeenCalled();
  });

  it("places product and package create actions beside their page headings", async () => {
    vi.mocked(apiEnvelope).mockResolvedValue({
      data: [],
      meta: { page: 1, page_size: 30, total: 0 },
    });
    const productPage = providers(await ProductListPage());
    expect(screen.getByRole("heading", { name: "CSA products" })).toBeVisible();
    expect(screen.getByRole("link", { name: "+ Create product" })).toHaveAttribute(
      "href",
      "/membership-catalog/products/new",
    );
    productPage.unmount();

    providers(await PackageListPage());
    expect(screen.getByRole("heading", { name: "CSA packages" })).toBeVisible();
    expect(screen.getByRole("link", { name: "+ Create package" })).toHaveAttribute(
      "href",
      "/membership-catalog/packages/new",
    );
  });

  it("shows loading and retries failed product and package lists", async () => {
    vi.mocked(apiEnvelope)
      .mockRejectedValueOnce(new Error("network_error"))
      .mockResolvedValueOnce({
        data: [catalogProduct],
        meta: { page: 1, page_size: 30, total: 1 },
      });
    const productList = providers(<MembershipProductList />);
    expect(screen.getByText("Loading products…")).toBeVisible();
    expect(await screen.findByRole("alert")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("link", { name: catalogProduct.name })).toBeVisible();
    productList.unmount();

    vi.mocked(apiEnvelope).mockReset();
    vi.mocked(apiEnvelope)
      .mockRejectedValueOnce(new Error("network_error"))
      .mockResolvedValueOnce({
        data: [catalogPackage],
        meta: { page: 1, page_size: 30, total: 1 },
      });
    providers(<MembershipPackageList />);
    expect(screen.getByText("Loading CSA packages…")).toBeVisible();
    expect(await screen.findByRole("alert")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("link", { name: catalogPackage.name })).toBeVisible();
  });

  it("links CSA product and package lists to their dedicated detail routes", async () => {
    vi.mocked(apiEnvelope).mockResolvedValue({
      data: [catalogProduct],
      meta: { page: 1, page_size: 30, total: 1 },
    });
    const productList = providers(<MembershipProductList />);
    expect(await screen.findByRole("link", { name: catalogProduct.name })).toHaveAttribute(
      "href",
      `/membership-catalog/products/${catalogProduct.id}`,
    );
    expect(screen.getAllByRole("link", { name: catalogProduct.name })).toHaveLength(1);
    expect(screen.queryByRole("link", { name: "+ Create product" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
    productList.unmount();

    vi.mocked(apiEnvelope).mockImplementation(async (path: string) => ({
      data: path.startsWith("admin/membership-products") ? [catalogProduct] : [catalogPackage],
      meta: { page: 1, page_size: 30, total: 1 },
    }));
    providers(<MembershipPackageList />);
    expect(await screen.findByRole("link", { name: catalogPackage.name })).toHaveAttribute(
      "href",
      `/membership-catalog/packages/${catalogPackage.id}`,
    );
    expect(screen.getAllByRole("link", { name: catalogPackage.name })).toHaveLength(1);
    expect(screen.queryByRole("link", { name: "+ Create package" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
  });

  it("shows the API result count consistently across all four CSA lists", async () => {
    vi.mocked(apiEnvelope).mockImplementation(async (path: string) => {
      if (path.startsWith("admin/membership-products")) {
        return { data: [catalogProduct], meta: { page: 1, page_size: 30, total: 41 } };
      }
      if (path.startsWith("admin/membership-packages")) {
        return { data: [catalogPackage], meta: { page: 1, page_size: 30, total: 32 } };
      }
      if (path.startsWith("admin/membership-requests")) {
        return { data: [membershipRequest], meta: { page: 1, page_size: 30, total: 17 } };
      }
      return { data: [membership], meta: { page: 1, page_size: 30, total: 9 } };
    });

    const productList = providers(<MembershipProductList />);
    const productSummary = await screen.findByText("41 results");
    expect(screen.getByRole("search")).not.toContainElement(productSummary);
    productList.unmount();

    const packageList = providers(<MembershipPackageList />);
    expect(await screen.findByText("32 results")).toBeVisible();
    expect(screen.queryByRole("search")).toBeNull();
    packageList.unmount();

    const requestList = providers(<MembershipRequestList />);
    const requestSummary = await screen.findByText("17 results");
    expect(screen.getByRole("search")).not.toContainElement(requestSummary);
    requestList.unmount();

    providers(<MembershipList />);
    const membershipSummary = await screen.findByText("9 results");
    expect(screen.getByRole("search")).not.toContainElement(membershipSummary);
  });

  it("submits and clears the product search and active filter through the API", async () => {
    vi.mocked(apiEnvelope).mockResolvedValue({
      data: [catalogProduct],
      meta: { page: 1, page_size: 30, total: 1 },
    });
    providers(<MembershipProductList />);

    await screen.findByRole("link", { name: catalogProduct.name });
    fireEvent.change(screen.getByRole("searchbox", { name: "Search products" }), {
      target: { value: "vegetable" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Filter by status" }), {
      target: { value: "false" },
    });
    await waitFor(() =>
      expect(apiEnvelope).toHaveBeenLastCalledWith("admin/membership-products?page=1&active=false"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() =>
      expect(apiEnvelope).toHaveBeenLastCalledWith(
        "admin/membership-products?page=1&search=vegetable&active=false",
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    await waitFor(() =>
      expect(apiEnvelope).toHaveBeenLastCalledWith("admin/membership-products?page=1"),
    );
    expect(screen.getByRole("searchbox", { name: "Search products" })).toHaveValue("");
    expect(screen.getByRole("combobox", { name: "Filter by status" })).toHaveValue("");
  });

  it("shows full product detail with correct back and edit destinations", async () => {
    vi.mocked(api).mockResolvedValue(catalogProduct);
    providers(<MembershipProductDetail productId={catalogProduct.id} />);

    expect(await screen.findByRole("heading", { name: catalogProduct.name })).toBeVisible();
    expect(screen.getByText("Fresh vegetables")).toBeVisible();
    expect(screen.getByText("1 unit = 0.500 kg")).toBeVisible();
    expect(screen.getByRole("link", { name: "Product list" })).toHaveAttribute(
      "href",
      "/membership-catalog/products",
    );
    expect(screen.getByRole("link", { name: "Edit product" })).toHaveAttribute(
      "href",
      `/membership-catalog/products/${catalogProduct.id}/edit`,
    );
  });

  it("shows full package detail with products and correct edit destination", async () => {
    vi.mocked(api).mockResolvedValue(catalogPackage);
    providers(<MembershipPackageDetail packageId={catalogPackage.id} />);

    expect(await screen.findByRole("heading", { name: catalogPackage.name })).toBeVisible();
    expect(screen.getByText("Seasonal vegetables")).toBeVisible();
    expect(screen.getByText("Vegetable basket")).toBeVisible();
    expect(screen.getByText("1 unit = 0.500 kg")).toBeVisible();
    expect(screen.getByRole("link", { name: "Package list" })).toHaveAttribute(
      "href",
      "/membership-catalog/packages",
    );
    expect(screen.getByRole("link", { name: "Edit package" })).toHaveAttribute(
      "href",
      `/membership-catalog/packages/${catalogPackage.id}/edit`,
    );
  });

  it("localizes product unit conversion in Vietnamese", async () => {
    vi.mocked(api).mockResolvedValue(catalogProduct);
    providers(<MembershipProductDetail productId={catalogProduct.id} />, "vi");

    expect(await screen.findByText("1 đơn vị = 0.500 kg")).toBeVisible();
    expect(screen.queryByText("1 unit = 0.500 kg")).toBeNull();
  });

  it("deletes products and packages from detail after confirmation and returns to list", async () => {
    vi.mocked(api).mockImplementation(async (path: string, init?: RequestInit) => {
      if (init?.method === "DELETE") return {};
      return path.includes("membership-products") ? catalogProduct : catalogPackage;
    });
    const productDetail = providers(<MembershipProductDetail productId={catalogProduct.id} />);
    await screen.findByRole("heading", { name: catalogProduct.name });
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    const productDialog = screen.getByRole("dialog", { name: "Confirm deletion" });
    fireEvent.click(within(productDialog).getByRole("button", { name: "Delete" }));
    await waitFor(() =>
      expect(navigation.replace).toHaveBeenCalledWith("/membership-catalog/products"),
    );
    expect(api).toHaveBeenCalledWith(`admin/membership-products/${catalogProduct.id}`, {
      method: "DELETE",
    });
    productDetail.unmount();

    navigation.replace.mockClear();
    providers(<MembershipPackageDetail packageId={catalogPackage.id} />);
    await screen.findByRole("heading", { name: catalogPackage.name });
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    const packageDialog = screen.getByRole("dialog", { name: "Confirm deletion" });
    fireEvent.click(within(packageDialog).getByRole("button", { name: "Delete" }));
    await waitFor(() =>
      expect(navigation.replace).toHaveBeenCalledWith("/membership-catalog/packages"),
    );
    expect(api).toHaveBeenCalledWith(`admin/membership-packages/${catalogPackage.id}`, {
      method: "DELETE",
    });
  });

  it("cancels new product and package editors back to their lists", async () => {
    const productEditor = providers(<MembershipProductEditor />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(navigation.push).toHaveBeenCalledWith("/membership-catalog/products");
    productEditor.unmount();

    navigation.push.mockClear();
    vi.mocked(apiEnvelope).mockResolvedValue({
      data: [catalogProduct],
      meta: { page: 1, page_size: 30, total: 1 },
    });
    providers(<MembershipPackageEditor />);
    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));
    expect(navigation.push).toHaveBeenCalledWith("/membership-catalog/packages");
  });

  it("shows explicit loading states while product and package edit data is pending", async () => {
    let resolveProduct!: (value: MembershipProduct) => void;
    vi.mocked(api).mockReturnValueOnce(
      new Promise<MembershipProduct>((resolve) => {
        resolveProduct = resolve;
      }),
    );
    const productEditor = providers(<MembershipProductEditor productId={catalogProduct.id} />);
    expect(screen.getByText("Loading product…")).toBeVisible();
    await act(async () => resolveProduct(catalogProduct));
    expect(await screen.findByDisplayValue(catalogProduct.name)).toBeVisible();
    productEditor.unmount();

    let resolvePackage!: (value: MembershipPackage) => void;
    vi.mocked(api).mockReturnValueOnce(
      new Promise<MembershipPackage>((resolve) => {
        resolvePackage = resolve;
      }),
    );
    vi.mocked(apiEnvelope).mockResolvedValue({
      data: [catalogProduct],
      meta: { page: 1, page_size: 30, total: 1 },
    });
    providers(<MembershipPackageEditor packageId={catalogPackage.id} />);
    expect(screen.getByText("Loading CSA package…")).toBeVisible();
    await act(async () => resolvePackage(catalogPackage));
    expect(await screen.findByDisplayValue(catalogPackage.name)).toBeVisible();
  });

  it("retries failed product and package edit loads", async () => {
    vi.mocked(api)
      .mockRejectedValueOnce(new Error("network_error"))
      .mockResolvedValueOnce(catalogProduct);
    const productEditor = providers(<MembershipProductEditor productId={catalogProduct.id} />);
    expect(await screen.findByRole("alert")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByDisplayValue(catalogProduct.name)).toBeVisible();
    expect(api).toHaveBeenCalledTimes(2);
    productEditor.unmount();

    vi.mocked(api).mockReset();
    vi.mocked(api)
      .mockRejectedValueOnce(new Error("network_error"))
      .mockResolvedValueOnce(catalogPackage);
    vi.mocked(apiEnvelope).mockResolvedValue({
      data: [catalogProduct],
      meta: { page: 1, page_size: 30, total: 1 },
    });
    providers(<MembershipPackageEditor packageId={catalogPackage.id} />);
    expect(await screen.findByRole("alert")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByDisplayValue(catalogPackage.name)).toBeVisible();
    expect(api).toHaveBeenCalledTimes(2);
  });

  it("preserves edited CSA form values after a save error", async () => {
    vi.mocked(api).mockImplementation(async (path: string, init?: RequestInit) => {
      if (init?.method === "PATCH") throw new Error("network_error");
      return path.includes("membership-products") ? catalogProduct : catalogPackage;
    });
    vi.mocked(apiEnvelope).mockResolvedValue({
      data: [catalogProduct],
      meta: { page: 1, page_size: 30, total: 1 },
    });

    const productEditor = providers(<MembershipProductEditor productId={catalogProduct.id} />);
    const productName = await screen.findByDisplayValue(catalogProduct.name);
    fireEvent.change(productName, { target: { value: "Unsaved basket" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toBeVisible();
    expect(screen.getByDisplayValue("Unsaved basket")).toBeVisible();
    productEditor.unmount();

    providers(<MembershipPackageEditor packageId={catalogPackage.id} />);
    const packageName = await screen.findByDisplayValue(catalogPackage.name);
    fireEvent.change(packageName, { target: { value: "Unsaved package" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toBeVisible();
    expect(screen.getByDisplayValue("Unsaved package")).toBeVisible();
  });

  it("keeps edit data and returns each saved CSA editor to its detail", async () => {
    vi.mocked(api).mockImplementation(async (path: string) => {
      if (path.startsWith("admin/membership-products/")) return catalogProduct;
      return catalogPackage;
    });
    vi.mocked(apiEnvelope).mockResolvedValue({
      data: [catalogProduct],
      meta: { page: 1, page_size: 30, total: 1 },
    });

    const productEditor = providers(<MembershipProductEditor productId={catalogProduct.id} />);
    expect(await screen.findByDisplayValue(catalogProduct.name)).toBeVisible();
    fireEvent.change(screen.getByLabelText("Name *"), { target: { value: "Updated basket" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(navigation.replace).toHaveBeenCalledWith(
        `/membership-catalog/products/${catalogProduct.id}`,
      ),
    );
    expect(api).toHaveBeenCalledWith(
      `admin/membership-products/${catalogProduct.id}`,
      expect.objectContaining({ method: "PATCH" }),
    );
    productEditor.unmount();

    navigation.replace.mockClear();
    providers(<MembershipPackageEditor packageId={catalogPackage.id} />);
    expect(await screen.findByDisplayValue(catalogPackage.name)).toBeVisible();
    fireEvent.change(screen.getByLabelText("Name *"), { target: { value: "Updated CSA" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(navigation.replace).toHaveBeenCalledWith(
        `/membership-catalog/packages/${catalogPackage.id}`,
      ),
    );
    expect(api).toHaveBeenCalledWith(
      `admin/membership-packages/${catalogPackage.id}`,
      expect.objectContaining({ method: "PATCH" }),
    );
  });

  it("builds a package with unique product rows and the backend contract", async () => {
    const products: MembershipProduct[] = [
      {
        id: membershipRequest.package.items[0].product_id,
        name: "Vegetable basket",
        short_description: "Fresh vegetables",
        unit_size: "0.500",
        unit_label_vi: "kg",
        unit_label_en: "kg",
        is_active: true,
        created_at: "2026-07-20T02:00:00Z",
        updated_at: "2026-07-20T02:00:00Z",
      },
      {
        id: "7d67184a-fddf-4a26-916c-516481d18f43",
        name: "Herb basket",
        short_description: "Fresh herbs",
        unit_size: "0.250",
        unit_label_vi: "kg",
        unit_label_en: "kg",
        is_active: true,
        created_at: "2026-07-20T02:00:00Z",
        updated_at: "2026-07-20T02:00:00Z",
      },
    ];
    vi.mocked(apiEnvelope).mockImplementation(async (path: string) => ({
      data: path.startsWith("admin/membership-products") ? products : [],
      meta: { page: 1, page_size: 30, total: path.includes("products") ? 2 : 0 },
    }));
    vi.mocked(api).mockResolvedValue(catalogPackage);
    providers(<MembershipPackageEditor />);

    await screen.findByLabelText("Name *");
    fireEvent.change(screen.getByLabelText("Name *"), { target: { value: "CSA package" } });
    const price = screen.getByLabelText("One-time payment *");
    const duration = screen.getByLabelText("Months *");
    expect(price).toHaveAttribute("type", "text");
    expect(price).toHaveAttribute("inputmode", "numeric");
    fireEvent.change(price, { target: { value: "abc6000000e+" } });
    expect(price).toHaveValue("6000000");
    fireEvent.change(duration, { target: { value: "+121" } });
    expect(duration).toHaveValue("121");
    fireEvent.change(screen.getByLabelText("Product 1"), {
      target: { value: products[0].id },
    });
    const firstQuota = screen.getByLabelText("Included units each month 1");
    fireEvent.change(firstQuota, { target: { value: "-0" } });
    expect(firstQuota).toHaveValue("0");
    fireEvent.click(screen.getByRole("button", { name: "+ Add product" }));
    const secondProduct = screen.getByLabelText("Product 2");
    expect(within(secondProduct).queryByRole("option", { name: "Vegetable basket" })).toBeNull();
    fireEvent.change(secondProduct, { target: { value: products[1].id } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByText("The value must not exceed 120.")).toBeVisible();
    expect(screen.getByText(/whole number greater than 0/i)).toBeVisible();
    expect(api).not.toHaveBeenCalled();

    fireEvent.change(duration, { target: { value: "0012" } });
    fireEvent.change(firstQuota, { target: { value: "-02" } });
    const secondQuota = screen.getByLabelText("Included units each month 2");
    fireEvent.change(secondQuota, { target: { value: "abc0003e+" } });
    expect(firstQuota).toHaveValue("02");
    expect(secondQuota).toHaveValue("0003");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(api).toHaveBeenCalledWith(
        "admin/membership-packages",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    const createCall = vi
      .mocked(api)
      .mock.calls.find(([path]) => path === "admin/membership-packages");
    expect(JSON.parse(String(createCall?.[1]?.body))).toMatchObject({
      upfront_price: 6000000,
      duration_months: 12,
      items: [
        { product_id: products[0].id, quota_units: 2 },
        { product_id: products[1].id, quota_units: 3 },
      ],
    });
    expect(navigation.replace).toHaveBeenCalledWith(
      `/membership-catalog/packages/${catalogPackage.id}`,
    );
  });

  it("loads one searchable product page at a time and preserves selected products", async () => {
    const secondProduct = {
      ...catalogProduct,
      id: "7d67184a-fddf-4a26-916c-516481d18f43",
      name: "Herbs",
    };
    vi.mocked(apiEnvelope).mockImplementation(async (path: string) => {
      const query = new URLSearchParams(path.split("?")[1]);
      const page = Number(query.get("page"));
      return {
        data: page === 1 ? [catalogProduct] : [secondProduct],
        meta: { page, page_size: 30, total: 31 },
      };
    });
    providers(<MembershipPackageEditor />);

    const firstSelect = await screen.findByLabelText("Product 1");
    fireEvent.change(firstSelect, { target: { value: catalogProduct.id } });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByRole("option", { name: "Herbs" })).toBeVisible();
    expect(screen.getByLabelText("Product 1")).toHaveValue(catalogProduct.id);
    expect(vi.mocked(apiEnvelope).mock.calls.map(([path]) => path)).toEqual([
      "admin/membership-products?page=1&active=true",
      "admin/membership-products?page=2&active=true",
    ]);

    fireEvent.change(screen.getByLabelText("Search products"), {
      target: { value: "herbs" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() =>
      expect(apiEnvelope).toHaveBeenLastCalledWith(
        "admin/membership-products?page=1&active=true&search=herbs",
      ),
    );
    expect(screen.getByLabelText("Product 1")).toHaveValue(catalogProduct.id);
  });

  it("sanitizes and validates product unit size before sending a numeric decimal", async () => {
    vi.mocked(apiEnvelope).mockResolvedValue({
      data: [],
      meta: { page: 1, page_size: 30, total: 0 },
    });
    vi.mocked(api).mockResolvedValue(catalogProduct);
    providers(<MembershipProductEditor />);

    const unitSize = screen.getByLabelText("Unit size *");
    expect(unitSize).toHaveAttribute("type", "text");
    expect(unitSize).toHaveAttribute("inputmode", "decimal");

    for (const [input, expected] of [
      ["abc", ""],
      ["1e3", "13"],
      ["1.2.3", "1.23"],
      ["0.1234", "0.1234"],
    ]) {
      fireEvent.change(unitSize, { target: { value: input } });
      expect(unitSize).toHaveValue(expected);
    }
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByText(/no more than 3 decimal places/i)).toBeVisible();
    expect(api).not.toHaveBeenCalled();

    fireEvent.change(unitSize, { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByText(/decimal number greater than 0/i)).toBeVisible();

    fireEvent.change(screen.getByLabelText("Name *"), { target: { value: "Vegetable basket" } });
    fireEvent.change(screen.getByLabelText("Vietnamese unit label *"), {
      target: { value: "kg" },
    });
    fireEvent.change(screen.getByLabelText("English unit label *"), {
      target: { value: "kg" },
    });
    fireEvent.change(unitSize, { target: { value: "0,500" } });
    expect(unitSize).toHaveValue("0.500");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(api).toHaveBeenCalledWith(
        "admin/membership-products",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    const payload = JSON.parse(String(vi.mocked(api).mock.calls[0][1]?.body));
    expect(payload.unit_size).toBe(0.5);
    expect(typeof payload.unit_size).toBe("number");
    expect(payload).not.toHaveProperty("category_id");
    expect(navigation.replace).toHaveBeenCalledWith(
      `/membership-catalog/products/${catalogProduct.id}`,
    );
  });

  it("searches, filters, clears and paginates CSA request and Membership lists", async () => {
    vi.mocked(apiEnvelope).mockImplementation(async (path: string) => ({
      data: path.startsWith("admin/membership-requests") ? [membershipRequest] : [membership],
      meta: { page: 1, page_size: 30, total: 31 },
    }));
    const requestView = providers(<MembershipRequestList />);

    const requestLink = await screen.findByRole("link", { name: customer.name });
    expect(requestLink).toHaveAttribute("href", `/membership-requests/${membershipRequest.id}`);
    expect(screen.getAllByRole("link", { name: customer.name })).toHaveLength(1);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "0918765432" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() =>
      expect(apiEnvelope).toHaveBeenLastCalledWith(expect.stringContaining("search=0918765432")),
    );
    fireEvent.change(screen.getByRole("combobox", { name: "Filter by status" }), {
      target: { value: "payment_submitted" },
    });
    await waitFor(() =>
      expect(apiEnvelope).toHaveBeenLastCalledWith(
        expect.stringContaining("status=payment_submitted"),
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() =>
      expect(apiEnvelope).toHaveBeenLastCalledWith(expect.stringContaining("page=2")),
    );
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    await waitFor(() =>
      expect(apiEnvelope).toHaveBeenLastCalledWith("admin/membership-requests?page=1"),
    );
    expect(screen.getByRole("searchbox")).toHaveValue("");
    expect(screen.getByRole("combobox", { name: "Filter by status" })).toHaveValue("");

    requestView.unmount();
    providers(<MembershipList />);
    expect(await screen.findByText("Six month CSA")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Green Member" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() =>
      expect(apiEnvelope).toHaveBeenLastCalledWith(expect.stringContaining("search=Green+Member")),
    );
    expect(screen.getAllByRole("link", { name: customer.name })).toHaveLength(1);
  });

  it("keeps old data and count visible while disabling all controls for a pending filter", async () => {
    let resolveFiltered!: (value: {
      data: MembershipProduct[];
      meta: { page: number; page_size: number; total: number };
    }) => void;
    vi.mocked(apiEnvelope).mockImplementation(async (path: string) => {
      if (path.includes("active=false")) {
        return new Promise((resolve) => {
          resolveFiltered = resolve;
        });
      }
      return {
        data: [catalogProduct],
        meta: { page: 1, page_size: 30, total: 31 },
      };
    });
    providers(<MembershipProductList />);

    expect(screen.queryByText(/\d+ results/)).toBeNull();
    const detailLink = await screen.findByRole("link", { name: catalogProduct.name });
    expect(screen.getByText("31 results")).toBeVisible();
    const searchRegion = screen.getByRole("search");
    const searchbox = screen.getByRole("searchbox", { name: "Search products" });
    const statusFilter = screen.getByRole("combobox", { name: "Filter by status" });
    expect(searchRegion).not.toContainElement(screen.getByText("31 results"));
    fireEvent.change(statusFilter, { target: { value: "false" } });

    await waitFor(() => expect(searchbox).toBeDisabled());
    expect(detailLink).toBeVisible();
    expect(statusFilter).toBeDisabled();
    expect(screen.getByRole("button", { name: "Searching…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Clear filters" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    expect(screen.getByRole("navigation", { name: "Page {page}/{pages}" })).toHaveAttribute(
      "aria-busy",
      "true",
    );
    expect(detailLink.closest("section")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("status")).toHaveTextContent("Loading products…");
    expect(screen.getByText("31 results")).toBeVisible();

    await act(async () =>
      resolveFiltered({
        data: [{ ...catalogProduct, id: "filtered-product", name: "Filtered product" }],
        meta: { page: 1, page_size: 30, total: 1 },
      }),
    );
    expect(await screen.findByRole("link", { name: "Filtered product" })).toBeVisible();
    expect(screen.getByText("1 result")).toBeVisible();
  });

  it("ignores a stale paginated response that resolves after the latest request", async () => {
    let resolveOld!: (value: { data: MembershipProduct[]; meta: PaginationMeta }) => void;
    let resolveNew!: (value: { data: MembershipProduct[]; meta: PaginationMeta }) => void;
    const fetcher = vi.fn(
      (requestKey: string) =>
        new Promise<{ data: MembershipProduct[]; meta: PaginationMeta }>((resolve) => {
          if (requestKey === "old") resolveOld = resolve;
          else resolveNew = resolve;
        }),
    );
    const view = render(<PaginatedListHarness fetcher={fetcher} requestKey="old" />);
    await waitFor(() => expect(fetcher).toHaveBeenCalledWith("old", 1));
    view.rerender(<PaginatedListHarness fetcher={fetcher} requestKey="new" />);
    await waitFor(() => expect(fetcher).toHaveBeenCalledWith("new", 1));

    await act(async () =>
      resolveNew({
        data: [{ ...catalogProduct, id: "new", name: "Newest response" }],
        meta: { page: 1, page_size: 30, total: 2 },
      }),
    );
    expect(await screen.findByText("Newest response")).toBeVisible();
    expect(screen.getByTestId("harness-total")).toHaveTextContent("2");

    await act(async () =>
      resolveOld({
        data: [{ ...catalogProduct, id: "old", name: "Stale response" }],
        meta: { page: 1, page_size: 30, total: 99 },
      }),
    );
    expect(screen.queryByText("Stale response")).toBeNull();
    expect(screen.getByText("Newest response")).toBeVisible();
    expect(screen.getByTestId("harness-total")).toHaveTextContent("2");
  });

  it("shows only valid request actions and confirms approval once", async () => {
    let resolveApprove!: (value: unknown) => void;
    const approvePromise = new Promise((resolve) => {
      resolveApprove = resolve;
    });
    let detailLoads = 0;
    vi.mocked(api).mockImplementation(async (path: string, init?: RequestInit) => {
      if (!init) {
        detailLoads += 1;
        return detailLoads === 1
          ? membershipRequest
          : { ...membershipRequest, status: "approved", approved_at: "2026-07-21T02:00:00Z" };
      }
      if (path.endsWith("/approve")) return approvePromise;
      throw new Error("unexpected_request");
    });
    providers(<MembershipRequestDetail requestId={membershipRequest.id} />);

    expect(await screen.findByRole("button", { name: "Approve payment" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Return to payment pending" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reject" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mark contacted" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Approve payment" }));
    const dialog = screen.getByRole("dialog", { name: "Confirm payment approval" });
    expect(dialog).toHaveTextContent("future start date creates a scheduled Membership");
    fireEvent.change(within(dialog).getByLabelText("Start date *"), {
      target: { value: "2026-08-15" },
    });
    const confirm = within(dialog).getByRole("button", { name: "Approve and create Membership" });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(confirm).toBeDisabled();
    expect(vi.mocked(api).mock.calls.filter(([path]) => path.endsWith("/approve"))).toHaveLength(1);

    await act(async () => resolveApprove({ data: membership }));
    await waitFor(() => expect(screen.getByText("Approved")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Reject" })).not.toBeInTheDocument();
    const actionCall = vi.mocked(api).mock.calls.find(([path]) => path.endsWith("/approve"));
    expect(actionCall?.[0]).toBe(`admin/membership-requests/${membershipRequest.id}/approve`);
    expect(JSON.parse(String(actionCall?.[1]?.body))).toEqual({ start_date: "2026-08-15" });
  });

  it("prevents approving a CSA request with a past start date", async () => {
    vi.mocked(api).mockResolvedValue(membershipRequest);
    providers(<MembershipRequestDetail requestId={membershipRequest.id} />);

    fireEvent.click(await screen.findByRole("button", { name: "Approve payment" }));
    const dialog = screen.getByRole("dialog", { name: "Confirm payment approval" });
    const input = within(dialog).getByLabelText("Start date *");
    const dateFormatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Ho_Chi_Minh",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const dateInputValue = (value: Date) => {
      const parts = dateFormatter
        .formatToParts(value)
        .reduce<Record<string, string>>((result, part) => {
          result[part.type] = part.value;
          return result;
        }, {});
      return `${parts.year}-${parts.month}-${parts.day}`;
    };
    const minimumDate = dateInputValue(new Date());
    const pastDate = dateInputValue(new Date(Date.now() - 24 * 60 * 60 * 1000));
    expect(input).toHaveAttribute("min", minimumDate);
    fireEvent.change(input, { target: { value: pastDate } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Approve and create Membership" }));

    expect(
      await within(dialog).findByText("The start date must be today or a future date."),
    ).toBeVisible();
    expect(vi.mocked(api).mock.calls.filter(([path]) => path.endsWith("/approve"))).toHaveLength(0);
  });

  it("confirms payment instruction once, disables actions, and keeps errors retryable", async () => {
    const contactedRequest: MembershipRequest = {
      ...membershipRequest,
      status: "contacted",
      payment_instruction: null,
      payment_submitted_at: null,
    };
    let rejectFirstIssue!: (reason: unknown) => void;
    const firstIssue = new Promise<MembershipRequest>((_, reject) => {
      rejectFirstIssue = reject;
    });
    let issueAttempts = 0;
    vi.mocked(api).mockImplementation(async (path: string, init?: RequestInit) => {
      if (!init) return contactedRequest;
      if (path.endsWith("/issue-payment-instruction") && init.method === "POST") {
        issueAttempts += 1;
        if (issueAttempts === 1) return firstIssue;
        return {
          ...contactedRequest,
          status: "payment_pending",
          payment_instruction: membershipRequest.payment_instruction,
        };
      }
      throw new Error("unexpected_request");
    });
    providers(<MembershipRequestDetail requestId={membershipRequest.id} />);

    const issue = await screen.findByRole("button", { name: "Issue payment instruction" });
    fireEvent.click(issue);
    const dialog = screen.getByRole("dialog", { name: "Confirm payment instruction" });
    expect(dialog).toHaveTextContent("creates and finalizes the payment instruction");
    expect(
      vi.mocked(api).mock.calls.filter(([path]) => path.endsWith("/issue-payment-instruction")),
    ).toHaveLength(0);

    const confirm = within(dialog).getByRole("button", { name: "Issue payment instruction" });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(
      vi.mocked(api).mock.calls.filter(([path]) => path.endsWith("/issue-payment-instruction")),
    ).toHaveLength(1);
    expect(within(dialog).getByRole("button", { name: "Processing…" })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(issue).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reject" })).toBeDisabled();

    await act(async () => rejectFirstIssue(new Error("network_error")));
    expect(await within(dialog).findByText(/could not connect/i)).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Confirm payment instruction" })).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "Issue payment instruction" }));
    await waitFor(() => expect(screen.getByText("Payment pending")).toBeInTheDocument());
    expect(screen.queryByRole("dialog", { name: "Confirm payment instruction" })).toBeNull();
    expect(screen.getByText("Payment instructions were issued.")).toBeInTheDocument();
    const issueCalls = vi
      .mocked(api)
      .mock.calls.filter(([path]) => path.endsWith("/issue-payment-instruction"));
    expect(issueCalls).toHaveLength(2);
    expect(issueCalls[0][0]).toBe(
      `admin/membership-requests/${membershipRequest.id}/issue-payment-instruction`,
    );
    expect(issueCalls[0][1]?.method).toBe("POST");
    expect(JSON.parse(String(issueCalls[0][1]?.body))).toEqual({});
  });

  it("does not offer usage creation for a scheduled Membership", async () => {
    vi.mocked(api).mockResolvedValue({ ...membership, status: "scheduled", quota: [], cycles: [] });
    vi.mocked(apiEnvelope).mockResolvedValue({
      data: [],
      meta: { page: 1, page_size: 30, total: 0 },
    });
    providers(<MembershipDetail membershipId={membership.id} />);

    expect(await screen.findByText("Scheduled")).toBeInTheDocument();
    expect(screen.getByText(/products cannot be collected or recorded yet/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Record received products" }),
    ).not.toBeInTheDocument();
  });

  it("renders the final remaining product amount instead of a units multiplication", async () => {
    vi.mocked(api).mockResolvedValue({
      ...membership,
      quota: membership.quota?.map((quota) => ({ ...quota, unit_size: "0.5" })),
    });
    vi.mocked(apiEnvelope).mockResolvedValue({
      data: [],
      meta: { page: 1, page_size: 30, total: 0 },
    });
    providers(<MembershipDetail membershipId={membership.id} />);

    expect(await screen.findByText("1 kg")).toBeVisible();
    expect(screen.queryByText("2 × 0.5 kg")).toBeNull();
  });

  it("keeps one usage idempotency key for a failed request retry and blocks rapid submit", async () => {
    let createAttempts = 0;
    vi.mocked(api).mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === `admin/memberships/${membership.id}`) return membership;
      if (path === "admin/membership-usage" && init?.method === "POST") {
        createAttempts += 1;
        if (createAttempts === 1) throw new Error("network_error");
        return {
          id: "usage-id",
          membership_id: membership.id,
          status: "applied",
          note: "Delivery",
          created_at: "2026-07-21T02:00:00Z",
          reversed_at: null,
          lines: [],
        } satisfies MembershipUsage;
      }
      throw new Error("unexpected_request");
    });
    vi.mocked(apiEnvelope).mockResolvedValue({
      data: [],
      meta: { page: 1, page_size: 30, total: 0 },
    });
    providers(<MembershipDetail membershipId={membership.id} />);

    fireEvent.click(await screen.findByRole("button", { name: "Record received products" }));
    const dialog = screen.getByRole("dialog", { name: "Record received products" });
    fireEvent.change(within(dialog).getByLabelText("Note"), { target: { value: "Delivery" } });
    const confirm = within(dialog).getByRole("button", { name: "Record received products" });
    const units = within(dialog).getByLabelText("Units 1");
    expect(units).toHaveAttribute("type", "text");
    expect(units).toHaveAttribute("inputmode", "numeric");
    fireEvent.change(units, { target: { value: "abc1e+3.0" } });
    expect(units).toHaveValue("130");
    fireEvent.change(units, { target: { value: "0" } });
    fireEvent.click(confirm);
    expect(within(dialog).getByText(/whole number greater than 0/i)).toBeVisible();
    expect(
      vi.mocked(api).mock.calls.filter(([path]) => path === "admin/membership-usage"),
    ).toHaveLength(0);
    fireEvent.change(units, { target: { value: "0002" } });
    expect(units).toHaveValue("0002");
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(
      vi.mocked(api).mock.calls.filter(([path]) => path === "admin/membership-usage"),
    ).toHaveLength(1);
    expect(await within(dialog).findByText(/could not connect/i)).toBeInTheDocument();

    fireEvent.click(confirm);
    await waitFor(() =>
      expect(
        vi.mocked(api).mock.calls.filter(([path]) => path === "admin/membership-usage"),
      ).toHaveLength(2),
    );
    const calls = vi
      .mocked(api)
      .mock.calls.filter(([path]) => path === "admin/membership-usage")
      .map(([, init]) => JSON.parse(String(init?.body)));
    expect(calls[0].idempotency_key).toMatch(/^[0-9a-f-]{36}$/i);
    expect(calls[1].idempotency_key).toBe(calls[0].idempotency_key);
    expect(calls[0]).toMatchObject({
      membership_id: membership.id,
      note: "Delivery",
      lines: [{ product_id: membership.quota?.[0].product_id, units: 2 }],
    });
  });

  it("confirms undo with a required reason and submits it only once", async () => {
    let resolveUndo!: (value: MembershipUsage) => void;
    const undoPromise = new Promise<MembershipUsage>((resolve) => {
      resolveUndo = resolve;
    });
    const usage: MembershipUsage = {
      id: "usage-id",
      membership_id: membership.id,
      status: "applied",
      note: "Delivery",
      created_at: "2026-07-21T02:00:00Z",
      reversed_at: null,
      lines: [
        {
          product_id: membership.quota![0].product_id,
          product_name: "Vegetable basket",
          units: 1,
          allocations: [{ cycle: 1, units: 1 }],
        },
      ],
    };
    vi.mocked(api).mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === `admin/memberships/${membership.id}`) return membership;
      if (path.endsWith("/undo") && init?.method === "POST") return undoPromise;
      throw new Error("unexpected_request");
    });
    vi.mocked(apiEnvelope).mockResolvedValue({
      data: [usage],
      meta: { page: 1, page_size: 30, total: 1 },
    });
    providers(<MembershipDetail membershipId={membership.id} />);

    fireEvent.click(await screen.findByRole("button", { name: "Undo product collection" }));
    const dialog = screen.getByRole("dialog", { name: "Confirm product collection undo" });
    const confirm = within(dialog).getByRole("button", { name: "Confirm undo" });
    expect(confirm).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText("Reason *"), {
      target: { value: "Wrong delivery" },
    });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(vi.mocked(api).mock.calls.filter(([path]) => path.endsWith("/undo"))).toHaveLength(1);
    const undoCall = vi.mocked(api).mock.calls.find(([path]) => path.endsWith("/undo"));
    expect(undoCall?.[0]).toBe(`admin/membership-usage/${usage.id}/undo`);
    expect(JSON.parse(String(undoCall?.[1]?.body))).toEqual({ reason: "Wrong delivery" });

    await act(async () => resolveUndo({ ...usage, status: "reversed" }));
  });
});
