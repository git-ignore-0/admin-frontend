"use client";

import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useRef, useState } from "react";
import { Alert, Button, Group, Loader, Paper, Stack, Text, TextInput } from "@mantine/core";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { useToast } from "@/components/toast-provider";
import { api } from "@/lib/client-api";
import { requestErrorMessage } from "@/lib/client-error";
import { normalizeLinkHref } from "@/lib/rich-text-links";
import type { MediaAsset, TiptapDocument } from "@/lib/types";

type HeadingLevel = 2 | 3 | 4;
type EditorSelection = { from: number; to: number };

export function setLinkForSelection(
  editor: NonNullable<ReturnType<typeof useEditor>>,
  selection: EditorSelection,
  href: string | null,
) {
  let chain = editor.chain().focus().setTextSelection(selection);
  if (selection.from === selection.to) chain = chain.extendMarkRange("link");
  return href ? chain.setLink({ href }).run() : chain.unsetLink().run();
}

export function toggleHeadingForSelection(
  editor: NonNullable<ReturnType<typeof useEditor>>,
  level: HeadingLevel,
) {
  let { from, to } = editor.state.selection;
  const { empty, $from, $to } = editor.state.selection;
  if (empty) return editor.chain().focus().toggleHeading({ level }).run();

  const splitEnd =
    $to.parent.isTextblock && $to.parentOffset > 0 && $to.parentOffset < $to.parent.content.size;
  const splitStart =
    $from.parent.isTextblock &&
    $from.parentOffset > 0 &&
    $from.parentOffset < $from.parent.content.size;

  // A heading is a block node. Splitting the selected boundaries first prevents
  // a few highlighted words from turning the entire surrounding paragraph into a heading.
  if (splitEnd) editor.chain().focus().setTextSelection(to).splitBlock().run();
  if (splitStart) {
    editor.chain().focus().setTextSelection(from).splitBlock().run();
    // A ProseMirror block split inserts both a closing and an opening boundary.
    from += 2;
    to += 2;
  }
  return editor.chain().focus().setTextSelection({ from, to }).toggleHeading({ level }).run();
}

export type RichTextEditorProps = {
  value: TiptapDocument;
  onChange: (value: TiptapDocument) => void;
  imageAlt: string;
  variant?: "workshop" | "product";
  disabled?: boolean;
  readOnly?: boolean;
  ariaLabel?: string;
};

