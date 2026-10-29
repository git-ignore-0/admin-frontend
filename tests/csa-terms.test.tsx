import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AdminI18nProvider } from "@/components/admin-i18n-provider";
import { CSATermsEditor } from "@/components/csa-terms-editor";
import { CSATermsList } from "@/components/csa-terms-list";
import { ActionLink, DataState, Icon, Section, Status, Tabs } from "@/components/nfv-controls";
import { parseCSATermsDocument } from "@/lib/csa-terms";
import { api } from "@/lib/client-api";

const navigation = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
vi.mock("@/lib/client-api", () => ({ api: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: navigation.replace, push: navigation.push, refresh: vi.fn() }),
}));

const rawTerms = {
  id: "24803641-2dce-4cac-8fc4-91e55f03e95f",
  version: "CSA_TERMS_V3",
  status: "draft",
  title_vi: "Điều khoản V3",
  title_en: "Terms V3",
  content_hash_vi: null,
  content_hash_en: null,
  revision: 2,
  published_at: null,
  published_by_id: null,
  created_at: "2026-10-29T10:00:00+07:00",
  updated_at: "2026-10-29T11:00:00+07:00",
  clauses: [
    {
      id: "11111111-1111-4111-8111-111111111111",
      key: "delivery",
      sort_order: 10,
      heading_vi: "Giao hàng",
      heading_en: "Delivery",
      paragraphs_vi: ["Nội dung giao hàng."],
      paragraphs_en: ["Delivery details."],
    },
    {
      id: "22222222-2222-4222-8222-222222222222",
      key: "payment",
      sort_order: 20,
      heading_vi: "Thanh toán",
      heading_en: "Payment",
      paragraphs_vi: ["Nội dung thanh toán."],
      paragraphs_en: ["Payment details."],
    },
  ],
};

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe("shared NFV controls", () => {
  it("provides the FEv1 action, status, tab, state, section and icon primitives", () => {
    const onChange = vi.fn();
    render(
      <>
        <ActionLink href="/csa-terms/new">Create</ActionLink>
        <Status status="published" label="Published" />
        <Tabs
          items={[
            { value: "vi", label: "Tiếng Việt" },
            { value: "en", label: "English" },
          ]}
          value="vi"
          onChange={onChange}
        />
        <DataState kind="empty" title="No terms" />
        <Section title="Terms">Body</Section>
        <Icon name="plus" />
      </>,
    );

    expect(screen.getByRole("link", { name: "Create" })).toHaveClass("nfv-button");
    expect(screen.getByText("Published")).toHaveClass("status");
    fireEvent.click(screen.getByRole("button", { name: "English" }));
    expect(onChange).toHaveBeenCalledWith("en");
    expect(screen.getByRole("status")).toHaveTextContent("No terms");
    expect(screen.getByRole("heading", { name: "Terms" })).toBeInTheDocument();
  });

  it("centers icon and text inside the shared FEv1 button content wrapper", () => {
    const css = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8");
    expect(css).toMatch(
      /\.nfv-button-content\s*\{[^}]*display:\s*inline-flex;[^}]*align-items:\s*center;[^}]*justify-content:\s*center;[^}]*gap:\s*7px;/u,
    );
  });
});

