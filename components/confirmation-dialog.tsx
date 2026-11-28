"use client";

import { Alert, Button, Group, Modal, Stack, type ModalProps } from "@mantine/core";
import { ReactNode, RefObject, useCallback, useEffect, useRef } from "react";
import layout from "./overlay-layout.module.css";

type Props = {
  title: string;
  children: ReactNode;
  cancelLabel: string;
  busy: boolean;
  size?: ModalProps["size"];
  danger?: boolean;
  confirmDisabled?: boolean;
  alternateLabel?: string;
  onAlternate?: () => void;
  error?: string;
  footerSummary?: ReactNode;
  fallbackFocusRef?: RefObject<HTMLElement | null>;
  returnFocusRef?: RefObject<HTMLElement | null>;
  onCancel: () => void;
} & (
  | ({ confirmLabel: string; busyLabel: string } & (
      { formId: string; onConfirm?: never } | { formId?: never; onConfirm: () => void }
    ))
  | { confirmLabel?: never; busyLabel?: never; formId?: never; onConfirm?: never }
);

/** Compatibility boundary for existing mutation dialogs; Mantine owns the portal and focus trap. */
export function ConfirmationDialog({
  title,
  children,
  cancelLabel,
  confirmLabel,
  busyLabel,
  busy,
  size = "lg",
  danger = false,
  confirmDisabled = false,
  alternateLabel,
  onAlternate,
  error,
  footerSummary,
  fallbackFocusRef,
  returnFocusRef,
  onCancel,
  onConfirm,
  formId,
}: Props) {
  const closeButton = useRef<HTMLButtonElement>(null);
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
      if (!target?.isConnected || target === document.body || target.closest("[inert]")) continue;
      target.focus({ preventScroll: true });
      if (document.activeElement === target) return;
    }
  }, [fallbackFocusRef, returnFocusRef]);
  useEffect(() => {
    // Existing consumers mount/unmount rather than toggling `opened`. Resolve refs
    // after portal removal; Mantine owns the focus trap inside the open dialog.
    return () => queueMicrotask(restoreFocus);
  }, [restoreFocus]);
  useEffect(() => {
    if (!confirmLabel && !busy && document.activeElement === document.body)
      closeButton.current?.focus({ preventScroll: true });
  }, [busy, confirmLabel]);

  return (
    <Modal.Root
      opened
      onClose={() => {
        if (!busy) onCancel();
      }}
      centered
      closeOnEscape={!busy}
      closeOnClickOutside={!busy}
      returnFocus={false}
      size={size}
      classNames={{ content: layout.content, body: layout.body }}
    >
      <Modal.Overlay />
      <Modal.Content aria-busy={busy}>
        <Modal.Header>
          <Modal.Title>{title}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Stack gap="md">
            {children}
            {error && (
              <Alert color="danger" role="alert">
                {error}
              </Alert>
            )}
          </Stack>
        </Modal.Body>
        <Group component="footer" className={layout.footer} justify="flex-end" gap="xs" p="md">
          {footerSummary}
          <Button
            ref={closeButton}
            data-autofocus={(!busy && (!confirmLabel || (danger && !formId))) || undefined}
            variant="default"
            disabled={busy}
            onClick={onCancel}
            type="button"
          >
            {cancelLabel}
          </Button>
          {alternateLabel && onAlternate && (
            <Button variant="default" disabled={busy} onClick={onAlternate} type="button">
              {alternateLabel}
            </Button>
          )}
          {confirmLabel && (
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
          )}
        </Group>
      </Modal.Content>
    </Modal.Root>
  );
}