export function RichTextEditor({
  value,
  onChange,
  imageAlt,
  variant = "workshop",
  disabled = false,
  readOnly = false,
  ariaLabel,
}: RichTextEditorProps) {
  const { t } = useAdminI18n();
  const showToast = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const linkSelection = useRef<EditorSelection | null>(null);
  const [linkEditorOpen, setLinkEditorOpen] = useState(false);
  const [linkValue, setLinkValue] = useState("");
  const [linkError, setLinkError] = useState("");
  const editor = useEditor({
    immediatelyRender: false,
    editable: !disabled && !readOnly,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3, 4] },
        blockquote: variant === "product" ? false : {},
        code: false,
        codeBlock: false,
        horizontalRule: false,
        strike: false,
      }),
      Link.configure({
        openOnClick: readOnly,
        autolink: false,
        linkOnPaste: false,
        protocols: ["https", "mailto"],
      }),
      ...(variant === "product" ? [] : [Image]),
    ],
    content: value,
    onUpdate: ({ editor: current }) => {
      if (!disabled && !readOnly) onChange(current.getJSON());
    },
    editorProps: {
      attributes: { class: "tiptap", "aria-label": ariaLabel ?? t.richText.ariaLabel },
    },
  });
  useEffect(() => {
    if (editor && JSON.stringify(editor.getJSON()) !== JSON.stringify(value))
      editor.commands.setContent(value, false);
  }, [editor, value]);
  useEffect(() => {
    editor?.setEditable(!disabled && !readOnly, false);
  }, [editor, disabled, readOnly]);
  if (!editor)
    return (
      <Group gap="sm" role="status">
        <Loader size="sm" />
        <Text size="sm" c="dimmed">
          {t.richText.loading}
        </Text>
      </Group>
    );
  if (readOnly)
    return (
      <EditorContent
        className={variant === "product" ? "store-product-description-preview" : undefined}
        editor={editor}
      />
    );
  const activeEditor = editor;
  async function uploadInline(file?: File) {
    if (!file) return;
    try {
      const form = new FormData();
      form.append("image", file);
      const asset = await api<MediaAsset>("admin/media", { method: "POST", body: form });
      activeEditor
        .chain()
        .focus()
        .setImage({ src: asset.url, alt: imageAlt.trim() || t.richText.defaultImageAlt })
        .run();
    } catch (caught) {
      const message = requestErrorMessage(caught, t, { image: t.richText.image });
      showToast(
        message === t.common.requestFailed ? t.richText.imageUploadFailed : message,
        "error",
      );
    }
  }
  function openLinkEditor() {
    const previous = activeEditor.getAttributes("link").href as string | undefined;
    const { from, to, empty } = activeEditor.state.selection;
    linkSelection.current = { from, to };
    setLinkValue(previous || "");
    setLinkError(empty && !previous ? t.richText.selectTextForLink : "");
    setLinkEditorOpen(true);
  }
  function closeLinkEditor() {
    setLinkEditorOpen(false);
    setLinkError("");
    activeEditor.commands.focus();
  }
  function applyLink() {
    const selection = linkSelection.current;
    if (!selection) return;
    const href = normalizeLinkHref(linkValue);
    if (!href) {
      setLinkError(t.richText.invalidLink);
      return;
    }
    if (selection.from === selection.to && !activeEditor.isActive("link")) {
      setLinkError(t.richText.selectTextForLink);
      return;
    }
    setLinkForSelection(activeEditor, selection, href);
    closeLinkEditor();
  }
  function removeLink() {
    if (linkSelection.current) setLinkForSelection(activeEditor, linkSelection.current, null);
    closeLinkEditor();
  }
  const keepSelection = (event: React.MouseEvent<HTMLButtonElement>) => event.preventDefault();
  const linkPreview = normalizeLinkHref(linkValue);
  return (
    <Stack gap="sm" inert={disabled || undefined}>
      <Paper withBorder p="xs">
        <Group gap={4} role="toolbar" aria-label={t.richText.toolbar}>
          <Button
            type="button"
            size="xs"
            disabled={disabled}
            aria-pressed={editor.isActive("bold")}
            variant={editor.isActive("bold") ? "light" : "subtle"}
            onMouseDown={keepSelection}
            onClick={() => editor.chain().focus().toggleBold().run()}
          >
            B
          </Button>
          <Button
            type="button"
            size="xs"
            disabled={disabled}
            aria-pressed={editor.isActive("italic")}
            variant={editor.isActive("italic") ? "light" : "subtle"}
            onMouseDown={keepSelection}
            onClick={() => editor.chain().focus().toggleItalic().run()}
          >
            <em>I</em>
          </Button>
          {([2, 3, 4] as const).map((level) => (
            <Button
              key={level}
              type="button"
              size="xs"
              disabled={disabled}
              aria-pressed={editor.isActive("heading", { level })}
              variant={editor.isActive("heading", { level }) ? "light" : "subtle"}
              onMouseDown={keepSelection}
              onClick={() => toggleHeadingForSelection(editor, level)}
            >
              H{level}
            </Button>
          ))}
          <Button
            type="button"
            size="xs"
            disabled={disabled}
            aria-pressed={editor.isActive("bulletList")}
            variant={editor.isActive("bulletList") ? "light" : "subtle"}
            onMouseDown={keepSelection}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
          >
            • {t.richText.bulletList}
          </Button>
          <Button
            type="button"
            size="xs"
            disabled={disabled}
            aria-pressed={editor.isActive("orderedList")}
            variant={editor.isActive("orderedList") ? "light" : "subtle"}
            onMouseDown={keepSelection}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
          >
            1. {t.richText.orderedList}
          </Button>
          <Button
            type="button"
            size="xs"
            disabled={disabled}
            aria-pressed={editor.isActive("link")}
            variant={editor.isActive("link") ? "light" : "subtle"}
            onMouseDown={keepSelection}
            onClick={openLinkEditor}
          >
            {t.richText.link}
          </Button>
          {variant !== "product" && (
            <Button
              type="button"
              size="xs"
              disabled={disabled}
              variant="subtle"
              onMouseDown={keepSelection}
              onClick={() => fileInput.current?.click()}
            >
              {t.richText.image}
            </Button>
          )}
          <Button
            type="button"
            size="xs"
            disabled={disabled}
            variant="subtle"
            aria-label={t.richText.undo}
            title={t.richText.undo}
            onMouseDown={keepSelection}
            onClick={() => editor.chain().focus().undo().run()}
          >
            ↶
          </Button>
          <Button
            type="button"
            size="xs"
            disabled={disabled}
            variant="subtle"
            aria-label={t.richText.redo}
            title={t.richText.redo}
            onMouseDown={keepSelection}
            onClick={() => editor.chain().focus().redo().run()}
          >
            ↷
          </Button>
          {variant !== "product" && (
            <input
              ref={fileInput}
              hidden
              disabled={disabled}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) => {
                void uploadInline(event.target.files?.[0]);
                event.currentTarget.value = "";
              }}
            />
          )}
        </Group>
      </Paper>
      {linkEditorOpen && (
        <Paper withBorder p="sm" role="group" aria-label={t.richText.linkEditor}>
          <Stack gap="sm">
            <TextInput
              id="workshop-editor-link"
              label={t.richText.linkUrl}
              type="text"
              inputMode="url"
              autoFocus
              disabled={disabled}
              placeholder={t.richText.linkPlaceholder}
              value={linkValue}
              error={Boolean(linkError)}
              onChange={(event) => {
                setLinkValue(event.currentTarget.value);
                setLinkError("");
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  applyLink();
                }
                if (event.key === "Escape") closeLinkEditor();
              }}
            />
            {linkError && (
              <Alert color="red" role="alert">
                {linkError}
              </Alert>
            )}
            <Group gap="sm">
              <Button type="button" disabled={disabled} onClick={applyLink}>
                {t.richText.applyLink}
              </Button>
              {linkPreview && (
                <Button
                  component="a"
                  variant="default"
                  href={linkPreview}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t.richText.openLink}
                </Button>
              )}
              {editor.isActive("link") && (
                <Button type="button" disabled={disabled} variant="default" onClick={removeLink}>
                  {t.richText.removeLink}
                </Button>
              )}
              <Button type="button" disabled={disabled} variant="default" onClick={closeLinkEditor}>
                {t.richText.cancelLink}
              </Button>
            </Group>
            <Text size="xs" c="dimmed">
              {t.richText.linkHelp}
            </Text>
          </Stack>
        </Paper>
      )}
      <EditorContent editor={editor} />
    </Stack>
  );
}