describe("CSA terms administration", () => {
  it("shows a terminal error instead of a create form when detail loading fails", async () => {
    vi.mocked(api).mockRejectedValue(new Error("request_failed"));
    render(
      <AdminI18nProvider initialLocale="en">
        <CSATermsEditor termsId={rawTerms.id} />
      </AdminI18nProvider>,
    );

    expect(await screen.findByRole("alert")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Save draft" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Publish" })).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("renders the versions and exposes edit only for drafts", async () => {
    vi.mocked(api).mockResolvedValue([
      rawTerms,
      { ...rawTerms, id: "34803641-2dce-4cac-8fc4-91e55f03e95f", status: "published" },
      { ...rawTerms, id: "44803641-2dce-4cac-8fc4-91e55f03e95f", status: "archived" },
    ]);
    render(
      <AdminI18nProvider initialLocale="en">
        <CSATermsList />
      </AdminI18nProvider>,
    );

    expect(await screen.findAllByText("CSA_TERMS_V3")).toHaveLength(3);
    expect(document.querySelector(".csa-terms-list-shell")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Create draft" })).toHaveClass("btn-small");
    expect(screen.getByRole("link", { name: "Create draft" })).toHaveAttribute(
      "href",
      "/csa-terms/new",
    );
    const editLink = screen.getAllByRole("link", { name: "Edit" })[0];
    const viewLinks = screen.getAllByRole("link", { name: "View" });
    expect(editLink).toHaveClass("btn-outline");
    expect(editLink.querySelector("svg")).toBeInTheDocument();
    expect(viewLinks).toHaveLength(2);
    expect(viewLinks.every((link) => link.classList.contains("btn-outline"))).toBe(true);
    expect(viewLinks.every((link) => link.querySelector("svg") === null)).toBe(true);
    expect(document.querySelectorAll("time")).toHaveLength(3);
  });

  it("keeps the CSA terms list compact with the same Medusa-like hierarchy", () => {
    const css = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8");
    expect(css).toMatch(/\.csa-terms-list-shell\s*\{[^}]*max-width:\s*980px;[^}]*gap:\s*16px;/u);
    expect(css).toMatch(
      /\.csa-terms-list-shell \.page-heading h1\s*\{[^}]*font-size:\s*1\.25rem;/u,
    );
    expect(css).toMatch(
      /\.csa-terms-table th,\s*\.csa-terms-table td\s*\{[^}]*padding:\s*11px 16px;/u,
    );
  });

  it("edits both languages, orders clauses and saves the backend payload", async () => {
    vi.mocked(api).mockResolvedValue(rawTerms);
    render(
      <AdminI18nProvider initialLocale="en">
        <CSATermsEditor termsId={rawTerms.id} />
      </AdminI18nProvider>,
    );

    expect(await screen.findByDisplayValue("Delivery")).toBeVisible();
    expect(document.querySelector(".csa-terms-editor-shell")).toBeInTheDocument();
    expect(document.querySelectorAll(".csa-terms-edit-clause")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Tiếng Việt" }));
    expect(screen.getByDisplayValue("Giao hàng")).toBeVisible();

    fireEvent.click(screen.getAllByRole("button", { name: "Move down" })[0]);
    const clauses = document.querySelectorAll(".csa-terms-edit-clause");
    expect(within(clauses[0] as HTMLElement).getByDisplayValue("Thanh toán")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Add clause" }));
    expect(document.querySelectorAll(".csa-terms-edit-clause")).toHaveLength(3);
    fireEvent.click(screen.getAllByRole("button", { name: "Delete clause" })[2]);
    expect(document.querySelectorAll(".csa-terms-edit-clause")).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(api).toHaveBeenCalledTimes(2));
    expect(api).toHaveBeenLastCalledWith(
      `admin/csa-terms/${rawTerms.id}`,
      expect.objectContaining({
        method: "PATCH",
        body: expect.stringContaining('"revision":2'),
      }),
    );
    const body = JSON.parse(String(vi.mocked(api).mock.lastCall?.[1]?.body));
    expect(body.clauses.map((clause: { key: string }) => clause.key)).toEqual([
      "payment",
      "delivery",
    ]);
  });

  it("preserves paragraph breaks while typing and splits them only when saving", async () => {
    vi.mocked(api).mockResolvedValue(rawTerms);
    render(
      <AdminI18nProvider initialLocale="en">
        <CSATermsEditor termsId={rawTerms.id} />
      </AdminI18nProvider>,
    );

    const textarea = await screen.findByDisplayValue("Delivery details.");
    fireEvent.change(textarea, { target: { value: "First paragraph.\n\n" } });
    expect(textarea).toHaveValue("First paragraph.\n\n");
    fireEvent.change(textarea, {
      target: { value: "First paragraph.\n\nSecond paragraph." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));

    await waitFor(() => expect(api).toHaveBeenCalledTimes(2));
    const body = JSON.parse(String(vi.mocked(api).mock.lastCall?.[1]?.body));
    expect(body.clauses[0].paragraphs_en).toEqual(["First paragraph.", "Second paragraph."]);
  });

  it("allows saving clauses without optional headings", async () => {
    const termsWithoutHeadings = {
      ...rawTerms,
      clauses: rawTerms.clauses.map((clause) => ({ ...clause, heading_vi: "", heading_en: "" })),
    };
    vi.mocked(api).mockResolvedValue(termsWithoutHeadings);
    render(
      <AdminI18nProvider initialLocale="en">
        <CSATermsEditor termsId={rawTerms.id} />
      </AdminI18nProvider>,
    );

    await screen.findByDisplayValue("Delivery details.");
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));

    await waitFor(() => expect(api).toHaveBeenCalledTimes(2));
  });

  it("publishes drafts after confirmation and clones read-only versions", async () => {
    vi.mocked(api)
      .mockResolvedValueOnce(rawTerms)
      .mockResolvedValueOnce(rawTerms)
      .mockResolvedValueOnce({ ...rawTerms, status: "published", revision: 3 });
    const { unmount } = render(
      <AdminI18nProvider initialLocale="en">
        <CSATermsEditor termsId={rawTerms.id} />
      </AdminI18nProvider>,
    );
    await screen.findByDisplayValue("Delivery");
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    fireEvent.click(screen.getByRole("dialog").querySelector("button:last-child")!);
    await waitFor(() =>
      expect(api).toHaveBeenLastCalledWith(
        `admin/csa-terms/${rawTerms.id}/publish`,
        expect.objectContaining({ method: "POST", body: JSON.stringify({ revision: 2 }) }),
      ),
    );
    unmount();

    vi.mocked(api).mockReset();
    vi.mocked(api)
      .mockResolvedValueOnce({ ...rawTerms, status: "published" })
      .mockResolvedValueOnce({ ...rawTerms, id: "54803641-2dce-4cac-8fc4-91e55f03e95f" });
    render(
      <AdminI18nProvider initialLocale="en">
        <CSATermsEditor termsId={rawTerms.id} />
      </AdminI18nProvider>,
    );
    expect(await screen.findByText(/read-only/i)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Save draft" })).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(document.querySelectorAll("article.csa-terms-read-clause")).toHaveLength(2);
    expect(screen.getByRole("heading", { name: "Delivery" })).toBeVisible();
    expect(screen.getByText("Delivery details.")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Create new draft" }));
    fireEvent.change(screen.getByLabelText("Version code"), {
      target: { value: "CSA_TERMS_V4" },
    });
    fireEvent.click(screen.getByRole("dialog").querySelector("button:last-child")!);
    await waitFor(() =>
      expect(api).toHaveBeenLastCalledWith(
        `admin/csa-terms/${rawTerms.id}/clone`,
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ version: "CSA_TERMS_V4" }),
        }),
      ),
    );
  });

  it("keeps the CSA terms editor compact with a Medusa-like type and spacing scale", () => {
    const css = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8");
    expect(css).toMatch(/\.csa-terms-editor-shell\s*\{[^}]*max-width:\s*880px;[^}]*gap:\s*16px;/u);
    expect(css).toMatch(/\.csa-terms-editor \.page-heading h1\s*\{[^}]*font-size:\s*1\.25rem;/u);
    expect(css).toMatch(
      /\.csa-terms-edit-clause\s*\{[^}]*padding:\s*12px 16px;[^}]*border:\s*1px solid var\(--border\);/u,
    );
    expect(css).toMatch(
      /\.csa-terms-footer-actions\s*\{[^}]*position:\s*sticky;[^}]*bottom:\s*0;/u,
    );
    expect(css).toMatch(
      /\.csa-terms-read-document > header\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*auto minmax\(0, 1fr\);[^}]*align-items:\s*baseline;/u,
    );
    expect(css).toMatch(
      /\.csa-terms-meta-version\s*\{[^}]*display:\s*flex;[^}]*align-items:\s*baseline;/u,
    );
    expect(css).toMatch(
      /\.csa-terms-language-tabs\s*\{[^}]*grid-column:\s*3;[^}]*justify-self:\s*end;[^}]*justify-content:\s*flex-end;/u,
    );
  });

  it("deletes a draft only after confirmation", async () => {
    vi.mocked(api).mockResolvedValueOnce(rawTerms).mockResolvedValueOnce(undefined);
    render(
      <AdminI18nProvider initialLocale="en">
        <CSATermsEditor termsId={rawTerms.id} />
      </AdminI18nProvider>,
    );
    await screen.findByDisplayValue("Delivery");
    fireEvent.click(screen.getByRole("button", { name: "Delete draft" }));
    fireEvent.click(screen.getByRole("dialog").querySelector("button:last-child")!);
    await waitFor(() =>
      expect(api).toHaveBeenLastCalledWith(`admin/csa-terms/${rawTerms.id}`, { method: "DELETE" }),
    );
    expect(navigation.push).toHaveBeenCalledWith("/csa-terms");
  });
});

