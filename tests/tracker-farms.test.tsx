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
import { afterEach, expect, it, vi } from "vitest";

import { AdminI18nProvider } from "@/components/admin-i18n-provider";
import { TrackerFarmEditor } from "@/components/tracker-farm-editor";
import { TrackerFarmManager } from "@/components/tracker-farm-manager";
import { ToastProvider } from "@/components/toast-provider";
import { api, apiEnvelope } from "@/lib/client-api";
import type { MediaAsset, TrackerFarm } from "@/lib/types";

const replace = vi.fn();
const refresh = vi.fn();
const push = vi.fn();
vi.mock("@/lib/client-api", () => ({ api: vi.fn(), apiEnvelope: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace, refresh }) }));

const farm: TrackerFarm = {
  id: "farm-1",
  name_en: "Green Valley",
  name_vi: "Thung lũng Xanh",
  location_en: "Da Lat",
  location_vi: "Đà Lạt",
  description_en: "English description",
  description_vi: "Mô tả Việt",
  image: null,
  signup_count: 14,
  is_visible: true,
  sort_order: 0,
  version: 1,
  created_at: "2026-01-01",
  updated_at: "2026-01-01",
};
const farmImage: MediaAsset = {
  id: "image-1",
  url: "https://example.test/farms/green-valley.webp",
  width: 1200,
  height: 900,
  variants: [],
};
const secondFarmImage: MediaAsset = {
  ...farmImage,
  id: "image-2",
  url: "https://example.test/farms/river-farm.webp",
};
const thirdFarmImage: MediaAsset = {
  ...farmImage,
  id: "image-3",
  url: "https://example.test/farms/hill-farm.webp",
};
const secondFarm: TrackerFarm = {
  ...farm,
  id: "farm-2",
  name_en: "River Farm",
  name_vi: "Nông trại Sông",
  location_en: "Hoi An",
  location_vi: "Hội An",
  signup_count: 32,
  sort_order: 1,
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function fillRequiredEditorFields() {
  fireEvent.change(screen.getByLabelText("Farm name *"), { target: { value: "Green Valley" } });
  fireEvent.change(screen.getByLabelText("Tên nông trại *"), {
    target: { value: "Thung lũng Xanh" },
  });
  fireEvent.change(screen.getByLabelText("Location *"), { target: { value: "Da Lat" } });
  fireEvent.change(screen.getByLabelText("Địa điểm *"), { target: { value: "Đà Lạt" } });
}
function renderWithProviders(node: React.ReactNode, locale: "en" | "vi" = "en") {
  return render(
    <AdminI18nProvider initialLocale={locale}>
      <ToastProvider>{node}</ToastProvider>
    </AdminI18nProvider>,
  );
}
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

it("uses routes for create and edit instead of a farm form dialog", async () => {
  vi.mocked(api).mockResolvedValueOnce([farm]);
  renderWithProviders(<TrackerFarmManager />);
  expect(
    (await screen.findByRole("link", { name: "+ Enable Growth Tracker" })).getAttribute("href"),
  ).toBe("/tracker-farms/new");
  const edit = screen.getByRole("link", { name: "Edit Green Valley" });
  expect(edit.getAttribute("href")).toBe("/tracker-farms/farm-1");
  expect(edit).toHaveAttribute("title", "Edit Green Valley");
  expect(edit).toHaveTextContent("");
  expect(edit.querySelector("svg")).toHaveAttribute("aria-hidden", "true");

  const remove = screen.getByRole("button", { name: "Disable Growth Tracker for Green Valley" });
  expect(remove).toHaveAttribute("title", "Disable Growth Tracker for Green Valley");
  expect(remove).toHaveTextContent("");
  expect(remove.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  expect(screen.queryByRole("dialog", { name: "Edit farm" })).toBeNull();
});

it("renders only the active admin locale's name and location in the list", async () => {
  vi.mocked(api).mockResolvedValueOnce([farm]);
  const view = renderWithProviders(<TrackerFarmManager />);

  expect(await screen.findByRole("columnheader", { name: "Farm name" })).toBeVisible();
  expect(screen.getByRole("columnheader", { name: "Location" })).toBeVisible();
  expect(screen.getByText("Green Valley")).toBeVisible();
  expect(screen.getByText("Da Lat")).toBeVisible();
  expect(screen.queryByText("Thung lũng Xanh")).toBeNull();
  expect(screen.queryByText("Đà Lạt")).toBeNull();
  expect(screen.getByRole("link", { name: "Edit Green Valley" })).toBeVisible();
  expect(screen.queryByRole("columnheader", { name: "Farm name — English" })).toBeNull();
  expect(screen.queryByRole("columnheader", { name: "English" })).toBeNull();

  view.unmount();
  vi.mocked(api).mockResolvedValueOnce([farm]);
  renderWithProviders(<TrackerFarmManager />, "vi");
  expect(await screen.findByRole("columnheader", { name: "Tên nông trại" })).toBeVisible();
  expect(screen.getByRole("columnheader", { name: "Địa điểm" })).toBeVisible();
  expect(screen.getByText("Thung lũng Xanh")).toBeVisible();
  expect(screen.getByText("Đà Lạt")).toBeVisible();
  expect(screen.getByText("Bắt đầu phát triển")).toBeVisible();
  expect(screen.queryByText("Getting Started")).toBeNull();
  expect(screen.queryByText("Green Valley")).toBeNull();
  expect(screen.queryByText("Da Lat")).toBeNull();
  const vietnameseEdit = screen.getByRole("link", { name: "Chỉnh sửa Thung lũng Xanh" });
  expect(vietnameseEdit).toBeVisible();
  expect(vietnameseEdit).toHaveAttribute("title", "Chỉnh sửa Thung lũng Xanh");
  expect(vietnameseEdit).toHaveTextContent("");
  expect(
    screen.getByRole("button", { name: "Tắt Growth Tracker của Thung lũng Xanh" }),
  ).toHaveAttribute("title", "Tắt Growth Tracker của Thung lũng Xanh");
});

it("keeps icon-only Edit and Delete on one equal square action row at every breakpoint", async () => {
  vi.mocked(api).mockResolvedValueOnce([farm]);
  renderWithProviders(<TrackerFarmManager />);

  const edit = await screen.findByRole("link", { name: "Edit Green Valley" });
  const remove = screen.getByRole("button", { name: "Disable Growth Tracker for Green Valley" });
  expect(edit.parentElement).toHaveClass("tracker-row-actions");
  expect(remove.parentElement).toBe(edit.parentElement);
  expect(edit).toHaveClass("icon-only-action", "secondary");
  expect(remove).toHaveClass("icon-only-action", "danger");
  expect(within(edit).queryByText("Edit")).toBeNull();
  expect(within(remove).queryByText("Delete")).toBeNull();

  const css = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8");
  expect(css).toMatch(/\.tracker-row-actions \{[\s\S]*?display: flex;[\s\S]*?align-items: center;/);
  expect(css).toMatch(
    /\.button\.icon-only-action \{[\s\S]*?width: 44px;[\s\S]*?height: 44px;[\s\S]*?flex: 0 0 44px;/,
  );
  expect(css).toMatch(/\.icon-only-action svg \{[\s\S]*?width: 19px;[\s\S]*?height: 19px;/);
  expect(css).toMatch(
    /@media \(max-width: 480px\) \{[\s\S]*?\.tracker-row-actions \{[\s\S]*?display: flex;[\s\S]*?flex-wrap: nowrap;/,
  );
});

it("renders a Rewards-style farm thumbnail or milestone fallback in EN and VI list rows", async () => {
  vi.mocked(api).mockResolvedValueOnce([
    { ...farm, image: farmImage, photos: [secondFarmImage, farmImage] },
    { ...farm, id: "farm-2", name_en: "River Farm", name_vi: "Nông trại Sông" },
  ]);
  const view = renderWithProviders(<TrackerFarmManager />);

  const photo = await screen.findByAltText("Green Valley");
  expect(photo).toHaveClass("reward-thumbnail");
  expect(photo).toHaveAttribute("src", expect.stringContaining("river-farm.webp"));
  expect(screen.getByRole("columnheader", { name: "Farm image" })).toBeVisible();
  expect(screen.getAllByAltText("Green Valley")).toHaveLength(1);
  expect(document.querySelector('img[src*="green-valley"]')).toBeNull();
  expect(screen.getAllByRole("img", { name: "River Farm" })).toHaveLength(1);
  expect(screen.getByRole("img", { name: "River Farm" })).toHaveClass(
    "tracker-farm-thumbnail-fallback",
  );

  view.unmount();
  vi.mocked(api).mockResolvedValueOnce([farm]);
  renderWithProviders(<TrackerFarmManager />, "vi");
  expect(await screen.findByText(/Thung lũng Xanh/)).toBeVisible();
  expect(screen.getAllByRole("img", { name: "Thung lũng Xanh" })).toHaveLength(1);
  expect(screen.getByRole("img", { name: "Thung lũng Xanh" })).toHaveClass(
    "tracker-farm-thumbnail-fallback",
  );
  expect(screen.getAllByText("🌱")).toHaveLength(1);
});

it("localizes every milestone label in the Vietnamese list", async () => {
  vi.mocked(api).mockResolvedValueOnce([
    { ...farm, id: "seed", signup_count: 0 },
    { ...farm, id: "start", signup_count: 10 },
    { ...farm, id: "family", signup_count: 20 },
    { ...farm, id: "leader", signup_count: 30 },
  ]);
  renderWithProviders(<TrackerFarmManager />, "vi");

  for (const label of [
    "Hạt giống đã gieo",
    "Bắt đầu phát triển",
    "Chăm lo cho gia đình",
    "Dẫn dắt cộng đồng",
  ]) {
    expect(await screen.findByText(label)).toBeVisible();
  }
  for (const english of [
    "Seed planted",
    "Getting Started",
    "Providing for Family",
    "Community Leader",
  ]) {
    expect(screen.queryByText(english)).toBeNull();
  }
});

it("loads the edit screen, preserves validation, and returns to the list after save", async () => {
  vi.mocked(api)
    .mockResolvedValueOnce([farm])
    .mockResolvedValueOnce({ ...farm, version: 2 });
  renderWithProviders(<TrackerFarmEditor farmId="farm-1" />);
  expect(await screen.findByDisplayValue("Green Valley")).toBeVisible();
  fireEvent.change(screen.getByDisplayValue("Green Valley"), { target: { value: "" } });
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  expect(await screen.findByText("This field is required.")).toBeVisible();
  fireEvent.change(document.querySelector('input[lang="en"]')!, {
    target: { value: "New farm" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(replace).toHaveBeenCalledWith("/tracker-farms"));
  expect(JSON.parse(String(vi.mocked(api).mock.calls[1][1]?.body))).toMatchObject({
    signup_count: 14,
    one_month_signup_count: 0,
    version: 1,
  });
  expect(refresh).toHaveBeenCalled();
});

it("localizes both signup fields and keeps the signup cluster responsive", () => {
  const view = renderWithProviders(<TrackerFarmEditor />);
  expect(screen.getByText("Manage the image, signup total, and visibility.")).toBeVisible();
  expect(screen.getByLabelText("6-month signup count *")).toHaveValue("0");
  expect(screen.getByLabelText("1-month signup count *")).toHaveValue("0");
  expect(screen.getByLabelText("Farm name *")).toBeVisible();
  expect(screen.getByLabelText("Location *")).toBeVisible();
  expect(screen.getByLabelText("Description")).toBeVisible();
  expect(screen.queryByLabelText("Farm name — English *")).toBeNull();
  expect(screen.getByRole("heading", { name: "Photos" })).toBeVisible();
  expect(screen.getByText("0 / 12 photos")).toBeVisible();
  expect(screen.getByText("Choose photos")).toBeVisible();
  expect(screen.getByText("JPEG, PNG, or WebP; maximum 8 MB per image.")).toBeVisible();

  const signup = screen.getByLabelText("6-month signup count *");
  const basicsLayout = signup.closest(".tracker-farm-basics-layout");
  expect(basicsLayout).not.toBeNull();
  expect(basicsLayout?.children).toHaveLength(4);
  expect(basicsLayout?.children[0]).toHaveClass("tracker-farm-signup-field");
  expect(basicsLayout?.children[1]).toHaveClass("tracker-farm-signup-field");
  expect(basicsLayout?.children[2]).toHaveClass("tracker-milestone-preview");
  expect(basicsLayout?.children[3]).toHaveClass("tracker-farm-visibility");
  expect(document.querySelector(".tracker-farm-signup-cluster")).toBeNull();
  const css = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8");
  expect(css).toMatch(
    /\.tracker-farm-basics-layout \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\);[\s\S]*?align-items: stretch;/,
  );
  expect(css).toMatch(
    /@media \(min-width: 1100px\) \{[\s\S]*?\.tracker-farm-basics-layout \{[\s\S]*?grid-template-columns: repeat\(2, minmax\(180px, 220px\)\) minmax\(0, 1fr\) max-content;[\s\S]*?align-items: end;/,
  );
  expect(css).toMatch(
    /\.tracker-farm-signup-field \.input \{[\s\S]*?width: 100%;[\s\S]*?min-height: 44px;/,
  );
  expect(css).not.toContain(".tracker-farm-basics-layout .reward-image-field");
  expect(css).not.toContain(".tracker-farm-signup-cluster");

  view.unmount();
  renderWithProviders(<TrackerFarmEditor />, "vi");
  expect(screen.getByText("Quản lý ảnh, số lượt đăng ký và trạng thái hiển thị.")).toBeVisible();
  expect(screen.getByLabelText("Số đăng ký gói 6 tháng *")).toBeVisible();
  expect(screen.getByLabelText("Số đăng ký gói 1 tháng *")).toBeVisible();
  expect(screen.getByLabelText("Farm name *")).toBeVisible();
  expect(screen.getByLabelText("Tên nông trại *")).toBeVisible();
  expect(screen.getByLabelText("Địa điểm *")).toBeVisible();
  expect(screen.getByLabelText("Mô tả")).toBeVisible();
  expect(screen.queryByLabelText("Tên nông trại — Tiếng Việt *")).toBeNull();
  expect(screen.getByRole("heading", { name: "Ảnh nông trại" })).toBeVisible();
  expect(screen.getByText("0 / 12 ảnh")).toBeVisible();
  expect(screen.getByText("Chọn ảnh")).toBeVisible();
  expect(screen.getByText("JPEG, PNG hoặc WebP; tối đa 8 MB cho mỗi ảnh.")).toBeVisible();
});

it("keeps the bilingual fields and image controls on the localized detail form", async () => {
  vi.mocked(api).mockResolvedValueOnce([farm]);
  renderWithProviders(<TrackerFarmEditor farmId="farm-1" />, "vi");
  expect(await screen.findByDisplayValue("Thung lũng Xanh")).toBeVisible();
  expect(screen.getByDisplayValue("Mô tả Việt")).toBeVisible();
  expect(screen.getByText("Chọn ảnh")).toBeVisible();
  expect(screen.getByLabelText("Số đăng ký gói 6 tháng *")).toHaveValue("14");
  expect(screen.getByLabelText("Số đăng ký gói 1 tháng *")).toHaveValue("0");
  expect(screen.getByRole("link", { name: "Hủy" }).getAttribute("href")).toBe("/tracker-farms");
});

it("keeps a stale editor draft and reloads authoritative data only on request", async () => {
  const draftFarm = { ...farm, photos: [farmImage, secondFarmImage] };
  const fresh = {
    ...farm,
    name_en: "Server Farm",
    signup_count: 18,
    version: 2,
    photos: [thirdFarmImage],
  };
  const conflict = Object.assign(new Error("version_conflict"), { status: 409 });
  vi.mocked(api)
    .mockResolvedValueOnce([draftFarm])
    .mockRejectedValueOnce(conflict)
    .mockResolvedValueOnce([fresh]);
  renderWithProviders(<TrackerFarmEditor farmId="farm-1" />);

  const name = await screen.findByDisplayValue("Green Valley");
  fireEvent.change(name, { target: { value: "Stale draft" } });
  fireEvent.click(screen.getByRole("button", { name: "Move photo 2 earlier" }));
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

  expect((await screen.findAllByText(/Your draft is unchanged/))[0]).toBeVisible();
  expect(name).toHaveValue("Stale draft");
  expect(document.querySelector(".tracker-photo-preview img")).toHaveAttribute(
    "src",
    expect.stringContaining("river-farm.webp"),
  );
  expect(api).toHaveBeenCalledTimes(2);
  expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();

  fireEvent.click(screen.getByRole("button", { name: "Reload latest" }));
  await waitFor(() => expect(name).toHaveValue("Server Farm"));
  expect(screen.getByLabelText("6-month signup count *")).toHaveValue("18");
  expect(screen.getByLabelText("1-month signup count *")).toHaveValue("0");
  expect(document.querySelector(".tracker-photo-preview img")).toHaveAttribute(
    "src",
    expect.stringContaining("hill-farm.webp"),
  );
  expect(screen.queryByRole("button", { name: "Reload latest" })).toBeNull();
  expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled();
  expect(api).toHaveBeenNthCalledWith(3, "admin/tracker-farms");
});

it("sanitizes ordinary letters but preserves invalid numeric syntax for inline validation", () => {
  renderWithProviders(<TrackerFarmEditor />);
  fillRequiredEditorFields();
  const inputs = [
    screen.getByLabelText("6-month signup count *"),
    screen.getByLabelText("1-month signup count *"),
  ];
  const submit = screen.getByRole("button", { name: "Add farm" });

  for (const input of inputs) {
    fireEvent.change(input, { target: { value: "12U3" } });
    expect(input).toHaveValue("123");

    for (const invalid of ["1.5", "-1", "+1", "1e2", "1E2"]) {
      fireEvent.change(input, { target: { value: invalid } });
      expect(input).toHaveValue(invalid);
      expect(input).toHaveAttribute("aria-invalid", "true");
      expect(submit).toBeDisabled();
      expect(api).not.toHaveBeenCalled();
    }

    for (const valid of ["0", "12", "4294967295"]) {
      fireEvent.change(input, { target: { value: valid } });
      expect(input).toHaveValue(valid);
      expect(input).toHaveAttribute("aria-invalid", "false");
      expect(submit).toBeEnabled();
    }

    for (const tooLarge of ["4294967296", String(Number.MAX_SAFE_INTEGER + 1)]) {
      fireEvent.change(input, { target: { value: tooLarge } });
      expect(input).toHaveValue(tooLarge);
      expect(input).toHaveAttribute("aria-invalid", "true");
      expect(submit).toBeDisabled();
      expect(api).not.toHaveBeenCalled();
    }

    fireEvent.change(input, { target: { value: "0" } });
  }
});

it("applies the same signup validation to pasted values", () => {
  renderWithProviders(<TrackerFarmEditor />);
  const inputs = [
    screen.getByLabelText("6-month signup count *"),
    screen.getByLabelText("1-month signup count *"),
  ];
  const submit = screen.getByRole("button", { name: "Add farm" });

  function pasteOver(input: HTMLElement, value: string) {
    const field = input as HTMLInputElement;
    field.focus();
    field.setSelectionRange(0, field.value.length);
    const event = createEvent.paste(field, {
      clipboardData: { getData: () => value },
    });
    fireEvent(field, event);
    expect(event.defaultPrevented).toBe(true);
  }

  for (const input of inputs) {
    pasteOver(input, "12U3");
    expect(input).toHaveValue("123");

    for (const invalid of ["1.5", "-1", "+1", "1e2", "1E2"]) {
      pasteOver(input, invalid);
      expect(input).toHaveValue(invalid);
      expect(input).toHaveAttribute("aria-invalid", "true");
      expect(submit).toBeDisabled();
      pasteOver(input, "0");
    }
  }

  expect(api).not.toHaveBeenCalled();
});

it("allows clearing either signup count and reports it as required on submit", () => {
  renderWithProviders(<TrackerFarmEditor />);
  fillRequiredEditorFields();
  const oneMonthSignup = screen.getByLabelText("1-month signup count *");

  fireEvent.change(oneMonthSignup, { target: { value: "" } });
  expect(oneMonthSignup).toHaveValue("");
  fireEvent.click(screen.getByRole("button", { name: "Add farm" }));
  expect(screen.getByText("This field is required.")).toBeVisible();
  expect(api).not.toHaveBeenCalled();
});

it.each([0, 4_294_967_295])(
  "submits both signup counts at the supported boundary %s",
  async (value) => {
    vi.mocked(api).mockResolvedValueOnce({
      ...farm,
      signup_count: value,
      one_month_signup_count: value,
    });
    renderWithProviders(<TrackerFarmEditor />);
    fillRequiredEditorFields();
    fireEvent.change(screen.getByLabelText("6-month signup count *"), {
      target: { value: String(value) },
    });
    fireEvent.change(screen.getByLabelText("1-month signup count *"), {
      target: { value: String(value) },
    });

    fireEvent.click(screen.getByRole("button", { name: "Add farm" }));
    await waitFor(() => expect(api).toHaveBeenCalledTimes(1));
    expect(JSON.parse(String(vi.mocked(api).mock.calls[0][1]?.body))).toMatchObject({
      signup_count: value,
      one_month_signup_count: value,
    });
  },
);

it("uploads photos sequentially, marks the primary, reorders, and sends photo_ids", async () => {
  const firstUpload = deferred<MediaAsset>();
  vi.mocked(api)
    .mockReturnValueOnce(firstUpload.promise)
    .mockResolvedValueOnce(secondFarmImage)
    .mockResolvedValueOnce({ ...farm, image: secondFarmImage });
  const { container } = renderWithProviders(<TrackerFarmEditor />);
  fillRequiredEditorFields();
  fireEvent.change(screen.getByLabelText("Description"), {
    target: { value: "  English description  " },
  });
  fireEvent.change(screen.getByLabelText("Mô tả"), { target: { value: "  Mô tả Việt  " } });
  const firstFile = new File(["first"], "first.png", { type: "image/png" });
  const secondFile = new File(["second"], "second.webp", { type: "image/webp" });
  fireEvent.change(container.querySelector('input[type="file"]')!, {
    target: { files: [firstFile, secondFile] },
  });

  expect(screen.getByRole("button", { name: "Add farm" })).toBeDisabled();
  await waitFor(() => expect(api).toHaveBeenCalledTimes(1));
  expect(screen.getByText("Waiting to upload second.webp")).toBeVisible();
  await act(async () => firstUpload.resolve(farmImage));
  await waitFor(() => expect(api).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(screen.getByText("2 / 12 photos")).toBeVisible());
  expect(screen.getByText("Primary")).toBeVisible();
  expect(document.querySelector(".tracker-photo-preview img")).toHaveAttribute(
    "src",
    expect.stringContaining("green-valley.webp"),
  );

  fireEvent.click(screen.getByRole("button", { name: "Move photo 2 earlier" }));
  expect(document.querySelector(".tracker-photo-preview img")).toHaveAttribute(
    "src",
    expect.stringContaining("river-farm.webp"),
  );
  fireEvent.click(screen.getByRole("button", { name: "Add farm" }));

  await waitFor(() => expect(api).toHaveBeenCalledTimes(3));
  expect(api).toHaveBeenNthCalledWith(1, "admin/tracker-farms/media", {
    method: "POST",
    body: expect.any(FormData),
  });
  expect(api).toHaveBeenNthCalledWith(2, "admin/tracker-farms/media", {
    method: "POST",
    body: expect.any(FormData),
  });
  expect(JSON.parse(String(vi.mocked(api).mock.calls[2][1]?.body))).toMatchObject({
    description_en: "English description",
    description_vi: "Mô tả Việt",
    photo_ids: ["image-2", "image-1"],
  });
  expect(apiEnvelope).not.toHaveBeenCalled();
});

it("keeps successful draft photos visible when another upload fails", async () => {
  vi.mocked(api)
    .mockRejectedValueOnce(new Error("upload_failed"))
    .mockResolvedValueOnce(secondFarmImage);
  const { container } = renderWithProviders(<TrackerFarmEditor />);
  fillRequiredEditorFields();
  fireEvent.change(container.querySelector('input[type="file"]')!, {
    target: {
      files: [
        new File(["bad"], "broken.png", { type: "image/png" }),
        new File(["good"], "working.webp", { type: "image/webp" }),
      ],
    },
  });

  expect(await screen.findByText(/Could not upload broken.png/)).toBeVisible();
  expect(await screen.findByText("1 / 12 photos")).toBeVisible();
  expect(screen.getByAltText("Green Valley")).toHaveAttribute(
    "src",
    expect.stringContaining("river-farm.webp"),
  );
  expect(screen.getByRole("button", { name: "Add farm" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Dismiss upload error for broken.png" }));
  expect(screen.getByRole("button", { name: "Add farm" })).toBeEnabled();
  expect(api).toHaveBeenCalledTimes(2);
});

it("normalizes a legacy image, removes photos, and clears with photo_ids", async () => {
  vi.mocked(api)
    .mockResolvedValueOnce([{ ...farm, image: farmImage }])
    .mockResolvedValueOnce({ ...farm, image: null, version: 2 });
  renderWithProviders(<TrackerFarmEditor farmId="farm-1" />);

  expect(await screen.findByAltText("Green Valley")).toHaveAttribute(
    "src",
    expect.stringContaining("green-valley.webp"),
  );
  expect(screen.getByText("Primary")).toBeVisible();
  expect(screen.getByText("1 / 12 photos")).toBeVisible();
  const removePhoto = await screen.findByRole("button", { name: "Remove photo 1" });
  expect(removePhoto).toHaveAttribute("title", "Remove photo 1");
  expect(removePhoto).toHaveClass("icon-only-action", "danger");
  expect(removePhoto).toHaveTextContent("");
  expect(removePhoto.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  expect(screen.queryByText("Remove image")).toBeNull();
  fireEvent.click(removePhoto);
  expect(screen.getByText("0 / 12 photos")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(api).toHaveBeenCalledTimes(2));
  expect(JSON.parse(String(vi.mocked(api).mock.calls[1][1]?.body))).toMatchObject({
    photo_ids: [],
    version: 1,
  });
});

it("localizes the icon-only photo removal control in Vietnamese", async () => {
  vi.mocked(api).mockResolvedValueOnce([{ ...farm, photos: [farmImage] }]);
  renderWithProviders(<TrackerFarmEditor farmId="farm-1" />, "vi");

  const removePhoto = await screen.findByRole("button", { name: "Xóa ảnh 1" });
  expect(removePhoto).toHaveAttribute("title", "Xóa ảnh 1");
  expect(removePhoto).toHaveTextContent("");
  expect(removePhoto.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  expect(screen.queryByText("Xóa ảnh")).toBeNull();
});

it("removes one gallery photo and promotes the next photo to primary", async () => {
  vi.mocked(api)
    .mockResolvedValueOnce([{ ...farm, photos: [farmImage, secondFarmImage] }])
    .mockResolvedValueOnce({ ...farm, photos: [secondFarmImage], version: 2 });
  renderWithProviders(<TrackerFarmEditor farmId="farm-1" />);

  await screen.findByText("2 / 12 photos");
  fireEvent.click(screen.getByRole("button", { name: "Remove photo 1" }));
  expect(screen.getByText("1 / 12 photos")).toBeVisible();
  expect(document.querySelector(".tracker-photo-preview img")).toHaveAttribute(
    "src",
    expect.stringContaining("river-farm.webp"),
  );
  expect(screen.getAllByText("Primary")).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(api).toHaveBeenCalledTimes(2));
  expect(JSON.parse(String(vi.mocked(api).mock.calls[1][1]?.body))).toMatchObject({
    photo_ids: ["image-2"],
    version: 1,
  });
});

it("cleans a session-uploaded photo when it is removed from a new farm draft", async () => {
  vi.mocked(api).mockResolvedValueOnce(farmImage);
  vi.mocked(apiEnvelope).mockResolvedValueOnce({ data: undefined });
  const { container } = renderWithProviders(<TrackerFarmEditor />);
  fireEvent.change(container.querySelector('input[type="file"]')!, {
    target: { files: [new File(["image"], "temporary.png", { type: "image/png" })] },
  });

  await screen.findByText("1 / 12 photos");
  fireEvent.click(screen.getByRole("button", { name: "Remove photo 1" }));

  expect(screen.getByText("0 / 12 photos")).toBeVisible();
  await waitFor(() =>
    expect(apiEnvelope).toHaveBeenCalledWith("admin/tracker-farms/media/image-1", {
      method: "DELETE",
    }),
  );
});

it("cleans every session-uploaded photo before Cancel navigates to the farm list", async () => {
  vi.mocked(api).mockResolvedValueOnce(farmImage).mockResolvedValueOnce(secondFarmImage);
  vi.mocked(apiEnvelope).mockResolvedValue({ data: undefined });
  const { container } = renderWithProviders(<TrackerFarmEditor />);
  fireEvent.change(container.querySelector('input[type="file"]')!, {
    target: {
      files: [
        new File(["first"], "first.png", { type: "image/png" }),
        new File(["second"], "second.webp", { type: "image/webp" }),
      ],
    },
  });

  await screen.findByText("2 / 12 photos");
  fireEvent.click(screen.getByRole("link", { name: "Cancel" }));

  await waitFor(() => expect(apiEnvelope).toHaveBeenCalledTimes(2));
  expect(vi.mocked(apiEnvelope).mock.calls).toEqual([
    ["admin/tracker-farms/media/image-1", { method: "DELETE" }],
    ["admin/tracker-farms/media/image-2", { method: "DELETE" }],
  ]);
  await waitFor(() => expect(push).toHaveBeenCalledWith("/tracker-farms"));
});

it("does not clean persisted photos when Remove is followed by Cancel", async () => {
  vi.mocked(api).mockResolvedValueOnce([{ ...farm, photos: [farmImage] }]);
  renderWithProviders(<TrackerFarmEditor farmId="farm-1" />);

  await screen.findByText("1 / 12 photos");
  fireEvent.click(screen.getByRole("button", { name: "Remove photo 1" }));
  fireEvent.click(screen.getByRole("link", { name: "Cancel" }));

  await waitFor(() => expect(push).toHaveBeenCalledWith("/tracker-farms"));
  expect(apiEnvelope).not.toHaveBeenCalled();
});

it("does not clean submitted session uploads after a successful Save", async () => {
  vi.mocked(api)
    .mockResolvedValueOnce(farmImage)
    .mockResolvedValueOnce({
      ...farm,
      image: farmImage,
      photos: [farmImage],
    });
  const view = renderWithProviders(<TrackerFarmEditor />);
  const { container } = view;
  fillRequiredEditorFields();
  fireEvent.change(container.querySelector('input[type="file"]')!, {
    target: { files: [new File(["image"], "submitted.png", { type: "image/png" })] },
  });

  await screen.findByText("1 / 12 photos");
  fireEvent.click(screen.getByRole("button", { name: "Add farm" }));

  await waitFor(() => expect(replace).toHaveBeenCalledWith("/tracker-farms"));
  view.unmount();
  expect(apiEnvelope).not.toHaveBeenCalled();
  expect(JSON.parse(String(vi.mocked(api).mock.calls[1][1]?.body))).toMatchObject({
    photo_ids: ["image-1"],
  });
});

it("cleans an upload that resolves after the editor unmounts without setting state", async () => {
  const upload = deferred<MediaAsset>();
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.mocked(api).mockReturnValueOnce(upload.promise);
  vi.mocked(apiEnvelope).mockResolvedValueOnce({ data: undefined });
  const view = renderWithProviders(<TrackerFarmEditor />);
  fireEvent.change(view.container.querySelector('input[type="file"]')!, {
    target: { files: [new File(["image"], "late.png", { type: "image/png" })] },
  });
  await waitFor(() => expect(api).toHaveBeenCalledTimes(1));

  view.unmount();
  await act(async () => upload.resolve(farmImage));

  await waitFor(() =>
    expect(apiEnvelope).toHaveBeenCalledWith("admin/tracker-farms/media/image-1", {
      method: "DELETE",
    }),
  );
  expect(consoleError).not.toHaveBeenCalled();
  consoleError.mockRestore();
});

it("cleans a successful session upload when the editor later unmounts", async () => {
  vi.mocked(api).mockResolvedValueOnce(farmImage);
  vi.mocked(apiEnvelope).mockResolvedValueOnce({ data: undefined });
  const view = renderWithProviders(<TrackerFarmEditor />);
  fireEvent.change(view.container.querySelector('input[type="file"]')!, {
    target: { files: [new File(["image"], "temporary.png", { type: "image/png" })] },
  });
  await screen.findByText("1 / 12 photos");

  view.unmount();

  await waitFor(() =>
    expect(apiEnvelope).toHaveBeenCalledWith("admin/tracker-farms/media/image-1", {
      method: "DELETE",
    }),
  );
});

it("does not clean an existing loaded photo when the editor unmounts", async () => {
  vi.mocked(api).mockResolvedValueOnce([{ ...farm, photos: [farmImage] }]);
  const view = renderWithProviders(<TrackerFarmEditor farmId="farm-1" />);
  await screen.findByText("1 / 12 photos");

  view.unmount();

  await act(async () => undefined);
  expect(apiEnvelope).not.toHaveBeenCalled();
});

it("does not block Remove or Cancel when temporary cleanup returns a conflict", async () => {
  const referenced = Object.assign(new Error("media_asset_referenced"), { status: 409 });
  vi.mocked(api).mockResolvedValueOnce(farmImage);
  vi.mocked(apiEnvelope).mockRejectedValue(referenced);
  const { container } = renderWithProviders(<TrackerFarmEditor />);
  fireEvent.change(container.querySelector('input[type="file"]')!, {
    target: { files: [new File(["image"], "shared.png", { type: "image/png" })] },
  });

  await screen.findByText("1 / 12 photos");
  fireEvent.click(screen.getByRole("button", { name: "Remove photo 1" }));
  expect(screen.getByText("0 / 12 photos")).toBeVisible();
  await waitFor(() => expect(apiEnvelope).toHaveBeenCalledTimes(1));

  fireEvent.click(screen.getByRole("link", { name: "Cancel" }));
  await waitFor(() => expect(apiEnvelope).toHaveBeenCalledTimes(2));
  expect(push).toHaveBeenCalledWith("/tracker-farms");
});

it("rejects a selection beyond the remaining photo capacity without uploading", async () => {
  const photos = Array.from({ length: 11 }, (_value, index) => ({
    ...farmImage,
    id: `existing-${index}`,
    url: `https://example.test/farms/existing-${index}.webp`,
  }));
  vi.mocked(api).mockResolvedValueOnce([{ ...farm, photos }]);
  const { container } = renderWithProviders(<TrackerFarmEditor farmId="farm-1" />);
  await screen.findByText("11 / 12 photos");

  fireEvent.change(container.querySelector('input[type="file"]')!, {
    target: {
      files: [
        new File(["one"], "one.png", { type: "image/png" }),
        new File(["two"], "two.png", { type: "image/png" }),
      ],
    },
  });

  expect(await screen.findByRole("alert")).toHaveTextContent("up to 12 photos");
  expect(api).toHaveBeenCalledTimes(1);
  expect(screen.getByText("11 / 12 photos")).toBeVisible();
});

it("disables upload at 12 photos and keeps gallery controls within responsive CSS", async () => {
  const photos = Array.from({ length: 12 }, (_value, index) => ({
    ...farmImage,
    id: `full-${index}`,
    url: `https://example.test/farms/full-${index}.webp`,
  }));
  vi.mocked(api).mockResolvedValueOnce([{ ...farm, photos }]);
  const { container } = renderWithProviders(<TrackerFarmEditor farmId="farm-1" />);

  await screen.findByText("12 / 12 photos");
  expect(container.querySelector('input[type="file"]')).toBeDisabled();
  const css = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8");
  expect(css).toMatch(
    /\.tracker-photo-gallery \{[\s\S]*?grid-template-columns: repeat\(auto-fill, minmax\(190px, 1fr\)\);/,
  );
  expect(css).toMatch(
    /@media \(max-width: 480px\) \{[\s\S]*?\.tracker-photo-gallery \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\);/,
  );
  expect(css).toMatch(/\.tracker-photo-actions \.button \{[\s\S]*?min-height: 44px;/);
  expect(css).toMatch(
    /\.tracker-photo-actions \{[\s\S]*?grid-template-columns: repeat\(3, 44px\);/,
  );
});

it("saves and cancels local reorder changes without duplicate requests", async () => {
  const saving = deferred<TrackerFarm[]>();
  const serverOrder = [
    { ...secondFarm, sort_order: 0, version: 2 },
    { ...farm, sort_order: 1, version: 2 },
  ];
  vi.mocked(api).mockResolvedValueOnce([farm, secondFarm]).mockReturnValueOnce(saving.promise);
  renderWithProviders(<TrackerFarmManager />);

  fireEvent.click(await screen.findByRole("button", { name: "Move Green Valley down" }));
  expect(screen.getAllByRole("row")[1]).toHaveTextContent("River Farm");
  fireEvent.click(screen.getByRole("button", { name: "Cancel order changes" }));
  expect(screen.getAllByRole("row")[1]).toHaveTextContent("Green Valley");

  fireEvent.click(screen.getByRole("button", { name: "Move Green Valley down" }));
  const save = screen.getByRole("button", { name: "Save order" });
  fireEvent.click(save);
  fireEvent.click(save);
  await waitFor(() => expect(api).toHaveBeenCalledTimes(2));
  expect(api).toHaveBeenNthCalledWith(2, "admin/tracker-farms/reorder", {
    method: "PATCH",
    body: JSON.stringify({
      items: [
        { id: "farm-2", sort_order: 0, version: 1 },
        { id: "farm-1", sort_order: 1, version: 1 },
      ],
    }),
  });
  await act(async () => saving.resolve(serverOrder));
  expect(screen.queryByRole("button", { name: "Save order" })).toBeNull();
});

it("reloads server order after a reorder version conflict", async () => {
  const conflict = Object.assign(new Error("version_conflict"), { status: 409 });
  const fresh = [
    { ...farm, name_en: "Fresh Farm", version: 2 },
    { ...secondFarm, version: 2 },
  ];
  vi.mocked(api)
    .mockResolvedValueOnce([farm, secondFarm])
    .mockRejectedValueOnce(conflict)
    .mockResolvedValueOnce(fresh);
  renderWithProviders(<TrackerFarmManager />);

  fireEvent.click(await screen.findByRole("button", { name: "Move Green Valley down" }));
  fireEvent.click(screen.getByRole("button", { name: "Save order" }));
  expect(await screen.findByText("Fresh Farm")).toBeVisible();
  expect(
    screen
      .getAllByRole("alert")
      .some((alert) => alert.textContent?.includes("latest data has been reloaded")),
  ).toBe(true);
  expect(screen.queryByRole("button", { name: "Save order" })).toBeNull();
});

it("guards Add and Edit navigation while reorder changes are unsaved", async () => {
  vi.mocked(api)
    .mockResolvedValueOnce([farm, secondFarm])
    .mockResolvedValueOnce([
      { ...secondFarm, sort_order: 0, version: 2 },
      { ...farm, sort_order: 1, version: 2 },
    ]);
  renderWithProviders(<TrackerFarmManager />);
  fireEvent.click(await screen.findByRole("button", { name: "Move Green Valley down" }));

  fireEvent.click(screen.getByRole("link", { name: "+ Enable Growth Tracker" }));
  const stayDialog = screen.getByRole("dialog", { name: "Farm order has unsaved changes" });
  expect(push).not.toHaveBeenCalled();
  fireEvent.click(within(stayDialog).getByRole("button", { name: "Stay" }));
  expect(screen.getAllByRole("row")[1]).toHaveTextContent("River Farm");

  fireEvent.click(screen.getByRole("link", { name: "Edit Green Valley" }));
  const discardDialog = screen.getByRole("dialog", { name: "Farm order has unsaved changes" });
  fireEvent.click(within(discardDialog).getByRole("button", { name: "Discard changes" }));
  expect(push).toHaveBeenCalledWith("/tracker-farms/farm-1");

  push.mockClear();
  fireEvent.click(screen.getByRole("button", { name: "Move Green Valley down" }));
  fireEvent.click(screen.getByRole("link", { name: "+ Enable Growth Tracker" }));
  const saveDialog = screen.getByRole("dialog", { name: "Farm order has unsaved changes" });
  fireEvent.click(within(saveDialog).getByRole("button", { name: "Save order" }));
  await waitFor(() => expect(push).toHaveBeenCalledWith("/tracker-farms/new"));
});

it("disables only the Growth Tracker profile after confirmation and preserves the item on failure", async () => {
  vi.mocked(api).mockResolvedValueOnce([farm, secondFarm]);
  vi.mocked(apiEnvelope)
    .mockRejectedValueOnce(new Error("network_error"))
    .mockResolvedValueOnce({ data: undefined });
  renderWithProviders(<TrackerFarmManager />);

  fireEvent.click(
    await screen.findByRole("button", { name: "Disable Growth Tracker for Green Valley" }),
  );
  const dialog = screen.getByRole("dialog", { name: "Disable Growth Tracker" });
  expect(within(dialog).getByText(/farm and its products will remain/)).toBeVisible();
  expect(apiEnvelope).not.toHaveBeenCalled();
  fireEvent.click(within(dialog).getByRole("button", { name: "Disable Growth Tracker" }));
  expect(await within(dialog).findByRole("alert")).toBeVisible();
  expect(screen.getByText("Green Valley")).toBeVisible();

  fireEvent.click(within(dialog).getByRole("button", { name: "Disable Growth Tracker" }));
  await waitFor(() => expect(screen.queryByText("Green Valley")).toBeNull());
  expect(apiEnvelope).toHaveBeenCalledWith("admin/farms/farm-1/growth-tracker", {
    method: "DELETE",
  });
  expect(screen.getByText("River Farm")).toBeVisible();
});
