"use client";

import {
  Alert,
  Badge,
  Box,
  Button,
  Group,
  Modal,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
} from "@mantine/core";
import { type FormEvent, type MouseEvent, type RefObject, useRef, useState } from "react";
import {
  newRecordFields,
  recordCategories,
  recordStatuses,
  type RecordFields,
  type RecordStatus,
  type SampleRecord,
} from "./sample-records";

export type RecordAction = "edit" | "confirm" | "remove";

export function SampleRecordDetails({
  record,
  focusAction,
  focusActionRef,
  onAction,
}: {
  record: SampleRecord;
  focusAction: RecordAction | null;
  focusActionRef: RefObject<HTMLButtonElement | null>;
  onAction: (action: RecordAction, trigger: HTMLButtonElement) => void;
}) {
  const details = [
    ["Record code", record.id],
    ["Category", record.category],
    ["Location", record.location || "Unspecified"],
  ];
  const action = (type: RecordAction) => (event: MouseEvent<HTMLButtonElement>) =>
    onAction(type, event.currentTarget);

  return (
    <Stack gap="md">
      <Paper withBorder p="md">
        <Stack gap="sm">
          <Title order={2}>Record information</Title>
          <SimpleGrid component="dl" cols={{ base: 1, xs: 2 }} m={0} spacing="md">
            {details.map(([label, value]) => (
              <Box key={label} miw={0}>
                <Text component="dt" size="sm" c="dimmed">
                  {label}
                </Text>
                <Text component="dd" m={0} style={{ overflowWrap: "anywhere" }}>
                  {value}
                </Text>
              </Box>
            ))}
            <Box miw={0}>
              <Text component="dt" mb={4} size="sm" c="dimmed">
                Status
              </Text>
              <Box component="dd" m={0}>
                <Badge color={record.status}>{recordStatuses[record.status]}</Badge>
              </Box>
            </Box>
          </SimpleGrid>
        </Stack>
      </Paper>
      <Paper withBorder p="md">
        <Stack gap="xs">
          <Title order={2}>Field notes</Title>
          <Text>{record.notes || "No field notes recorded."}</Text>
        </Stack>
      </Paper>
      <Group gap="xs" justify="flex-end">
        <Button
          variant="default"
          ref={focusAction === "edit" ? focusActionRef : undefined}
          data-autofocus={focusAction === "edit" || undefined}
          onClick={action("edit")}
        >
          Edit record
        </Button>
        <Button
          variant="light"
          ref={focusAction === "confirm" ? focusActionRef : undefined}
          data-autofocus={focusAction === "confirm" || undefined}
          onClick={action("confirm")}
        >
          Confirm review
        </Button>
        <Button
          color="danger"
          variant="subtle"
          ref={focusAction === "remove" ? focusActionRef : undefined}
          data-autofocus={focusAction === "remove" || undefined}
          onClick={action("remove")}
        >
          Remove record
        </Button>
      </Group>
    </Stack>
  );
}

export function SampleRecordEditor({
  record,
  busy,
  onClose,
  onSave,
}: {
  record?: SampleRecord;
  busy: boolean;
  onClose: () => void;
  onSave: (fields: RecordFields) => void;
}) {
  const [fields, setFields] = useState<RecordFields>(record ?? newRecordFields);
  const [invalidName, setInvalidName] = useState(false);
  const name = useRef<HTMLInputElement>(null);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    const trimmedName = fields.name.trim();
    if (!trimmedName) {
      setInvalidName(true);
      name.current?.focus();
      return;
    }
    onSave({
      ...fields,
      name: trimmedName,
      location: fields.location.trim(),
      notes: fields.notes.trim(),
    });
  };

  return (
    <Modal
      opened
      onClose={onClose}
      title={record ? "Edit sample record" : "Create sample record"}
      size="lg"
      returnFocus={false}
      closeOnEscape={!busy}
      closeOnClickOutside={!busy}
      withCloseButton={!busy}
      closeButtonProps={{ "aria-label": "Close record editor" }}
      aria-busy={busy}
    >
      <form noValidate onSubmit={submit}>
        <Stack gap="md">
          {invalidName && (
            <Alert color="danger" role="alert">
              Enter a record name to continue.
            </Alert>
          )}
          <TextInput
            ref={name}
            data-autofocus
            label="Record name"
            required
            disabled={busy}
            value={fields.name}
            maxLength={120}
            error={invalidName ? "A record name is required." : undefined}
            onChange={(event) => {
              const value = event.currentTarget.value;
              setFields((current) => ({ ...current, name: value }));
              if (value.trim()) setInvalidName(false);
            }}
          />
          <SimpleGrid cols={{ base: 1, xs: 2 }}>
            <Select
              label="Category"
              data={recordCategories}
              value={fields.category}
              disabled={busy}
              comboboxProps={{ withinPortal: false }}
              onChange={(value) =>
                value && setFields((current) => ({ ...current, category: value }))
              }
            />
            <Select
              label="Status"
              data={Object.entries(recordStatuses).map(([value, label]) => ({ value, label }))}
              value={fields.status}
              disabled={busy}
              comboboxProps={{ withinPortal: false }}
              onChange={(value) =>
                value && setFields((current) => ({ ...current, status: value as RecordStatus }))
              }
            />
          </SimpleGrid>
          <TextInput
            label="Location"
            disabled={busy}
            maxLength={120}
            value={fields.location}
            onChange={(event) => {
              const value = event.currentTarget.value;
              setFields((current) => ({ ...current, location: value }));
            }}
          />
          <Textarea
            label="Field notes"
            minRows={3}
            disabled={busy}
            value={fields.notes}
            onChange={(event) => {
              const value = event.currentTarget.value;
              setFields((current) => ({ ...current, notes: value }));
            }}
          />
          <Group justify="flex-end" gap="sm">
            <Button type="button" variant="default" disabled={busy} onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={busy} disabled={busy}>
              {busy ? "Saving…" : "Save record"}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
