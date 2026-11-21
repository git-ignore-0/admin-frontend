"use client";

import { useState } from "react";
import type { InputHTMLAttributes } from "react";
import { ActionIcon, Popover, TextInput } from "@mantine/core";
import { DatePicker } from "@mantine/dates";
import { IconCalendar } from "@tabler/icons-react";

import {
  adminDateInputToIso,
  formatAdminDateInputValue,
  isoDateToAdminInput,
} from "@/lib/admin-date";

type Props = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "id" | "inputMode" | "maxLength" | "onChange" | "placeholder" | "size" | "type" | "value"
> & {
  id: string;
  onValueChange: (value: string) => void;
  pickerLabel: string;
  pickerMin?: string;
  value: string;
};

/** Keep draft strings for existing validation; the official calendar uses date-only values. */
export function AdminDateInput({
  disabled,
  id,
  onValueChange,
  pickerLabel,
  pickerMin,
  value,
  className,
  min,
  max,
  ...props
}: Props) {
  const [opened, setOpened] = useState(false);
  const selectedDate = adminDateInputToIso(value);
  const minimumDate = pickerMin || (typeof min === "string" ? min : undefined);
  const maximumDate = typeof max === "string" ? max : undefined;

  return (
    <TextInput
      {...props}
      disabled={disabled}
      error={props["aria-invalid"] === true || props["aria-invalid"] === "true"}
      id={id}
      classNames={{ input: className }}
      attributes={{
        input: props["aria-describedby"] ? { "aria-describedby": props["aria-describedby"] } : {},
      }}
      inputMode="numeric"
      maxLength={10}
      onChange={(event) => onValueChange(formatAdminDateInputValue(event.currentTarget.value))}
      placeholder="dd/mm/yyyy"
      type="text"
      value={value}
      rightSectionPointerEvents="all"
      rightSection={
        <Popover
          opened={opened && !disabled}
          onChange={setOpened}
          position="bottom-end"
          withArrow
          returnFocus
          trapFocus
        >
          <Popover.Target>
            <ActionIcon
              aria-controls={`${id}-calendar`}
              aria-expanded={opened && !disabled}
              aria-label={pickerLabel}
              disabled={disabled}
              onClick={() => setOpened((current) => !current)}
              title={pickerLabel}
              type="button"
              variant="subtle"
              size="sm"
            >
              <IconCalendar size={17} stroke={1.7} />
            </ActionIcon>
          </Popover.Target>
          <Popover.Dropdown id={`${id}-calendar`} p="xs">
            <DatePicker
              value={selectedDate}
              defaultDate={selectedDate || minimumDate}
              minDate={minimumDate}
              maxDate={maximumDate}
              onChange={(date) => {
                onValueChange(isoDateToAdminInput(date));
                setOpened(false);
              }}
            />
          </Popover.Dropdown>
        </Popover>
      }
    />
  );
}
