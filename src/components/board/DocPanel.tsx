"use client";

import { useEffect, useRef, useState } from "react";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Document from "@tiptap/extension-document";
import Collaboration from "@tiptap/extension-collaboration";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import type * as Y from "yjs";
import {
  Bold, Italic, Strikethrough, Underline, Heading1, Heading2, Heading3, List, ListOrdered, ListChecks, Quote, Code, Link2, ImagePlus,
  Undo2, Redo2, Minus, X, Maximize2, Minimize2, Crosshair,
} from "lucide-react";
import { docFragment, type DocElement } from "@/lib/board/types";

/**
 * Side panel editor for a board document. The content lives in a Yjs fragment of the board's own
 * Y.Doc, so it syncs live between everyone on the board and is saved (and versioned) with it.
 */
export function DocPanel({ doc, el, canEdit, onUpdate, onClose, onLocate, uploadImage }: {
  doc: Y.Doc;
  el: DocElement;
  canEdit: boolean;
  /** Keeps the card on the board in step: title and a plain-text preview. */
  onUpdate: (patch: { title: string; text: string }) => void;
  onClose: () => void;
  onLocate: () => void;
  uploadImage: (f: File) => Promise<string>;
}) {
  const [wide, setWide] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const last = useRef({ title: el.title, text: el.text ?? "" });

  const editor = useEditor({
    immediatelyRender: false,
    editable: canEdit,
    extensions: [
      // Every document starts with its title heading.
      Document.extend({ content: "heading block*" }),
      StarterKit.configure({ document: false, undoRedo: false, trailingNode: { node: "paragraph" }, link: { openOnClick: false, autolink: true } }),
      Collaboration.configure({ fragment: doc.getXmlFragment(docFragment(el.id)) }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Image.configure({ allowBase64: false }),
      Placeholder.configure({ placeholder: ({ node }) => (node.type.name === "heading" ? "Title" : "Write something, or type # for a heading, - for a list, [] for a checklist") }),
    ],
    editorProps: { attributes: { class: "doc-editor focus:outline-none" } },
    onUpdate: ({ editor }) => {
      if (!canEdit) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        const p = preview(editor);
        if (p.title !== last.current.title || p.text !== last.current.text) { last.current = p; onUpdate(p); }
      }, 500);
    },
  }, [el.id, doc]);

  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);
  useEffect(() => { editor?.setEditable(canEdit); }, [editor, canEdit]);
  // Put the cursor in the title of a new document.
  useEffect(() => {
    if (editor && canEdit && !el.text) setTimeout(() => editor.commands.focus("start"), 50);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !editor?.isFocused) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editor, onClose]);

  const addImage = async (f: File) => {
    if (!editor) return;
    try {
      const url = await uploadImage(f);
      editor.chain().focus().setImage({ src: url, alt: f.name }).run();
    } catch { /* upload errors are shown by the board */ }
  };

  return (
    <aside className={`absolute bottom-3 right-3 top-16 z-30 flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl transition-[width] ${wide ? "w-[min(960px,calc(100vw-24px))]" : "w-[min(620px,calc(100vw-24px))]"}`}
      onPointerDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}
      onDragOver={(e) => { e.stopPropagation(); }} onDrop={(e) => {
        const f = Array.from(e.dataTransfer.files).find((x) => x.type.startsWith("image/"));
        e.stopPropagation();
        if (f && canEdit) { e.preventDefault(); addImage(f); }
      }}>
      <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2">
        <span className="truncate text-sm font-medium text-slate-700">{el.title || "Untitled document"}</span>
        {!canEdit && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">View only</span>}
        <div className="ml-auto flex items-center gap-0.5">
          <button className="btn-ghost p-1.5" title="Show on the board" onClick={onLocate}><Crosshair size={16} /></button>
          <button className="btn-ghost p-1.5" title={wide ? "Narrower" : "Wider"} onClick={() => setWide((w) => !w)}>{wide ? <Minimize2 size={16} /> : <Maximize2 size={16} />}</button>
          <button className="btn-ghost p-1.5" title="Close (Esc)" onClick={onClose}><X size={16} /></button>
        </div>
      </div>
      {canEdit && editor && <DocToolbar editor={editor} onImage={() => fileRef.current?.click()} />}
      <div className="flex-1 overflow-y-auto px-10 py-8" onClick={() => editor?.commands.focus()}>
        <div className="mx-auto max-w-[720px]"><EditorContent editor={editor} /></div>
      </div>
      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden
        onChange={(e) => { const f = e.target.files?.[0]; if (f) addImage(f); e.target.value = ""; }} />
    </aside>
  );
}

