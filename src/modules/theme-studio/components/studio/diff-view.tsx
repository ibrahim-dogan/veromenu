"use client";
/** Read-only unified diff (original → proposed) for the AI review. Loaded via next/dynamic (ssr:false). */
import { useMemo } from "react";
import CodeMirror, { EditorState, EditorView } from "@uiw/react-codemirror";
import { unifiedMergeView } from "@codemirror/merge";
import { fileKind } from "../../lib/package";
import { editorTheme, languageFor } from "./code-editor";

export default function DiffView({ path, original, modified }: { path: string; original: string; modified: string }) {
  const extensions = useMemo(
    () => [
      languageFor(fileKind(path)),
      editorTheme,
      EditorView.lineWrapping,
      EditorView.editable.of(false),
      EditorState.readOnly.of(true),
      unifiedMergeView({ original, mergeControls: false, highlightChanges: true, gutter: true, syntaxHighlightDeletions: true, collapseUnchanged: { margin: 3, minSize: 6 } }),
    ],
    [path, original],
  );
  return <CodeMirror value={modified} extensions={extensions} basicSetup={{ foldGutter: false, highlightActiveLine: false }} editable={false} className="text-[13px]" />;
}
