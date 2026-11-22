import { fireEvent, screen } from "@testing-library/react";

/** Exercise the real Mantine option interaction instead of changing its display text. */
export function selectOption(control: HTMLElement, value: string) {
  fireEvent.click(control);
  const option = screen.getAllByRole("option").find((item) => item.getAttribute("value") === value);
  if (!option) throw new Error(`No visible selection option with value: ${value}`);
  fireEvent.click(option);
}
