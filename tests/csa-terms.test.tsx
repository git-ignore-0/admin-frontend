import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AdminI18nProvider } from "@/components/admin-i18n-provider";
import { AdminQueryProvider } from "@/components/admin-query-provider";
import { CSATermsEditor } from "@/components/csa-terms-editor";
import { CSATermsList } from "@/components/csa-terms-list";
import {
  ActionLink,
  Button,
  DataState,
  Icon,
  Section,
  Status,
  Tabs,
} from "@/components/nfv-controls";
import { parseCSATermsDocument } from "@/lib/csa-terms";
import { api } from "@/lib/client-api";
import { selectOption } from "./select-option";

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

    expect(screen.getByRole("link", { name: "Create" })).toHaveClass("mantine-Button-root");
    expect(screen.getByText("Published").closest(".mantine-Badge-root")).toBeVisible();
    fireEvent.click(screen.getByRole("radio", { name: "English" }));
    expect(onChange).toHaveBeenCalledWith("en");
    expect(screen.getByRole("status")).toHaveTextContent("No terms");
    expect(screen.getByRole("heading", { name: "Terms" })).toBeInTheDocument();
  });

  it("prevents repeating a pending action and preserves explicit submit semantics", () => {
    const action = vi.fn();
    render(
      <Button loading onClick={action} type="submit" form="save-form">
        Save
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Save" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("type", "submit");
    expect(button).toHaveAttribute("form", "save-form");
    fireEvent.click(button);
    expect(action).not.toHaveBeenCalled();
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

  it("uses the shared list toolbar and opens drafts and published terms from the version link", async () => {
    vi.mocked(api).mockResolvedValue([
      rawTerms,
      {
        ...rawTerms,
        id: "34803641-2dce-4cac-8fc4-91e55f03e95f",
        version: "CSA_TERMS_V2",
        title_en: "Current agreement",
        status: "published",
      },
      {
        ...rawTerms,
        id: "44803641-2dce-4cac-8fc4-91e55f03e95f",
        version: "CSA_TERMS_V1",
        status: "archived",
      },
    ]);
    render(
      <AdminI18nProvider initialLocale="en">
        <AdminQueryProvider>
          <CSATermsList />
        </AdminQueryProvider>
      </AdminI18nProvider>,
    );

    const version = await screen.findByRole("link", { name: "CSA_TERMS_V3" });
    expect(version).toHaveAttribute("href", `/csa-terms/${rawTerms.id}`);
    const table = screen.getByRole("table", { name: "CSA terms" });
    expect(within(table).getByRole("row", { name: /CSA_TERMS_V2/ })).toHaveTextContent("In use");
    expect(within(table).getByRole("row", { name: /CSA_TERMS_V1/ })).toHaveTextContent("Archived");
    expect(screen.getByRole("link", { name: "Create draft" })).toHaveAttribute(
      "href",
      "/csa-terms/new",
    );
    expect(within(table).getAllByRole("link")).toHaveLength(3);
    expect(screen.getByText("3 results")).toBeVisible();

    const search = screen.getByRole("search", { name: "Search by version or title" });
    fireEvent.change(within(search).getByRole("searchbox"), {
      target: { value: "current agreement" },
    });
    fireEvent.submit(search);
    expect(within(table).getByRole("link", { name: "CSA_TERMS_V2" })).toBeVisible();
    expect(within(table).queryByRole("link", { name: "CSA_TERMS_V3" })).toBeNull();
    expect(screen.getByText("1 result")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Filter" }));
    const filters = within(screen.getByRole("dialog"));
    selectOption(filters.getByRole("textbox", { name: "Status" }), "draft");
    fireEvent.click(filters.getByRole("button", { name: "Apply" }));
    expect(screen.getByText("No matching terms versions.")).toBeVisible();
    expect(api).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Refresh terms" }));
    await waitFor(() => expect(api).toHaveBeenCalledTimes(2));
  });

  it("shows the shared loading, retry and empty states for the terms list", async () => {
    vi.mocked(api).mockRejectedValueOnce(new Error("request_failed")).mockResolvedValueOnce([]);
    render(
      <AdminI18nProvider initialLocale="en">
        <AdminQueryProvider>
          <CSATermsList />
        </AdminQueryProvider>
      </AdminI18nProvider>,
    );

    expect(screen.getByText("Loading terms…")).toBeInTheDocument();
    const recovery = within(await screen.findByRole("alert"));
    fireEvent.click(recovery.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("No terms versions yet.")).toBeVisible();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(api).toHaveBeenCalledTimes(2);
  });

  it("edits both languages, orders clauses and saves the backend payload", async () => {
    vi.mocked(api).mockResolvedValue(rawTerms);
    render(
      <AdminI18nProvider initialLocale="en">
        <CSATermsEditor termsId={rawTerms.id} />
      </AdminI18nProvider>,
    );

    expect(await screen.findByDisplayValue("Delivery")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Edit terms" })).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { name: /^Clause \d+$/ })).toHaveLength(2);
    expect(screen.getByRole("tabpanel")).toHaveAttribute(
      "aria-labelledby",
      screen.getByRole("tab", { name: "English" }).id,
    );
    fireEvent.click(screen.getByRole("tab", { name: "Tiếng Việt" }));
    expect(screen.getByDisplayValue("Giao hàng")).toBeVisible();

    fireEvent.click(screen.getAllByRole("button", { name: "Move down" })[0]);
    const firstClause = screen.getByRole("heading", { name: "Clause 1" }).closest("section")!;
    expect(within(firstClause).getByDisplayValue("Thanh toán")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Add clause" }));
    expect(screen.getAllByRole("heading", { name: /^Clause \d+$/ })).toHaveLength(3);
    fireEvent.click(screen.getAllByRole("button", { name: "Delete clause" })[2]);
    expect(screen.getAllByRole("heading", { name: /^Clause \d+$/ })).toHaveLength(2);

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
    expect(screen.getAllByRole("article")).toHaveLength(2);
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
      expect(api).toHaveBeenLastCalledWith(
        `admin/csa-terms/${rawTerms.id}`,
        { method: "DELETE" },
        { response: "no-content" },
      ),
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
