import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AdminImagePicker } from "@/components/admin-image-picker";

afterEach(cleanup);

const labels = {
  choose: "Choose image",
  replace: "Replace image",
  empty: "No images yet",
  cover: "Cover image",
  setCover: "Set as cover",
  moveEarlier: "Move image earlier",
  moveLater: "Move image later",
  remove: "Remove image",
  uploading: "Uploading images…",
  select: "Select image",
};

const firstImage = { id: "farm-1", src: "/first.webp", alt: "First farm photo" };
const secondImage = { id: "farm-2", src: "/second.webp", alt: "Second farm photo" };

it("opens the single-file picker to add or replace an image and clears each selection", () => {
  const onChooseFiles = vi.fn();
  const props = { maxItems: 1, labels, onChooseFiles, onRemove: vi.fn() };
  const { rerender } = render(<AdminImagePicker {...props} items={[]} />);
  const input = screen.getByLabelText<HTMLInputElement>(labels.choose);
  const openFilePicker = vi.spyOn(input, "click");
  const setFileInputValue = vi.spyOn(input, "value", "set");
  const image = new File(["image"], "first.webp", { type: "image/webp" });

  expect(input).toHaveAttribute("accept", "image/jpeg,image/png,image/webp");
  expect(input).not.toHaveAttribute("multiple");
  fireEvent.click(screen.getByRole("button", { name: `${labels.choose}…` }));
  expect(openFilePicker).toHaveBeenCalledTimes(1);
  fireEvent.change(input, { target: { files: [image] } });
  expect(onChooseFiles).toHaveBeenLastCalledWith([image]);
  expect(setFileInputValue).toHaveBeenLastCalledWith("");

  rerender(<AdminImagePicker {...props} items={[firstImage]} fileName={image.name} />);
  expect(screen.getByText(image.name)).toBeVisible();
  expect(input).not.toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: labels.replace }));
  expect(openFilePicker).toHaveBeenCalledTimes(2);
  fireEvent.change(input, { target: { files: [image] } });
  expect(onChooseFiles).toHaveBeenCalledTimes(2);
  expect(setFileInputValue).toHaveBeenCalledTimes(2);
});

it("forwards multiple files and disables adding at the gallery limit or while busy", () => {
  const onChooseFiles = vi.fn();
  const props = { labels, onChooseFiles, onRemove: vi.fn(), maxItems: 2 };
  const { rerender } = render(<AdminImagePicker {...props} items={[]} />);
  const input = screen.getByLabelText<HTMLInputElement>(labels.choose);
  const files = [
    new File(["image"], "first.webp", { type: "image/webp" }),
    new File(["image"], "second.png", { type: "image/png" }),
  ];

  expect(input).toHaveAttribute("multiple");
  fireEvent.change(input, { target: { files: [] } });
  expect(onChooseFiles).not.toHaveBeenCalled();
  fireEvent.change(input, { target: { files } });
  expect(onChooseFiles).toHaveBeenCalledWith(files);

  rerender(<AdminImagePicker {...props} items={[firstImage, secondImage]} />);
  expect(input).toBeDisabled();
  expect(screen.queryByRole("button", { name: `${labels.choose}…` })).not.toBeInTheDocument();

  rerender(<AdminImagePicker {...props} items={[firstImage]} busy error="Upload failed" />);
  expect(input).toBeDisabled();
  expect(screen.getByRole("button", { name: `${labels.choose}…` })).toBeDisabled();
  expect(screen.getByRole("button", { name: `${labels.select} 1` })).toBeDisabled();
  expect(screen.getByRole("status")).toHaveTextContent(labels.uploading);
  expect(screen.getByRole("alert")).toHaveTextContent("Upload failed");
});

it("announces the cover and restores focus to a selected photo when Escape closes its actions", () => {
  render(
    <AdminImagePicker
      items={[firstImage, secondImage]}
      maxItems={2}
      labels={labels}
      onChooseFiles={vi.fn()}
      onMove={vi.fn()}
      onRemove={vi.fn()}
    />,
  );

  const cover = screen.getByRole("button", { name: `${labels.select} 1` });
  fireEvent.click(cover);
  const move = screen.getByRole("button", { name: `${labels.moveLater} 1` });
  act(() => move.focus());
  expect(move).toHaveFocus();
  fireEvent.keyDown(move, { key: "Escape" });
  expect(move).not.toBeInTheDocument();
  expect(cover).toHaveAttribute("aria-pressed", "false");
  expect(cover).toHaveFocus();
  expect(cover).toHaveAccessibleDescription(labels.cover);
});

it("closes gallery actions when keyboard focus leaves without stealing focus", () => {
  render(
    <>
      <AdminImagePicker
        items={[firstImage]}
        maxItems={2}
        labels={labels}
        onChooseFiles={vi.fn()}
        onRemove={vi.fn()}
      />
      <button type="button">Save</button>
    </>,
  );

  const photo = screen.getByRole("button", { name: `${labels.select} 1` });
  fireEvent.click(photo);
  expect(screen.getByRole("button", { name: labels.remove })).toBeVisible();
  const save = screen.getByRole("button", { name: "Save" });
  act(() => save.focus());
  expect(save).toHaveFocus();
  expect(photo).toHaveAttribute("aria-pressed", "false");
  expect(screen.queryByRole("button", { name: labels.remove })).not.toBeInTheDocument();
});
