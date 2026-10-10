"use client";
/**
 * CodeMirror 6 editor for theme files. Loaded via next/dynamic (ssr:false) – keep imports of this file
 * out of other bundles.
 */
import { useEffect, useMemo, useRef } from "react";
import CodeMirror, { Decoration, EditorView, type Extension } from "@uiw/react-codemirror";
import { liquid } from "@codemirror/lang-liquid";
import { css } from "@codemirror/lang-css";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { fileKind, type FileKind } from "../../lib/package";
import { liquidCompletions } from "./liquid-completions";

export function languageFor(kind: FileKind): Extension {
  switch (kind) {
    case "liquid":
      return liquid(liquidCompletions);
    case "css":
      return css();
    case "js":
      return javascript();
    default:
      return json();
  }
}

export const editorTheme = EditorView.theme({
  "&": { height: "100%", fontSize: "13px" },
  ".cm-scroller": { fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" },
  ".cm-vm-error": { backgroundColor: "rgba(220, 38, 38, 0.08)", boxShadow: "inset 3px 0 0 #dc2626" },
});

export default function CodeEditor({
  path,
  value,
  onChange,
  jump,
  errorLines,
  readOnly,
  ariaLabel,
}: {
  path: string;
  value: string;
  onChange: (v: string) => void;
  jump?: { line: number; nonce: number } | null;
  errorLines?: number[];
  readOnly?: boolean;
  ariaLabel: string;
}) {
  const viewRef = useRef<EditorView | null>(null);

  const lines = (errorLines ?? []).join(",");
  const extensions = useMemo(() => {
    const errs = lines ? lines.split(",").map(Number) : [];
    return [
      languageFor(fileKind(path)),
      editorTheme,
      EditorView.lineWrapping,
      EditorView.contentAttributes.of({ "aria-label": ariaLabel }),
      EditorView.decorations.of((view) => {
        const doc = view.state.doc;
        const ranges = [...new Set(errs)]
          .filter((l) => l >= 1 && l <= doc.lines)
          .sort((a, b) => a - b)
          .map((l) => Decoration.line({ attributes: { class: "cm-vm-error" } }).range(doc.line(l).from));
        return Decoration.set(ranges);
      }),
    ];
  }, [path, lines, ariaLabel]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || !jump) return;
    const n = Math.min(Math.max(1, jump.line), view.state.doc.lines);
    const line = view.state.doc.line(n);
    view.dispatch({ selection: { anchor: line.from, head: line.to }, effects: EditorView.scrollIntoView(line.from, { y: "center" }) });
    view.focus();
  }, [jump]);

  return (
    <CodeMirror
      value={value}
      onChange={onChange}
      extensions={extensions}
      readOnly={readOnly}
      height="100%"
      className="h-full"
      basicSetup={{ foldGutter: true, highlightActiveLine: true, autocompletion: true, bracketMatching: true, closeBrackets: true }}
      onCreateEditor={(view) => {
        viewRef.current = view;
      }}
    />
  );
}
