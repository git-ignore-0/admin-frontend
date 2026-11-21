"use client";

import { Alert, Button, Group, Modal, Stack } from "@mantine/core";
import { ReactNode, RefObject, useCallback, useEffect, useRef } from "react";

type Props = {
  title: string;
  children: ReactNode;
  cancelLabel: string;
  confirmLabel: string;
  busyLabel: string;
  busy: boolean;
  danger?: boolean;
  confirmDisabled?: boolean;
  alternateLabel?: string;
  onAlternate?: () => void;
  error?: string;
  fallbackFocusRef?: RefObject<HTMLElement | null>;
  returnFocusRef?: RefObject<HTMLElement | null>;
  onCancel: () => void;
} & ({ formId: string; onConfirm?: never } | { formId?: never; onConfirm: () => void });

/** Compatibility boundary for existing mutation dialogs; Mantine owns the portal and focus trap. */
export function ConfirmationDialog({
  title,
  children,
  cancelLabel,
  confirmLabel,
  busyLabel,
  busy,
  danger = false,
  confirmDisabled = false,
  alternateLabel,
  onAlternate,
  error,
  fallbackFocusRef,
  returnFocusRef,
  onCancel,
  onConfirm,
  formId,
}: Props) {
  const originalFocus = useRef<HTMLElement | null>(
    typeof document === "undefined" ? null : (document.activeElement as HTMLElement | null),
  );
  const restoreFocus = useCallback(() => {
    const active = document.activeElement as HTMLElement | null;
    // A consumer can deliberately focus a validation field as it closes. Do not
    // replace that decision with a generic return target.
    if (active?.isConnected && active !== document.body) return;
    for (const target of [
      returnFocusRef?.current,
      originalFocus.current,
      fallbackFocusRef?.current,
    ]) {
      if (!target?.isConnected || target === document.body) continue;
      target.focus({ preventScroll: true });
      if (document.activeElement === target) return;
    }
  }, [fallbackFocusRef, returnFocusRef]);
  useEffect(() => {
    // Existing consumers mount/unmount rather than toggling `opened`. Resolve refs
    // after portal removal; Mantine owns the focus trap inside the open dialog.
    return () => queueMicrotask(restoreFocus);
  }, [restoreFocus]);

  return (
    <Modal
      opened
      onClose={() => {
        if (!busy) onCancel();
      }}
      title={title}
      centered
      withCloseButton={false}
      closeOnEscape={!busy}
      closeOnClickOutside={!busy}
      returnFocus={false}
      aria-busy={busy}
      size="lg"
    >
      <Stack gap="md">
        {children}
        {error && (
          <Alert color="red" role="alert">
            {error}
          </Alert>
        )}
        <Group justify="flex-end" gap="sm">
          <Button variant="default" disabled={busy} onClick={onCancel} type="button">
            {cancelLabel}
          </Button>
          {alternateLabel && onAlternate && (
            <Button variant="default" disabled={busy} onClick={onAlternate} type="button">
              {alternateLabel}
            </Button>
          )}
          <Button
            color={danger ? "red" : undefined}
            disabled={busy || confirmDisabled}
            form={formId}
            loading={busy}
            onClick={onConfirm}
            type={formId ? "submit" : "button"}
          >
            {busy ? busyLabel : confirmLabel}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
