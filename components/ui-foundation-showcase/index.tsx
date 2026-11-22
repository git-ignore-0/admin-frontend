"use client";

import {
  Anchor,
  Box,
  Button,
  Checkbox,
  Drawer,
  getDefaultZIndex,
  Group,
  Modal,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { IconArrowLeft } from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import layout from "@/components/overlay-layout.module.css";
import { ShowcaseComponents } from "./component-library";
import { SampleRecordList } from "./record-list";
import {
  SampleRecordActions,
  SampleRecordDetails,
  SampleRecordEditor,
  type RecordAction,
} from "./record-overlays";
import {
  extendedRecords,
  initialRecords,
  recordHref,
  recordId,
  type RecordFields,
} from "./sample-records";

type Dialog = RecordAction | "create" | "info";

function activeRecordId() {
  const hash = window.location.hash;
  return hash.startsWith("#record-") ? hash.slice("#record-".length) : null;
}

export function UiFoundationShowcase() {
  const mobile = useMediaQuery("(max-width: 47.99em)");
  const [records, setRecords] = useState(() => [...initialRecords, ...extendedRecords]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [dialogError, setDialogError] = useState("");
  const [failNextRequest, setFailNextRequest] = useState(false);
  const [readOnlyDetail, setReadOnlyDetail] = useState(false);
  const [busy, setBusy] = useState(false);
  const [focusAction, setFocusAction] = useState<RecordAction | null>(null);
  const [message, setMessage] = useState("");
  const nextRecordNumber = useRef(initialRecords.length + extendedRecords.length + 1);
  const detailTrigger = useRef<HTMLAnchorElement | null>(null);
  const dialogTrigger = useRef<HTMLButtonElement | null>(null);
  const detailActionTrigger = useRef<HTMLButtonElement>(null);
  const recordHistoryEntry = useRef<string | null>(null);
  const submission = useRef<number | null>(null);
  const mobileHeading = useRef<HTMLHeadingElement>(null);
  const listHeading = useRef<HTMLHeadingElement>(null);
  const drawerClose = useRef<HTMLButtonElement>(null);
  const previousSelection = useRef<string | null>(null);

  const selected = records.find((record) => record.id === selectedId);
  const mobileDetailOpen = mobile && Boolean(selected);
  const drawerOpen = !mobile && Boolean(selected);
  const dialogRecord = selected ?? records[0];
  const dialogReturnFocus = selected ? detailActionTrigger : dialogTrigger;
  const dialogFallback = selected ? (mobile ? mobileHeading : drawerClose) : listHeading;

  useEffect(() => {
    const readLocation = () => {
      const id = activeRecordId();
      if (!id) recordHistoryEntry.current = null;
      setSelectedId(id);
      setFocusAction(null);
      setDialog(null);
      if (submission.current !== null) window.clearTimeout(submission.current);
      submission.current = null;
      setBusy(false);
    };
    readLocation();
    window.addEventListener("popstate", readLocation);
    window.addEventListener("hashchange", readLocation);
    return () => {
      window.removeEventListener("popstate", readLocation);
      window.removeEventListener("hashchange", readLocation);
      if (submission.current !== null) window.clearTimeout(submission.current);
    };
  }, []);

  const displayedRecordId = selected?.id ?? null;
  useEffect(() => {
    if (displayedRecordId && mobile && !mobileHeading.current?.closest("[inert]")) {
      mobileHeading.current?.focus();
    }
    if (!displayedRecordId && previousSelection.current) {
      const trigger = detailTrigger.current?.isConnected
        ? detailTrigger.current
        : listHeading.current;
      trigger?.focus({ preventScroll: !mobile });
      detailTrigger.current = null;
    }
    previousSelection.current = displayedRecordId;
  }, [displayedRecordId, mobile]);

  function openDetail(id: string, trigger: HTMLAnchorElement) {
    detailTrigger.current = trigger;
    recordHistoryEntry.current = id;
    setFocusAction(null);
    window.history.pushState(null, "", recordHref(id));
    setSelectedId(id);
  }

  function closeDetail() {
    if (recordHistoryEntry.current === selectedId) {
      recordHistoryEntry.current = null;
      window.history.back();
    } else {
      window.history.replaceState(null, "", "#sample-records");
      setSelectedId(null);
    }
  }

  function openDialog(action: Dialog, trigger: HTMLButtonElement) {
    dialogTrigger.current = trigger;
    if (selected && (action === "edit" || action === "confirm" || action === "remove")) {
      setFocusAction(action);
    }
    setDialogError("");
    setDialog(action);
  }

  function closeDialog() {
    // Both a rapid second click and dismissal during a pending update reach this guard.
    if (submission.current !== null) return;
    setDialog(null);
    if (dialog === "edit" || dialog === "create" || dialog === "info") {
      window.requestAnimationFrame(() => {
        const origin = dialogReturnFocus.current;
        const target = origin?.isConnected ? origin : dialogFallback.current;
        if (!target?.closest("[inert]")) target?.focus({ preventScroll: true });
      });
    }
  }

  function simulateUpdate(update: () => void) {
    if (submission.current !== null) return;
    setDialogError("");
    setBusy(true);
    submission.current = window.setTimeout(() => {
      submission.current = null;
      setBusy(false);
      if (failNextRequest) {
        setFailNextRequest(false);
        setDialogError("Sample request failed. Try again.");
        return;
      }
      update();
      closeDialog();
    }, 650);
  }

  function saveRecord(fields: RecordFields) {
    simulateUpdate(() => {
      if (dialog === "edit" && selected) {
        setRecords((current) =>
          current.map((record) => (record.id === selected.id ? { ...record, ...fields } : record)),
        );
        setMessage("Sample record updated.");
      } else {
        const id = recordId(nextRecordNumber.current++);
        setRecords((current) => [{ ...fields, id }, ...current]);
        setMessage("Sample record created.");
      }
    });
  }

  function confirmAction(keepAsDraft = false) {
    if (!dialogRecord) return;
    simulateUpdate(() => {
      if (dialog === "remove" && !keepAsDraft) {
        setRecords((current) => current.filter((record) => record.id !== dialogRecord.id));
        if (selected) closeDetail();
        setMessage("Sample record removed.");
      } else {
        setRecords((current) =>
          current.map((record) =>
            record.id === dialogRecord.id
              ? { ...record, status: keepAsDraft ? "neutral" : "success" }
              : record,
          ),
        );
        setMessage(keepAsDraft ? "Sample record kept as a draft." : "Sample review confirmed.");
      }
    });
  }

  const details = selected && <SampleRecordDetails record={selected} />;
  const detailActions = selected && !readOnlyDetail && (
    <SampleRecordActions
      focusAction={focusAction}
      focusActionRef={detailActionTrigger}
      onAction={openDialog}
    />
  );

  return (
    <>
      <div hidden={mobileDetailOpen} inert={Boolean(dialog) || drawerOpen || undefined}>
        <Stack gap="xl" miw={0}>
          <Stack gap="sm">
            <Title order={1}>UI Foundation</Title>
            <Text c="dimmed">Interactive Mantine examples and sample records for NFV Admin.</Text>
            <Group component="nav" aria-label="Showcase sections" gap="md">
              <Anchor href="#list-toolbar">ListToolbar</Anchor>
              <Anchor href="#data-list">Data List</Anchor>
              <Anchor href="#detail-examples">Detail and Drawer</Anchor>
              <Anchor href="#modal-examples">Modal and ConfirmationDialog</Anchor>
              <Anchor href="#colors-and-tokens">Color and typography</Anchor>
              <Anchor href="#form-examples">Form controls</Anchor>
              <Anchor href="#action-examples">Buttons and navigation</Anchor>
              <Anchor href="#feedback-examples">Semantic feedback</Anchor>
            </Group>
          </Stack>

          <Stack component="section" gap="md" aria-labelledby="sample-records" miw={0}>
            <Title id="sample-records" order={2} tabIndex={-1} ref={listHeading}>
              Sample records
            </Title>
            <SampleRecordList
              records={records}
              selectedId={displayedRecordId}
              onOpen={openDetail}
              onCreate={(trigger) => openDialog("create", trigger)}
            />
          </Stack>

          <Stack component="section" gap="md" aria-labelledby="detail-and-dialogs">
            <Title id="detail-and-dialogs" order={2}>
              Details and dialogs
            </Title>
            <Stack component="section" gap="xs" aria-labelledby="detail-examples">
              <Title id="detail-examples" order={3}>
                Detail and Drawer
              </Title>
              <Text c="dimmed">
                Open a record to try editing and confirmation inside the Drawer. NFV-004 has long
                field notes.
              </Text>
              <Checkbox
                label="Read-only detail"
                checked={readOnlyDetail}
                onChange={(event) => setReadOnlyDetail(event.currentTarget.checked)}
              />
            </Stack>
            <Stack component="section" gap="xs" aria-labelledby="modal-examples">
              <Title id="modal-examples" order={3}>
                Modal and ConfirmationDialog
              </Title>
              <Checkbox
                label="Fail next sample request"
                checked={failNextRequest}
                onChange={(event) => setFailNextRequest(event.currentTarget.checked)}
              />
              <Group gap="xs">
                <Button
                  variant="default"
                  onClick={(event) => openDialog("create", event.currentTarget)}
                >
                  Create modal
                </Button>
                <Button
                  variant="default"
                  disabled={!records.length}
                  onClick={(event) => openDialog("confirm", event.currentTarget)}
                >
                  Confirmation
                </Button>
                <Button
                  color="danger"
                  variant="light"
                  disabled={!records.length}
                  onClick={(event) => openDialog("remove", event.currentTarget)}
                >
                  Destructive confirmation
                </Button>
                <Button
                  variant="subtle"
                  onClick={(event) => openDialog("info", event.currentTarget)}
                >
                  Information
                </Button>
              </Group>
            </Stack>
          </Stack>

          <ShowcaseComponents />
        </Stack>
      </div>

      {mobileDetailOpen && selected && (
        <Stack
          component="article"
          gap="md"
          bg="var(--background)"
          inert={Boolean(dialog) || undefined}
          aria-labelledby="mobile-record-title"
        >
          <Button
            variant="subtle"
            w="fit-content"
            leftSection={<IconArrowLeft size={16} aria-hidden />}
            onClick={closeDetail}
          >
            Back to sample records
          </Button>
          <Stack gap={4}>
            <Title
              order={1}
              id="mobile-record-title"
              ref={mobileHeading}
              tabIndex={-1}
              style={{ overflowWrap: "anywhere" }}
            >
              {selected.name}
            </Title>
            <Text size="sm" c="dimmed">
              {selected.id}
            </Text>
          </Stack>
          {details}
          {detailActions}
        </Stack>
      )}

      {!mobile && (
        <Drawer.Root
          opened={drawerOpen}
          onClose={closeDetail}
          position="right"
          size={640}
          zIndex={getDefaultZIndex("modal") - 1}
          returnFocus={false}
          trapFocus={!dialog}
          closeOnEscape={!dialog}
          closeOnClickOutside={!dialog}
          classNames={{ content: layout.content, body: layout.body }}
        >
          <Drawer.Overlay />
          <Drawer.Content
            inert={Boolean(dialog) || undefined}
            aria-hidden={dialog ? true : undefined}
          >
            <Drawer.Header>
              <Stack gap={4} miw={0}>
                <Drawer.Title>{selected?.name}</Drawer.Title>
                <Text size="sm" c="dimmed">
                  {selected?.id}
                </Text>
              </Stack>
              <Drawer.CloseButton
                aria-label="Close sample detail"
                ref={drawerClose}
                data-autofocus={focusAction === null || undefined}
              />
            </Drawer.Header>
            <Drawer.Body>{details}</Drawer.Body>
            {detailActions}
          </Drawer.Content>
        </Drawer.Root>
      )}

      {(dialog === "create" || dialog === "edit") && (
        <SampleRecordEditor
          record={dialog === "edit" ? selected : undefined}
          busy={busy}
          error={dialogError}
          onClose={closeDialog}
          onSave={saveRecord}
        />
      )}
      {(dialog === "confirm" || dialog === "remove") && dialogRecord && (
        <ConfirmationDialog
          title={dialog === "remove" ? "Remove sample record" : "Confirm sample review"}
          cancelLabel="Cancel"
          confirmLabel={dialog === "remove" ? "Remove record" : "Confirm"}
          busyLabel={dialog === "remove" ? "Removing…" : "Confirming…"}
          danger={dialog === "remove"}
          busy={busy}
          size={400}
          error={dialogError}
          onCancel={closeDialog}
          onConfirm={() => confirmAction()}
          alternateLabel={dialog === "remove" ? "Keep as draft" : undefined}
          onAlternate={dialog === "remove" ? () => confirmAction(true) : undefined}
          returnFocusRef={dialogReturnFocus}
          fallbackFocusRef={dialogFallback}
        >
          <Text>
            {dialog === "remove" ? "Remove" : "Mark as reviewed"}{" "}
            <Text component="span" fw={600}>
              {dialogRecord.name}
            </Text>
            ?
          </Text>
        </ConfirmationDialog>
      )}
      {dialog === "info" && (
        <Modal.Root
          opened
          onClose={closeDialog}
          size={400}
          returnFocus={false}
          classNames={{ content: layout.content, body: layout.body }}
        >
          <Modal.Overlay />
          <Modal.Content>
            <Modal.Header>
              <Modal.Title>About sample records</Modal.Title>
              <Modal.CloseButton aria-label="Close information" />
            </Modal.Header>
            <Modal.Body>
              <Text>
                Changes here apply to the sample data in this browser session. Reload the page to
                restore the original examples.
              </Text>
            </Modal.Body>
            <Group component="footer" className={layout.footer} justify="flex-end" gap="xs" p="md">
              <Button variant="default" onClick={closeDialog}>
                Done
              </Button>
            </Group>
          </Modal.Content>
        </Modal.Root>
      )}
      <Box
        aria-label="Sample mutation result"
        aria-live="polite"
        component="output"
        style={{
          position: "absolute",
          width: 1,
          height: 1,
          overflow: "hidden",
          clipPath: "inset(50%)",
        }}
      >
        {message}
      </Box>
    </>
  );
}
