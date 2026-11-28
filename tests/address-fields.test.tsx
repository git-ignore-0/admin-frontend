import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";

import {
  AddressFields,
  useAddressFields,
  type AddressFieldsValue,
} from "@/components/address-fields";
import { AdminI18nProvider, useAdminI18n } from "@/components/admin-i18n-provider";
import { deferred } from "./deferred";
import { selectOption } from "./select-option";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const emptyAddress: AddressFieldsValue = { province_code: "", ward_code: "", address: "" };
const savedAddress: AddressFieldsValue = {
  province_code: "01",
  ward_code: "00004",
  address: "10 Main Street",
};
const supported = [
  {
    province_code: "01",
    province_name: "A province with a long administrative name",
    wards: [{ ward_code: "00004", ward_name: "Ward A", shipping_fee_vnd: "1000" }],
  },
  {
    province_code: "02",
    province_name: "B province",
    wards: [{ ward_code: "00006", ward_name: "Ward B", shipping_fee_vnd: "1000" }],
  },
  { province_code: "03", province_name: "No supported ward", wards: [] },
];

function renderFields({
  locale = "en",
  value = emptyAddress,
  disabled = false,
  errors,
}: {
  locale?: "en" | "vi";
  value?: AddressFieldsValue;
  disabled?: boolean;
  errors?: Partial<Record<keyof AddressFieldsValue, string>>;
} = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const changes = vi.fn<(address: AddressFieldsValue) => void>();
  function Form() {
    const [address, setAddress] = useState(value);
    const { setLocale } = useAdminI18n();
    const state = useAddressFields(address);
    return (
      <form aria-label="Shipping editor">
        <AddressFields
          value={address}
          onChange={(next) => {
            changes(next);
            setAddress(next);
          }}
          state={state}
          disabled={disabled}
          errors={errors}
        />
        <button type="button" disabled={disabled || !state.valid}>
          Save
        </button>
        <button type="button" onClick={() => setLocale("vi")}>
          Vietnamese
        </button>
      </form>
    );
  }
  return {
    client,
    changes,
    ...render(
      <QueryClientProvider client={client}>
        <AdminI18nProvider initialLocale={locale}>
          <Form />
        </AdminI18nProvider>
      </QueryClientProvider>,
    ),
  };
}

it.each([
  [
    "en",
    "Province/City",
    "Ward/Commune",
    "Detailed address",
    "Select province/city",
    "Select ward/commune",
    "House number, street, village/hamlet...",
  ],
  [
    "vi",
    "Tỉnh/Thành phố",
    "Phường/Xã",
    "Địa chỉ chi tiết",
    "Chọn tỉnh/thành phố",
    "Chọn phường/xã",
    "Số nhà, đường, thôn/xóm...",
  ],
] as const)(
  "renders the three Foundation fields in %s",
  async (locale, provinceLabel, wardLabel, addressLabel, provinceHint, wardHint, addressHint) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ data: supported })),
    );
    const { container } = renderFields({ locale });
    const province = screen.getByRole("combobox", { name: provinceLabel });
    const ward = screen.getByRole("combobox", { name: wardLabel });
    const address = screen.getByRole("textbox", { name: addressLabel });
    await waitFor(() => expect(province).toBeEnabled());
    expect([...container.querySelectorAll("input:not([type=hidden]), textarea")]).toEqual([
      province,
      ward,
      address,
    ]);
    expect(province).toHaveAttribute("placeholder", provinceHint);
    expect(ward).toHaveAttribute("placeholder", wardHint);
    expect(address).toHaveAttribute("placeholder", addressHint);
    expect(address).toHaveAttribute("maxlength", "500");
    expect(address).toHaveAttribute("name", "address");
    expect(container.querySelector("input[name=province_code]")).toBeInTheDocument();
    expect(container.querySelector("input[name=ward_code]")).toBeInTheDocument();
    for (const field of [province, ward, address]) expect(field).toBeRequired();
    expect(province).toHaveAttribute("readonly");
    expect(ward).toHaveAttribute("readonly");
    expect(ward).toBeDisabled();
    expect(province).toHaveValue("");
    expect(ward).toHaveValue("");
    const grid = container.querySelector(".mantine-SimpleGrid-root");
    expect(grid).toContainElement(province);
    expect(grid).toContainElement(ward);
    expect(grid).not.toContainElement(address);
    expect(container.querySelector("form")).toHaveTextContent(provinceLabel);
    const styles = [
      ...document.head.querySelectorAll("style"),
      ...container.querySelectorAll("style"),
    ]
      .map((style) => style.textContent)
      .join("\n");
    expect(styles).toMatch(/--sg-cols:\s*1/);
    expect(styles).toMatch(/@container simple-grid \(min-width:\s*26rem\)\s*\{[^}]*--sg-cols:\s*2/);
  },
);

