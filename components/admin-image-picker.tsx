"use client";

import {
  ActionIcon,
  Badge,
  Button,
  FileButton,
  Group,
  Paper,
  Stack,
  Text,
  UnstyledButton,
  VisuallyHidden,
} from "@mantine/core";
import { useClickOutside } from "@mantine/hooks";
import {
  IconArrowLeft,
  IconArrowRight,
  IconPlus,
  IconStarFilled,
  IconTrash,
} from "@tabler/icons-react";
import Image from "next/image";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import classes from "./admin-image-picker.module.css";

export type ImagePickerItem = {
  id: string;
  src: string;
  alt: string;
};

type Labels = {
  choose: string;
  replace: string;
  empty: string;
  cover?: string;
  setCover?: string;
  moveEarlier?: string;
  moveLater?: string;
  remove: string;
  uploading?: string;
  select?: string;
};

type Props = {
  items: ImagePickerItem[];
  maxItems: number;
  labels: Labels;
  help?: string;
  fileName?: string;
  error?: string;
  busy?: boolean;
  onChooseFiles?: (files: File[]) => void;
  onRemove?: (id: string) => void;
  onMove?: (index: number, direction: -1 | 1) => void;
  onSetCover?: (index: number) => void;
};

export function AdminImagePicker({
  items,
  maxItems,
  labels,
  help,
  fileName,
  error,
  busy = false,
  onChooseFiles,
  onRemove,
  onMove,
  onSetCover,
}: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const clearSelection = useCallback(() => setSelectedId(null), []);
  const rootRef = useClickOutside<HTMLDivElement>(clearSelection, ["pointerdown", "focusin"]);
  const selectedTileRef = useRef<HTMLButtonElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  const resetFileInput = useRef<() => void>(null);
  const coverId = useId();

  const gallery = maxItems > 1;
  const readOnly = !onChooseFiles;
  const selectedIndex = gallery ? items.findIndex((item) => item.id === selectedId) : 0;
  const selected = items[selectedIndex];
  const canAdd = items.length < maxItems;
  const filePickerDisabled = busy || (gallery && !canAdd);
  const selectLabel = labels.select || labels.choose;

  useEffect(() => {
    if (!gallery || !selectedId) return;

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (actionsRef.current?.contains(document.activeElement)) {
        selectedTileRef.current?.focus();
      }
      clearSelection();
    }

    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [gallery, selectedId, clearSelection]);

  function chooseFiles(value: File | File[] | null) {
    resetFileInput.current?.();
    if (!value) return;
    const files = Array.isArray(value) ? value : [value];
    if (files.length) onChooseFiles?.(files);
  }

  function renderPicker(openFilePicker?: () => void) {
    const thumbnails = (
      <Group
        className={gallery ? classes.strip : undefined}
        gap={7}
        wrap="nowrap"
        maw="100%"
        role="group"
        aria-label={selectLabel}
        tabIndex={readOnly && gallery && items.length > 0 ? 0 : undefined}
      >
        {items.map((item, index) => {
          const image = <Image src={item.src} alt={item.alt} width={80} height={80} unoptimized />;
          if (!gallery) {
            return (
              <div key={item.id} className={classes.tile}>
                {image}
              </div>
            );
          }

          const isCover = index === 0 && Boolean(labels.cover);
          const coverMark = isCover && (
            <Badge
              component="span"
              aria-hidden
              circle
              size="xs"
              variant="white"
              pos="absolute"
              top={4}
              left={4}
              styles={{ label: { display: "flex" } }}
            >
              <IconStarFilled size={10} aria-hidden />
            </Badge>
          );
          if (readOnly) {
            return (
              <div
                key={item.id}
                className={classes.tile}
                role="group"
                aria-describedby={isCover ? coverId : undefined}
              >
                {image}
                {coverMark}
              </div>
            );
          }
          const isSelected = selectedId === item.id;
          return (
            <UnstyledButton
              key={item.id}
              ref={isSelected ? selectedTileRef : undefined}
              type="button"
              className={classes.tile}
              aria-label={`${selectLabel} ${index + 1}`}
              aria-describedby={isCover ? coverId : undefined}
              aria-pressed={isSelected}
              disabled={busy}
              onClick={() => setSelectedId(isSelected ? null : item.id)}
            >
              {image}
              {coverMark}
            </UnstyledButton>
          );
        })}
        {openFilePicker && canAdd && (
          <UnstyledButton
            className={`${classes.tile} ${classes.add}`}
            type="button"
            disabled={busy}
            onClick={openFilePicker}
            aria-label={`${labels.choose}…`}
          >
            <IconPlus size={17} aria-hidden />
            {items.length === 0 && (
              <Text component="small" size="xs" lh={1.2} px={3}>
                {labels.choose}
              </Text>
            )}
          </UnstyledButton>
        )}
      </Group>
    );

    const actions = !readOnly && selected && (
      <Paper ref={actionsRef} radius="sm" p={2} w="fit-content" maw="100%">
        <Group gap={2}>
          {gallery && (
            <Text component="span" className={classes.position} size="sm" c="dimmed" px={7}>
              {selectedIndex + 1}/{items.length}
            </Text>
          )}
          {gallery && onMove && (
            <>
              <ActionIcon
                variant="default"
                type="button"
                disabled={busy || selectedIndex === 0}
                aria-label={`${labels.moveEarlier} ${selectedIndex + 1}`}
                title={labels.moveEarlier}
                onClick={() => onMove(selectedIndex, -1)}
              >
                <IconArrowLeft size={16} aria-hidden />
              </ActionIcon>
              <ActionIcon
                variant="default"
                type="button"
                disabled={busy || selectedIndex === items.length - 1}
                aria-label={`${labels.moveLater} ${selectedIndex + 1}`}
                title={labels.moveLater}
                onClick={() => onMove(selectedIndex, 1)}
              >
                <IconArrowRight size={16} aria-hidden />
              </ActionIcon>
            </>
          )}
          {gallery && onSetCover && selectedIndex > 0 && (
            <Button
              variant="default"
              type="button"
              disabled={busy}
              title={labels.setCover}
              onClick={() => onSetCover(selectedIndex)}
            >
              {labels.setCover}
            </Button>
          )}
          {!gallery && (
            <Button variant="default" type="button" disabled={busy} onClick={openFilePicker}>
              {labels.replace}
            </Button>
          )}
          {onRemove && (
            <ActionIcon
              variant="light"
              color="red"
              type="button"
              disabled={busy}
              aria-label={labels.remove}
              title={labels.remove}
              onClick={() => {
                onRemove(selected.id);
                clearSelection();
              }}
            >
              <IconTrash size={16} aria-hidden />
            </ActionIcon>
          )}
        </Group>
      </Paper>
    );

    return (
      <Stack ref={rootRef} gap={3} miw={0}>
        {gallery && labels.cover && (
          <VisuallyHidden component="span" id={coverId}>
            {labels.cover}
          </VisuallyHidden>
        )}
        {gallery ? (
          thumbnails
        ) : (
          <Group gap={8} wrap="nowrap">
            {thumbnails}
            {actions}
          </Group>
        )}
        {items.length === 0 && (
          <Text size="sm" c="dimmed">
            {labels.empty}
          </Text>
        )}
        {fileName && (
          <Text className={classes.note} size="sm" c="dimmed">
            {fileName}
          </Text>
        )}
        {help && (
          <Text className={classes.note} size="sm" c="dimmed">
            {help}
          </Text>
        )}
        {busy && labels.uploading && (
          <Text size="sm" c="dimmed" role="status">
            {labels.uploading}
          </Text>
        )}
        {error && (
          <Text c="var(--danger)" fw={650} role="alert">
            {error}
          </Text>
        )}
        {gallery && actions}
      </Stack>
    );
  }

  if (readOnly) return renderPicker();

  return (
    <FileButton
      accept="image/jpeg,image/png,image/webp"
      multiple={gallery}
      disabled={filePickerDisabled}
      inputProps={{ "aria-label": labels.choose, disabled: filePickerDisabled }}
      resetRef={resetFileInput}
      onChange={chooseFiles}
    >
      {({ onClick }) => renderPicker(onClick)}
    </FileButton>
  );
}
