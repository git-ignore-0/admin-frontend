"use client";

import { useEffect, useState } from "react";
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
  readOnly,
  value,
  className,
  min,
  max,
  ...props
}: Props) {
  const [opened, setOpened] = useState(false);
  const isLocked = disabled || readOnly;
  const calendarOpened = opened && !isLocked;
  const selectedDate = adminDateInputToIso(value);
  const minimumDate = pickerMin || (typeof min === "string" ? min : undefined);
  const maximumDate = typeof max === "string" ? max : undefined;
  useEffect(() => {
    if (isLocked) setOpened(false);
  }, [isLocked]);

  return (
    <TextInput
      {...props}
      disabled={disabled}
      readOnly={readOnly}
      error={props["aria-invalid"] === true || props["aria-invalid"] === "true"}
      id={id}
      classNames={{ input: className }}
      attributes={{
        input: {
          "aria-describedby": props["aria-describedby"],
          ...(props["aria-invalid"] !== undefined ? { "aria-invalid": props["aria-invalid"] } : {}),
        },
      }}
      inputMode="numeric"
      maxLength={10}
      onChange={(event) => {
        if (!isLocked) onValueChange(formatAdminDateInputValue(event.currentTarget.value));
      }}
      placeholder="dd/mm/yyyy"
      type="text"
      value={value}
      rightSectionPointerEvents="all"
      rightSection={
        <Popover
          disabled={isLocked}
          id={`${id}-calendar`}
          opened={calendarOpened}
          onChange={setOpened}
          position="bottom-end"
          withArrow
          returnFocus
          trapFocus
        >
          <Popover.Target>
            <ActionIcon
              aria-label={pickerLabel}
              disabled={isLocked}
              onClick={() => setOpened((current) => !current)}
              title={pickerLabel}
              type="button"
              variant="subtle"
              size="sm"
            >
              <IconCalendar size={17} stroke={1.7} />
            </ActionIcon>
          </Popover.Target>
          <Popover.Dropdown p="xs" data-mantine-stop-propagation>
            <DatePicker
              // Mantine uses this marker for a calendar popover inside another overlay.
              __stopPropagation
              value={selectedDate}
              defaultDate={selectedDate || minimumDate}
              minDate={minimumDate}
              maxDate={maximumDate}
              onChange={(date) => {
                if (isLocked) return;
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
