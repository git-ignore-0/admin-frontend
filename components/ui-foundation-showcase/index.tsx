"use client";

import {
  Box,
  Button,
  Checkbox,
  Drawer,
  getDefaultZIndex,
  Group,
  Modal,
  Stack,
  Tabs,
  Text,
  Title,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { IconArrowLeft } from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import layout from "@/components/overlay-layout.module.css";
import { ShowcaseColor, ShowcaseComponents } from "./component-library";
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
const showcaseTabs = [
  ["color", "2.1. Color"],
  ["components", "2.2. Components"],
  ["toolbar", "2.3. List Toolbar"],
  ["list", "2.4. Data List"],
  ["details", "2.5. Detail & Dialog"],
] as const;
type ShowcaseTab = (typeof showcaseTabs)[number][0];
type OpenDetail = { id: string; readOnly: boolean };

function activeRecordId() {
  const hash = window.location.hash;
  return hash.startsWith("#record-") ? hash.slice("#record-".length) : null;
}

export function UiFoundationShowcase() {
  const mobile = useMediaQuery("(max-width: 47.99em)");
  const [records, setRecords] = useState(() => [...initialRecords, ...extendedRecords]);
  const [tab, setTab] = useState<ShowcaseTab>("color");
  const [detail, setDetail] = useState<OpenDetail | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [dialogError, setDialogError] = useState("");
  const [failNextRequest, setFailNextRequest] = useState(false);
  const [busy, setBusy] = useState(false);
  const [focusAction, setFocusAction] = useState<RecordAction | null>(null);
  const [message, setMessage] = useState("");
  const nextRecordNumber = useRef(initialRecords.length + extendedRecords.length + 1);
  const detailTrigger = useRef<HTMLElement | null>(null);
  const dialogTrigger = useRef<HTMLButtonElement | null>(null);
  const detailActionTrigger = useRef<HTMLButtonElement>(null);
  const submission = useRef<number | null>(null);
  const mobileHeading = useRef<HTMLHeadingElement>(null);
  const activeTab = useRef<HTMLButtonElement>(null);
  const tabList = useRef<HTMLDivElement>(null);
  const drawerClose = useRef<HTMLButtonElement>(null);
  const previousSelection = useRef<string | null>(null);

  const selected = records.find((record) => record.id === detail?.id);
  const standardRecord = records.find((record) => record.id === "NFV-001") ?? records[0];
  const longRecord = records.find((record) => record.id === "NFV-004");
  const mobileDetailOpen = mobile && Boolean(selected);
  const drawerOpen = !mobile && Boolean(selected);
  const dialogRecord = selected ?? standardRecord;
  const dialogReturnFocus = selected ? detailActionTrigger : dialogTrigger;
  const dialogFallback = selected ? (mobile ? mobileHeading : drawerClose) : activeTab;

  useEffect(() => {
    const readLocation = () => {
      const id = activeRecordId();
      const storedTab = window.history.state?.nfvShowcaseTab;
      const storedDetail = window.history.state?.nfvShowcaseDetail;
      const isExampleEntry = storedDetail?.id === id && id !== null;
      const historyTab = showcaseTabs.find(([value]) => value === storedTab)?.[0];
      setTab(id && !isExampleEntry ? "list" : (historyTab ?? "color"));
      setDetail(id ? { id, readOnly: isExampleEntry && storedDetail.readOnly === true } : null);
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
        : activeTab.current;
      trigger?.focus({ preventScroll: !mobile });
      detailTrigger.current = null;
    }
    previousSelection.current = displayedRecordId;
  }, [displayedRecordId, mobile]);

  function changeTab(value: string | null) {
    const nextTab = showcaseTabs.find(([id]) => id === value)?.[0];
    if (!nextTab || nextTab === tab) return;
    window.history.replaceState({ nfvShowcaseTab: nextTab }, "");
    setTab(nextTab);
  }

  function openDetail(id: string, trigger: HTMLElement, readOnly = false) {
    const nextDetail = { id, readOnly };
    detailTrigger.current = trigger;
    setFocusAction(null);
    window.history.pushState(
      { nfvShowcaseTab: tab, nfvShowcaseDetail: nextDetail },
      "",
      recordHref(id),
    );
    setDetail(nextDetail);
  }

  function closeDetail() {
    if (window.history.state?.nfvShowcaseDetail?.id === detail?.id) {
      window.history.back();
    } else {
      const { pathname, search } = window.location;
      window.history.replaceState({ nfvShowcaseTab: tab }, "", pathname + search);
      setDetail(null);
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
      if (dialog === "edit" && dialogRecord) {
        setRecords((current) =>
          current.map((record) =>
            record.id === dialogRecord.id ? { ...record, ...fields } : record,
          ),
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
  const detailActions = selected && !detail?.readOnly && (
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
          <Title order={1}>UI Foundation</Title>
          <Tabs value={tab} onChange={changeTab} keepMounted={false}>
            <Tabs.List aria-label="Foundation sections" ref={tabList}>
              {showcaseTabs.map(([value, label]) => (
                <Tabs.Tab
                  key={value}
                  value={value}
                  data-review-tab={value}
                  ref={value === tab ? activeTab : undefined}
                >
                  {label}
                </Tabs.Tab>
              ))}
            </Tabs.List>
            <Tabs.Panel value="color" pt="lg">
              <ShowcaseColor />
            </Tabs.Panel>
            <Tabs.Panel value="components" pt="lg">
              <ShowcaseComponents
                onNavigate={(value) => {
                  tabList.current
                    ?.querySelector<HTMLButtonElement>(`[data-review-tab="${value}"]`)
                    ?.focus();
                  changeTab(value);
                }}
              />
            </Tabs.Panel>
            <SampleRecordList
              records={records}
              selectedId={displayedRecordId}
              onOpen={openDetail}
              onCreate={(trigger) => openDialog("create", trigger)}
            />
            <Tabs.Panel value="details" pt="lg">
              <Stack gap="lg">
                <Stack gap="sm">
                  <Title order={2}>Drawer and mobile detail</Title>
                  <Group gap="xs">
                    <Button
                      variant="default"
                      disabled={!standardRecord}
                      onClick={(event) =>
                        standardRecord && openDetail(standardRecord.id, event.currentTarget)
                      }
                    >
                      Open standard detail
                    </Button>
                    <Button
                      variant="default"
                      disabled={!longRecord}
                      onClick={(event) =>
                        longRecord && openDetail(longRecord.id, event.currentTarget)
                      }
                    >
                      Open long-content detail
                    </Button>
                    <Button
                      variant="default"
                      disabled={!standardRecord}
                      onClick={(event) =>
                        standardRecord && openDetail(standardRecord.id, event.currentTarget, true)
                      }
                    >
                      Open read-only detail
                    </Button>
                  </Group>
                </Stack>
                <Stack gap="sm">
                  <Title order={2}>Modal and ConfirmationDialog</Title>
                  <Checkbox
                    label="Fail next sample request"
                    checked={failNextRequest}
                    onChange={(event) => setFailNextRequest(event.currentTarget.checked)}
                  />
                  <Group gap="xs">
                    <Button
                      variant="default"
                      onClick={(event) => openDialog("info", event.currentTarget)}
                    >
                      Information
                    </Button>
                    <Button
                      variant="default"
                      disabled={!standardRecord}
                      onClick={(event) => openDialog("confirm", event.currentTarget)}
                    >
                      Confirmation
                    </Button>
                    <Button
                      color="danger"
                      variant="light"
                      disabled={!standardRecord}
                      onClick={(event) => openDialog("remove", event.currentTarget)}
                    >
                      Destructive confirmation
                    </Button>
                    <Button
                      variant="default"
                      onClick={(event) => openDialog("create", event.currentTarget)}
                    >
                      Create form
                    </Button>
                    <Button
                      variant="default"
                      disabled={!standardRecord}
                      onClick={(event) => openDialog("edit", event.currentTarget)}
                    >
                      Edit form (640 px)
                    </Button>
                  </Group>
                </Stack>
              </Stack>
            </Tabs.Panel>
          </Tabs>
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
            {tab === "details" ? "Back to Detail & Dialog" : "Back to sample records"}
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
          padding="md"
          radius={0}
          zIndex={getDefaultZIndex("modal") - 1}
          returnFocus={false}
          trapFocus={!dialog}
          closeOnEscape={!dialog}
          closeOnClickOutside={!dialog}
          classNames={{ content: layout.content, body: layout.body }}
          styles={{ title: { fontSize: "var(--mantine-font-size-lg)", fontWeight: 600 } }}
        >
          <Drawer.Overlay />
          <Drawer.Content
            className={layout.recordDetailContent}
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
                size={32}
                iconSize={18}
                c="dimmed"
                style={{ alignSelf: "flex-start", flexShrink: 0 }}
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
          record={dialog === "edit" ? dialogRecord : undefined}
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
