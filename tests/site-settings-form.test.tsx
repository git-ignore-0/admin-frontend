import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

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

describe("site settings form", () => {
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