it("preserves text and codes, resets the ward only for a different province, and submits only a supported pair", async () => {
  const fetcher = vi.fn(async () => Response.json({ data: supported }));
  vi.stubGlobal("fetch", fetcher);
  const { changes } = renderFields({ value: savedAddress });
  const province = screen.getByRole("combobox", { name: "Province/City" });
  const ward = screen.getByRole("combobox", { name: "Ward/Commune" });
  const address = screen.getByRole("textbox", { name: "Detailed address" });
  const save = screen.getByRole("button", { name: "Save" });
  await waitFor(() => expect(save).toBeEnabled());
  expect(province).toHaveValue(supported[0].province_name);
  expect(ward).toHaveValue("Ward A");
  selectOption(province, "01");
  expect(changes).not.toHaveBeenCalled();
  province.focus();
  fireEvent.keyDown(province, { key: "ArrowDown", code: "ArrowDown" });
  expect(province).toHaveAttribute("aria-expanded", "true");
  expect(screen.queryByRole("option", { name: "No supported ward" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("option", { name: "B province" }));
  expect(changes).toHaveBeenLastCalledWith({ ...savedAddress, province_code: "02", ward_code: "" });
  expect(address).toHaveValue(savedAddress.address);
  expect(ward).toHaveValue("");
  expect(save).toBeDisabled();
  fireEvent.click(ward);
  expect(screen.queryByRole("option", { name: "Ward A" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("option", { name: "Ward B" }));
  expect(changes).toHaveBeenLastCalledWith({
    ...savedAddress,
    province_code: "02",
    ward_code: "00006",
  });
  expect(save).toBeEnabled();
  fireEvent.change(address, { target: { value: "  \n " } });
  expect(save).toBeDisabled();
  expect(fetcher).toHaveBeenCalledOnce();
});

it("keeps detail editable through initial loading, failure, retry and an empty list", async () => {
  const first = deferred<Response>();
  const fetcher = vi
    .fn()
    .mockReturnValueOnce(first.promise)
    .mockResolvedValueOnce(Response.json({ data: [] }));
  vi.stubGlobal("fetch", fetcher);
  renderFields();
  const province = screen.getByRole("combobox", { name: "Province/City" });
  const address = screen.getByRole("textbox", { name: "Detailed address" });
  expect(screen.getByRole("status")).toHaveTextContent("Loading delivery areas");
  expect(province).toBeDisabled();
  expect(address).toBeEnabled();
  fireEvent.change(address, { target: { value: "Draft address" } });
  await act(async () => first.resolve(new Response(null, { status: 503 })));
  expect(await screen.findByRole("alert")).toHaveTextContent("Could not load delivery areas");
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByText("There are no supported shipping areas.")).toBeVisible();
  expect(province).toBeDisabled();
  expect(address).toHaveValue("Draft address");
});

it("preserves a selected address during refresh and blocks it when the ward is removed", async () => {
  const refresh = deferred<Response>();
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(Response.json({ data: supported }))
      .mockReturnValueOnce(refresh.promise),
  );
  const { client, changes } = renderFields({ value: savedAddress });
  const ward = screen.getByRole("combobox", { name: "Ward/Commune" });
  const save = screen.getByRole("button", { name: "Save" });
  await waitFor(() => expect(save).toBeEnabled());
  let refreshDone: Promise<void>;
  act(() => {
    refreshDone = client.invalidateQueries({ queryKey: ["supported-shipping-areas"] });
  });
  await waitFor(() => expect(save).toBeDisabled());
  expect(ward).toHaveValue("Ward A");
  await act(async () => {
    refresh.resolve(Response.json({ data: [{ ...supported[0], wards: supported[1].wards }] }));
    await refreshDone;
  });
  await waitFor(() => expect(ward).toHaveAttribute("aria-invalid", "true"));
  expect(ward).toHaveValue("");
  expect(ward).toHaveAccessibleDescription(/not currently in a supported delivery area/);
  expect(save).toBeDisabled();
  expect(changes).not.toHaveBeenCalled();
  expect(screen.getByRole("textbox", { name: "Detailed address" })).toHaveValue(
    savedAddress.address,
  );
  selectOption(ward, "00006");
  expect(save).toBeEnabled();
});

it("passes host errors to the named controls, preserves focus order and respects disabled", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ data: supported })),
  );
  const errors = {
    province_code: "Review province",
    ward_code: "Review ward",
    address: "Review detail",
  };
  const { unmount } = renderFields({ value: savedAddress, errors });
  const province = screen.getByRole("combobox", { name: "Province/City" });
  const ward = screen.getByRole("combobox", { name: "Ward/Commune" });
  const address = screen.getByRole("textbox", { name: "Detailed address" });
  await waitFor(() => expect(ward).toBeEnabled());
  for (const [field, error] of [
    [province, errors.province_code],
    [ward, errors.ward_code],
    [address, errors.address],
  ] as const) {
    expect(field).toHaveAccessibleDescription(error);
    expect(field).toHaveAttribute("aria-invalid", "true");
    field.focus();
    expect(field).toHaveFocus();
  }
  unmount();
  renderFields({ value: savedAddress, disabled: true });
  expect(screen.getByRole("combobox", { name: "Province/City" })).toBeDisabled();
  expect(screen.getByRole("combobox", { name: "Ward/Commune" })).toBeDisabled();
  expect(screen.getByRole("textbox", { name: "Detailed address" })).toBeDisabled();
});

it("loads the current locale and ignores a retired locale response", async () => {
  const late = deferred<Response>();
  let previousSignal: AbortSignal | null | undefined;
  const fetcher = vi.fn((url: string, init: RequestInit) => {
    if (url.includes("locale=en")) {
      previousSignal = init.signal;
      return late.promise;
    }
    return Promise.resolve(Response.json({ data: [{ ...supported[0], province_name: "Hà Nội" }] }));
  });
  vi.stubGlobal("fetch", fetcher);
  const { changes } = renderFields({ value: savedAddress });
  await waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
  fireEvent.click(screen.getByRole("button", { name: "Vietnamese" }));
  const province = await screen.findByRole("combobox", { name: "Tỉnh/Thành phố" });
  await waitFor(() => expect(province).toHaveValue("Hà Nội"));
  expect(previousSignal?.aborted).toBe(true);
  await act(async () => late.resolve(Response.json({ data: supported })));
  expect(province).toHaveValue("Hà Nội");
  expect(changes).not.toHaveBeenCalled();
});
