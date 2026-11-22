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
import { type FormEvent, type MouseEvent, type RefObject, useId, useRef, useState } from "react";
import layout from "@/components/overlay-layout.module.css";
import {
  newRecordFields,
  recordCategories,
  recordStatuses,
  type RecordFields,
  type RecordStatus,
  type SampleRecord,
} from "./sample-records";

export type RecordAction = "edit" | "confirm" | "remove";

export function SampleRecordDetails({ record }: { record: SampleRecord }) {
  const details = [
    ["Record code", record.id],
    ["Category", record.category],
    ["Location", record.location || "Unspecified"],
  ];

  return (
    <Stack gap="md">
      <Paper p="md">
        <Stack gap="sm">
          <Title order={2} size="h3" fw={600}>
            Record information
          </Title>
          <SimpleGrid component="dl" type="container" cols={{ base: 1, "26rem": 2 }} m={0}>
            {details.map(([label, value]) => (
              <Stack key={label} gap={4} miw={0}>
                <Text component="dt" size="sm" c="dimmed">
                  {label}
                </Text>
                <Text component="dd" m={0} style={{ overflowWrap: "anywhere" }}>
                  {value}
                </Text>
              </Stack>
            ))}
            <Stack gap={4} miw={0}>
              <Text component="dt" size="sm" c="dimmed">
                Status
              </Text>
              <Box component="dd" m={0}>
                <Badge color={record.status}>{recordStatuses[record.status]}</Badge>
              </Box>
            </Stack>
          </SimpleGrid>
        </Stack>
      </Paper>
      <Paper p="md">
        <Stack gap="xs">
          <Title order={2} size="h3" fw={600}>
            Field notes
          </Title>
          <Text style={{ overflowWrap: "anywhere", whiteSpace: "pre-wrap" }}>
            {record.notes || "No field notes recorded."}
          </Text>
        </Stack>
      </Paper>
    </Stack>
  );
}

export function SampleRecordActions({
  focusAction,
  focusActionRef,
  onAction,
}: {
  focusAction: RecordAction | null;
  focusActionRef: RefObject<HTMLButtonElement | null>;
  onAction: (action: RecordAction, trigger: HTMLButtonElement) => void;
}) {
  const action = (type: RecordAction) => (event: MouseEvent<HTMLButtonElement>) =>
    onAction(type, event.currentTarget);

  return (
    <Group component="footer" className={layout.footer} gap="xs" justify="flex-end" p="md">
      <Button
        variant="default"
        ref={focusAction === "edit" ? focusActionRef : undefined}
        data-autofocus={focusAction === "edit" || undefined}
        onClick={action("edit")}
      >
        Edit record
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
      <Button
        ref={focusAction === "confirm" ? focusActionRef : undefined}
        data-autofocus={focusAction === "confirm" || undefined}
        onClick={action("confirm")}
      >
        Confirm review
      </Button>
    </Group>
  );
}

export function SampleRecordEditor({
  record,
  busy,
  error,
  onClose,
  onSave,
}: {
  record?: SampleRecord;
  busy: boolean;
  error: string;
  onClose: () => void;
  onSave: (fields: RecordFields) => void;
}) {
  const [fields, setFields] = useState<RecordFields>(record ?? newRecordFields);
  const [invalidName, setInvalidName] = useState(false);
  const formId = useId();
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
    <Modal.Root
      opened
      onClose={onClose}
      size={record ? 640 : 480}
      returnFocus={false}
      closeOnEscape={!busy}
      closeOnClickOutside={!busy}
      classNames={{ content: layout.content, body: layout.body }}
    >
      <Modal.Overlay />
      <Modal.Content aria-busy={busy}>
        <Modal.Header>
          <Modal.Title>{record ? "Edit sample record" : "Create sample record"}</Modal.Title>
          {!busy && <Modal.CloseButton aria-label="Close record editor" />}
        </Modal.Header>
        <Modal.Body>
          <form id={formId} noValidate onSubmit={submit}>
            <Stack gap="md">
              {error && (
                <Alert color="danger" role="alert">
                  {error}
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
              <SimpleGrid type="container" cols={{ base: 1, "26rem": 2 }}>
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
            </Stack>
          </form>
        </Modal.Body>
        <Group component="footer" className={layout.footer} justify="flex-end" gap="xs" p="md">
          <Button type="button" variant="default" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form={formId} loading={busy} disabled={busy}>
            {busy ? "Saving…" : "Save record"}
          </Button>
        </Group>
      </Modal.Content>
    </Modal.Root>
  );
}
