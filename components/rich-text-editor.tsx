"use client";

import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useRef, useState } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { useToast } from "@/components/toast-provider";
import { api } from "@/lib/client-api";
import { requestErrorMessage } from "@/lib/client-error";
import type { MediaAsset, TiptapDocument } from "@/lib/types";

type HeadingLevel = 2 | 3 | 4;
type EditorSelection = { from: number; to: number };

export function normalizeLinkHref(value: string) {
  const input = value.trim();
  if (!input) return null;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input)) return `mailto:${input}`;
  let candidate = /^[a-z][a-z\d+.-]*:/i.test(input) ? input : `https://${input}`;
  try {
    let url = new URL(candidate);
    const isLoopback = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
    if (url.protocol === "http:" && !isLoopback) {
      candidate = candidate.replace(/^http:\/\//i, "https://");
      url = new URL(candidate);
    }
    if (url.protocol === "http:" && isLoopback) return url.toString();
    if (url.protocol === "https:" && url.hostname) return url.toString();
    if (url.protocol === "mailto:" && url.pathname.includes("@")) return candidate;
  } catch {
    return null;
  }
  return null;
}

export function normalizeTiptapLinks(document: TiptapDocument): TiptapDocument {
  function visit(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map(visit).filter((item): item is Exclude<typeof item, null> => item !== null);
    }
    if (!value || typeof value !== "object") return value;

    const node = value as Record<string, unknown>;
    if (node.type === "link") {
      const attrs =
        node.attrs && typeof node.attrs === "object" ? (node.attrs as Record<string, unknown>) : {};
      const href = normalizeLinkHref(String(attrs.href || ""));
      if (!href) return null;
      return { ...node, attrs: { ...attrs, href } };
    }
    return Object.fromEntries(Object.entries(node).map(([key, item]) => [key, visit(item)]));
  }

  return visit(document) as TiptapDocument;
}

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

export function RichTextEditor({
  value,
  onChange,
  imageAlt,
}: {
  value: TiptapDocument;
  onChange: (value: TiptapDocument) => void;
  imageAlt: string;
}) {
  const { t } = useAdminI18n();
  const showToast = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const linkSelection = useRef<EditorSelection | null>(null);
  const [linkEditorOpen, setLinkEditorOpen] = useState(false);
  const [linkValue, setLinkValue] = useState("");
  const [linkError, setLinkError] = useState("");
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3, 4] },
        code: false,
        codeBlock: false,
        horizontalRule: false,
        strike: false,
      }),
      Link.configure({
        openOnClick: false,
        autolink: false,
        linkOnPaste: false,
        protocols: ["https", "mailto"],
      }),
      Image,
    ],
    content: value,
    onUpdate: ({ editor: current }) => onChange(current.getJSON()),
    editorProps: { attributes: { class: "tiptap", "aria-label": t.richText.ariaLabel } },
  });
  useEffect(() => {
    if (editor && JSON.stringify(editor.getJSON()) !== JSON.stringify(value))
      editor.commands.setContent(value);
  }, [editor, value]);
  if (!editor) return <div className="tiptap">{t.richText.loading}</div>;
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
    <div>
      <div className="editor-toolbar" role="toolbar" aria-label={t.richText.toolbar}>
        <button
          type="button"
          className={editor.isActive("bold") ? "active" : ""}
          onMouseDown={keepSelection}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          B
        </button>
        <button
          type="button"
          className={editor.isActive("italic") ? "active" : ""}
          onMouseDown={keepSelection}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <em>I</em>
        </button>
        <button
          type="button"
          className={editor.isActive("heading", { level: 2 }) ? "active" : ""}
          onMouseDown={keepSelection}
          onClick={() => toggleHeadingForSelection(editor, 2)}
        >
          H2
        </button>
        <button
          type="button"
          className={editor.isActive("heading", { level: 3 }) ? "active" : ""}
          onMouseDown={keepSelection}
          onClick={() => toggleHeadingForSelection(editor, 3)}
        >
          H3
        </button>
        <button
          type="button"
          className={editor.isActive("heading", { level: 4 }) ? "active" : ""}
          onMouseDown={keepSelection}
          onClick={() => toggleHeadingForSelection(editor, 4)}
        >
          H4
        </button>
        <button
          type="button"
          className={editor.isActive("bulletList") ? "active" : ""}
          onMouseDown={keepSelection}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          • {t.richText.bulletList}
        </button>
        <button
          type="button"
          className={editor.isActive("orderedList") ? "active" : ""}
          onMouseDown={keepSelection}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          1. {t.richText.orderedList}
        </button>
        <button
          type="button"
          className={editor.isActive("link") ? "active" : ""}
          onMouseDown={keepSelection}
          onClick={openLinkEditor}
        >
          {t.richText.link}
        </button>
        <button
          type="button"
          onMouseDown={keepSelection}
          onClick={() => fileInput.current?.click()}
        >
          {t.richText.image}
        </button>
        <button
          type="button"
          aria-label={t.richText.undo}
          title={t.richText.undo}
          onMouseDown={keepSelection}
          onClick={() => editor.chain().focus().undo().run()}
        >
          ↶
        </button>
        <button
          type="button"
          aria-label={t.richText.redo}
          title={t.richText.redo}
          onMouseDown={keepSelection}
          onClick={() => editor.chain().focus().redo().run()}
        >
          ↷
        </button>
        <input
          ref={fileInput}
          hidden
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(e) => {
            void uploadInline(e.target.files?.[0]);
            e.currentTarget.value = "";
          }}
        />
      </div>
      {linkEditorOpen && (
        <div className="editor-link-panel" role="group" aria-label={t.richText.linkEditor}>
          <label htmlFor="workshop-editor-link">{t.richText.linkUrl}</label>
          <div className="editor-link-controls">
            <input
              id="workshop-editor-link"
              className="input"
              type="text"
              inputMode="url"
              autoFocus
              placeholder={t.richText.linkPlaceholder}
              value={linkValue}
              onChange={(event) => {
                setLinkValue(event.target.value);
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
            <button type="button" className="button" onClick={applyLink}>
              {t.richText.applyLink}
            </button>
            {linkPreview && (
              <a className="button secondary" href={linkPreview} target="_blank" rel="noreferrer">
                {t.richText.openLink}
              </a>
            )}
            {editor.isActive("link") && (
              <button type="button" className="button secondary" onClick={removeLink}>
                {t.richText.removeLink}
              </button>
            )}
            <button type="button" className="button secondary" onClick={closeLinkEditor}>
              {t.richText.cancelLink}
            </button>
          </div>
          {linkError && <p className="field-error">{linkError}</p>}
          <small>{t.richText.linkHelp}</small>
        </div>
      )}
      <EditorContent editor={editor} />
    </div>
  );
}