describe("CSA terms contract", () => {
  it("parses the backend document shape without changing clause order", () => {
    const document = parseCSATermsDocument({
      id: "24803641-2dce-4cac-8fc4-91e55f03e95f",
      version: "CSA_TERMS_V3",
      status: "draft",
      title_vi: "Điều khoản V3",
      title_en: "Terms V3",
      content_hash_vi: null,
      content_hash_en: null,
      revision: 2,
      published_at: null,
      published_by_id: null,
      created_at: "2026-10-29T10:00:00+07:00",
      updated_at: "2026-10-29T11:00:00+07:00",
      clauses: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          key: "delivery",
          sort_order: 10,
          heading_vi: "Giao hàng",
          heading_en: "Delivery",
          paragraphs_vi: ["Nội dung giao hàng."],
          paragraphs_en: ["Delivery details."],
        },
      ],
    });

    expect(document.version).toBe("CSA_TERMS_V3");
    expect(document.clauses.map((clause) => clause.key)).toEqual(["delivery"]);
    expect(document.clauses[0].paragraphs.vi).toEqual(["Nội dung giao hàng."]);
  });

  it("rejects malformed document payloads", () => {
    expect(() => parseCSATermsDocument({ status: "published", clauses: [] })).toThrow(
      "invalid_csa_terms_response",
    );
  });
});
