import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AdminI18nProvider } from "@/components/admin-i18n-provider";
import { WorkshopList } from "@/components/workshop-list";
import { api } from "@/lib/client-api";
import type { Workshop } from "@/lib/types";

vi.mock("@/lib/client-api", () => ({ api: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

const ongoingWorkshop: Workshop = {
  id: "workshop-id",
  revision_id: "revision-id",
  revision_number: 1,
  version: 1,
  default_locale: "vi",
  start_at: "2026-07-21T01:00:00Z",
  end_at: "2026-07-21T03:00:00Z",
  event_timezone: "Asia/Ho_Chi_Minh",
  effective_status: "ongoing",
  registration_url: "",
  has_published_revision: true,
  translations: [
    {
      locale: "vi",
      title: "Workshop đang diễn ra",
      summary: "Workshop thực hành",
      body: { type: "doc", content: [] },
      is_ready: true,
    },
  ],
  updated_at: "2026-07-21T01:00:00Z",
};

describe("workshop list", () => {
  it("renders the ongoing status supplied by the backend", async () => {
    vi.mocked(api).mockResolvedValue([ongoingWorkshop]);

    render(
      <AdminI18nProvider initialLocale="vi">
        <WorkshopList />
      </AdminI18nProvider>,
    );

    expect(await screen.findByText("Đang diễn ra")).toBeInTheDocument();
    expect(screen.getByText("21/07/2026 08:00")).toBeInTheDocument();
  });
});