function preview(editor: Editor) {
  const json = editor.getJSON();
  const first = json.content?.[0];
  const textOf = (n: { text?: string; content?: unknown[] }): string =>
    n.text ?? (n.content ?? []).map((c) => textOf(c as { text?: string; content?: unknown[] })).join("");
  const title = first?.type === "heading" ? textOf(first).trim() : "";
  const rest = (json.content ?? []).slice(title ? 1 : 0).map((n) => {
    const t = textOf(n).trim();
    if (!t) return "";
    if (n.type === "bulletList" || n.type === "orderedList" || n.type === "taskList") {
      return (n.content ?? []).map((li, i) => {
        const item = li as { content?: unknown[]; attrs?: { checked?: boolean } };
        const mark = n.type === "taskList" ? (item.attrs?.checked ? "☑" : "☐") : n.type === "orderedList" ? `${i + 1}.` : "•";
        return `${mark} ${textOf(item).trim()}`;
      }).join("\n");
    }
    return t;
  }).filter(Boolean).join("\n");
  return { title: title.slice(0, 120) || "Untitled document", text: rest.slice(0, 600) };
}

function DocToolbar({ editor, onImage }: { editor: Editor; onImage: () => void }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"), italic: e.isActive("italic"), strike: e.isActive("strike"), underline: e.isActive("underline"),
      h1: e.isActive("heading", { level: 1 }), h2: e.isActive("heading", { level: 2 }), h3: e.isActive("heading", { level: 3 }),
      bullet: e.isActive("bulletList"), ordered: e.isActive("orderedList"), task: e.isActive("taskList"),
      quote: e.isActive("blockquote"), code: e.isActive("codeBlock"), link: e.isActive("link"),
    }),
  });
  const b = (active: boolean, title: string, onClick: () => void, Icon: typeof Bold) => (
    <button key={title} title={title} onMouseDown={(e) => e.preventDefault()} onClick={onClick}
      className={`rounded-md p-1.5 ${active ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100"}`}><Icon size={16} /></button>
  );
  const c = () => editor.chain().focus();
  const sep = (k: string) => <span key={k} className="mx-1 h-5 w-px bg-slate-200" />;
  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-slate-100 px-2 py-1.5">
      {b(false, "Undo (Ctrl+Z)", () => c().undo().run(), Undo2)}
      {b(false, "Redo (Ctrl+Shift+Z)", () => c().redo().run(), Redo2)}
      {sep("s1")}
      {b(s.h1, "Heading 1", () => c().toggleHeading({ level: 1 }).run(), Heading1)}
      {b(s.h2, "Heading 2", () => c().toggleHeading({ level: 2 }).run(), Heading2)}
      {b(s.h3, "Heading 3", () => c().toggleHeading({ level: 3 }).run(), Heading3)}
      {sep("s2")}
      {b(s.bold, "Bold (Ctrl+B)", () => c().toggleBold().run(), Bold)}
      {b(s.italic, "Italic (Ctrl+I)", () => c().toggleItalic().run(), Italic)}
      {b(s.underline, "Underline (Ctrl+U)", () => c().toggleUnderline().run(), Underline)}
      {b(s.strike, "Strikethrough", () => c().toggleStrike().run(), Strikethrough)}
      {b(s.link, "Link", () => {
        if (editor.isActive("link")) { c().unsetLink().run(); return; }
        const url = window.prompt("Link address");
        if (url) c().extendMarkRange("link").setLink({ href: /^https?:\/\//i.test(url) ? url : `https://${url}` }).run();
      }, Link2)}
      {sep("s3")}
      {b(s.bullet, "Bulleted list", () => c().toggleBulletList().run(), List)}
      {b(s.ordered, "Numbered list", () => c().toggleOrderedList().run(), ListOrdered)}
      {b(s.task, "Checklist", () => c().toggleTaskList().run(), ListChecks)}
      {b(s.quote, "Quote", () => c().toggleBlockquote().run(), Quote)}
      {b(s.code, "Code block", () => c().toggleCodeBlock().run(), Code)}
      {b(false, "Divider", () => c().setHorizontalRule().run(), Minus)}
      {sep("s4")}
      {b(false, "Image", onImage, ImagePlus)}
    </div>
  );
}
