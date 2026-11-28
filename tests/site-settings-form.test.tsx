import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AdminI18nProvider } from "@/components/admin-i18n-provider";
import { SiteSettingsForm } from "@/components/site-settings-form";
import { ToastProvider } from "@/components/toast-provider";
import { api } from "@/lib/client-api";
import type { SiteSettings } from "@/lib/types";

vi.mock("@/lib/client-api", () => ({ api: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

const settings: SiteSettings = {
  version: 1,
  email: "contact@example.com",
  is_email_enabled: true,
  phone_display: "+84 97 151 91 85",
  is_phone_enabled: true,
  links: [],
  updated_at: "2026-07-18T00:00:00Z",
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("site settings form", () => {
  it("replaces the loading status with an error when settings cannot be loaded", async () => {
    let rejectLoad!: (reason: Error) => void;
    vi.mocked(api).mockReturnValueOnce(
      new Promise((_, reject) => {
        rejectLoad = reject;
      }),
    );
    render(
      <AdminI18nProvider initialLocale="en">
        <ToastProvider>
          <SiteSettingsForm />
        </ToastProvider>
      </AdminI18nProvider>,
    );
    expect(screen.getByRole("status")).toBeVisible();
    rejectLoad(new Error("Settings service unavailable"));

    expect(await screen.findByRole("alert")).not.toBeEmptyDOMElement();
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByRole("button", { name: "Save changes" })).toBeNull();
  });

  it.each([
    ["en", "See our farms"],
    ["vi", "Xem nông trại"],
  ] as const)("renders and submits the localized farms controls in %s", async (locale, label) => {
    vi.mocked(api)
      .mockResolvedValueOnce(settings)
      .mockResolvedValueOnce({
        ...settings,
        version: 2,
        links: [
          {
            kind: "farms",
            label,
            url: "https://farms.example.com/visit",
            position: 3,
            is_enabled: true,
          },
        ],
      });

    render(
      <AdminI18nProvider initialLocale={locale}>
        <ToastProvider>
          <SiteSettingsForm />
        </ToastProvider>
      </AdminI18nProvider>,
    );

    const urlInput = await screen.findByLabelText(label);
    const row = urlInput.closest(".link-row");
    const checkbox = row?.querySelector('input[type="checkbox"]');
    expect(checkbox).not.toBeNull();
    fireEvent.change(urlInput, {
      target: { value: "https://farms.example.com/visit" },
    });
    fireEvent.click(checkbox as HTMLInputElement);
    fireEvent.click(
      screen.getByRole("button", { name: locale === "vi" ? "Lưu thay đổi" : "Save changes" }),
    );

    await waitFor(() => expect(api).toHaveBeenCalledTimes(2));
    const payload = JSON.parse(
      vi.mocked(api).mock.calls.at(-1)?.[1]?.body as string,
    ) as SiteSettings;
    expect(payload.phone_display).toBe(settings.phone_display);
    expect(payload.links).toContainEqual(
      expect.objectContaining({
        kind: "farms",
        url: "https://farms.example.com/visit",
        is_enabled: true,
      }),
    );
  });

  it.each(["", "ftp://farms.example.com"])(
    "rejects an enabled farms link with URL %j",
    async (url) => {
      vi.mocked(api).mockResolvedValue(settings);
      render(
        <AdminI18nProvider initialLocale="en">
          <ToastProvider>
            <SiteSettingsForm />
          </ToastProvider>
        </AdminI18nProvider>,
      );

      const urlInput = await screen.findByLabelText("See our farms");
      const checkbox = urlInput.closest(".link-row")?.querySelector('input[type="checkbox"]');
      fireEvent.change(urlInput, { target: { value: url } });
      fireEvent.click(checkbox as HTMLInputElement);
      fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

      await waitFor(() => expect(screen.getByRole("alert")).toBeVisible());
      expect(api).toHaveBeenCalledTimes(1);
    },
  );

  it("blocks a rejected replacement and saves the corrected phone as domestic digits", async () => {
    vi.mocked(api)
      .mockResolvedValueOnce(settings)
      .mockResolvedValueOnce({ ...settings, phone_display: "0981234567", version: 2 });
    render(
      <AdminI18nProvider initialLocale="en">
        <ToastProvider>
          <SiteSettingsForm />
        </ToastProvider>
      </AdminI18nProvider>,
    );
    const phone = await screen.findByRole<HTMLInputElement>("textbox", { name: "Phone number" });
    const submit = screen.getByRole("button", { name: "Save changes" });
    expect(phone).toHaveValue("0971519185");
    expect(phone).toHaveAttribute("placeholder", "0912345678");
    expect(phone).not.toBeRequired();
    phone.select();
    fireEvent.paste(phone, { clipboardData: { getData: () => "+84981234567" } });
    expect(phone).toHaveValue("0971519185");
    expect(phone).toHaveAttribute("aria-invalid", "true");
    expect(submit).toBeDisabled();
    fireEvent.submit(phone.closest("form")!);
    expect(phone).toHaveFocus();
    expect(api).toHaveBeenCalledOnce();
    phone.select();
    fireEvent.paste(phone, { clipboardData: { getData: () => "(0981) 234-567\n" } });
    expect(phone).toHaveValue("0981234567");
    expect(phone).not.toHaveAttribute("aria-invalid", "true");
    expect(submit).toBeEnabled();
    fireEvent.click(submit);
    await waitFor(() => expect(api).toHaveBeenCalledTimes(2));
    const payload = JSON.parse(String(vi.mocked(api).mock.calls[1]?.[1]?.body)) as SiteSettings;
    expect(payload.phone_display).toBe("0981234567");
  });

  it("preserves the saved legacy phone when toggling visibility and supports explicitly clearing it", async () => {
    const legacy = { ...settings, phone_display: "024 1234 5678" };
    const saved = { ...legacy, is_phone_enabled: false, version: 2 };
    vi.mocked(api)
      .mockResolvedValueOnce(legacy)
      .mockResolvedValueOnce(saved)
      .mockResolvedValueOnce({ ...saved, phone_display: "", version: 3 });
    render(
      <AdminI18nProvider initialLocale="en">
        <ToastProvider>
          <SiteSettingsForm />
        </ToastProvider>
      </AdminI18nProvider>,
    );
    const phone = await screen.findByRole("textbox", { name: "Phone number" });
    const submit = screen.getByRole("button", { name: "Save changes" });
    const toggle = screen.getByRole("checkbox", { name: /show phone/i });

    expect(phone).toHaveValue("02412345678");
    expect(phone).not.toHaveAttribute("aria-invalid", "true");
    fireEvent.click(toggle);
    expect(phone).toHaveValue("02412345678");
    fireEvent.click(submit);
    await waitFor(() => expect(submit).toBeEnabled());
    const hidden = JSON.parse(String(vi.mocked(api).mock.calls[1]?.[1]?.body)) as SiteSettings;
    expect(hidden).toMatchObject({ phone_display: "024 1234 5678", is_phone_enabled: false });

    fireEvent.change(phone, { target: { value: "" } });
    expect(submit).toBeEnabled();
    fireEvent.click(submit);
    await waitFor(() => expect(submit).toBeEnabled());
    const cleared = JSON.parse(String(vi.mocked(api).mock.calls[2]?.[1]?.body)) as SiteSettings;
    expect(cleared).toMatchObject({ phone_display: "", is_phone_enabled: false, version: 2 });
  });

  it("uses the saved server value as the untouched baseline after a replacement", async () => {
    const saved = { ...settings, phone_display: "+84 98 123 45 67", version: 2 };
    vi.mocked(api)
      .mockResolvedValueOnce(settings)
      .mockResolvedValueOnce(saved)
      .mockResolvedValueOnce({ ...saved, email: "new@example.com", version: 3 });
    render(
      <AdminI18nProvider initialLocale="en">
        <ToastProvider>
          <SiteSettingsForm />
        </ToastProvider>
      </AdminI18nProvider>,
    );
    const phone = await screen.findByRole("textbox", { name: "Phone number" });
    const submit = screen.getByRole("button", { name: "Save changes" });
    fireEvent.change(phone, { target: { value: "0981234567" } });
    fireEvent.click(submit);
    await waitFor(() => expect(submit).toBeEnabled());
    expect(phone).toHaveValue("0981234567");
    fireEvent.change(screen.getByLabelText("Public email"), {
      target: { value: "new@example.com" },
    });
    fireEvent.click(submit);
    await waitFor(() => expect(submit).toBeEnabled());

    const payload = JSON.parse(String(vi.mocked(api).mock.calls[2]?.[1]?.body)) as SiteSettings;
    expect(payload).toMatchObject({
      email: "new@example.com",
      phone_display: "+84 98 123 45 67",
      version: 2,
    });
  });

  it("blocks direct submission while the Website Settings phone is composing", async () => {
    vi.mocked(api).mockResolvedValueOnce(settings);
    render(
      <AdminI18nProvider initialLocale="en">
        <ToastProvider>
          <SiteSettingsForm />
        </ToastProvider>
      </AdminI18nProvider>,
    );
    const submit = await screen.findByRole("button", { name: "Save changes" });
    const form = submit.closest("form")!;
    const phone = form.querySelector<HTMLInputElement>("#phone-display")!;
    fireEvent.compositionStart(phone);
    fireEvent.submit(form);

    expect(api).toHaveBeenCalledOnce();
    expect(submit).toBeDisabled();
  });

  it("persists the untouched Website Settings phone after cancelling composition", async () => {
    const saved = { ...settings, email: "new@example.com", version: 2 };
    vi.mocked(api).mockResolvedValueOnce(settings).mockResolvedValueOnce(saved);
    render(
      <AdminI18nProvider initialLocale="en">
        <ToastProvider>
          <SiteSettingsForm />
        </ToastProvider>
      </AdminI18nProvider>,
    );
    const phone = await screen.findByRole("textbox", { name: "Phone number" });
    const submit = screen.getByRole("button", { name: "Save changes" });
    fireEvent.compositionStart(phone);
    expect(submit).toBeDisabled();
    fireEvent.compositionEnd(phone, { data: "" });
    expect(submit).toBeEnabled();
    fireEvent.change(screen.getByLabelText("Public email"), { target: { value: saved.email } });
    fireEvent.click(submit);
    await waitFor(() => expect(submit).toBeEnabled());

    const payload = JSON.parse(String(vi.mocked(api).mock.calls[1]?.[1]?.body)) as SiteSettings;
    expect(payload).toMatchObject({ email: saved.email, phone_display: "+84 97 151 91 85" });
  });

  it("does not expose organization or location fields", async () => {
    vi.mocked(api).mockResolvedValue(settings);

    render(
      <AdminI18nProvider initialLocale="vi">
        <ToastProvider>
          <SiteSettingsForm />
        </ToastProvider>
      </AdminI18nProvider>,
    );

    expect(await screen.findByText("Liên hệ")).toBeInTheDocument();
    expect(screen.queryByText("Tên tổ chức")).not.toBeInTheDocument();
    expect(screen.queryByText("Tổ chức")).not.toBeInTheDocument();
    expect(screen.queryByText("Tên địa điểm")).not.toBeInTheDocument();
    expect(screen.queryByText("Địa chỉ")).not.toBeInTheDocument();
    expect(screen.queryByText("Google Maps")).not.toBeInTheDocument();
  });

  it("does not show or resubmit the retired Store link", async () => {
    const withLegacyStore: SiteSettings = {
      ...settings,
      links: [
        {
          id: 1,
          kind: "facebook",
          label: "Facebook",
          url: "https://facebook.example.com",
          position: 10,
          is_enabled: true,
        },
        {
          id: 2,
          kind: "store",
          label: "Store",
          url: "https://store.example.com",
          position: 20,
          is_enabled: true,
        },
        {
          id: 3,
          kind: "forum",
          label: "Forum",
          url: "https://forum.example.com",
          position: 30,
          is_enabled: true,
        },
      ],
    };
    vi.mocked(api)
      .mockResolvedValueOnce(withLegacyStore)
      .mockResolvedValueOnce({
        ...withLegacyStore,
        links: withLegacyStore.links.filter((link) => link.kind !== "store"),
      });

    render(
      <AdminI18nProvider initialLocale="en">
        <ToastProvider>
          <SiteSettingsForm />
        </ToastProvider>
      </AdminI18nProvider>,
    );

    expect(await screen.findByLabelText("Facebook")).toBeInTheDocument();
    expect(screen.queryByLabelText("Store")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(api).toHaveBeenLastCalledWith(
        "admin/site-settings",
        expect.objectContaining({ method: "PATCH" }),
      ),
    );
    const payload = JSON.parse(
      vi.mocked(api).mock.calls.at(-1)?.[1]?.body as string,
    ) as SiteSettings;
    expect(payload.links.map((link) => link.kind)).toEqual(["facebook", "forum"]);
  });
});
