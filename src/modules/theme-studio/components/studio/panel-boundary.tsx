"use client";
import { Component, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, RotateCcw } from "lucide-react";

/**
 * Local error boundary for studio panes (side panel, preview): a render error in one pane must not take down the
 * whole studio (and the unsaved working copy) via the route error boundary. Resets when `resetKey` changes, e.g.
 * after the owner fixed the manifest.
 */
export class PanelBoundary extends Component<{ children: ReactNode; resetKey?: unknown }, { error: Error | null; key: unknown }> {
  state: { error: Error | null; key: unknown } = { error: null, key: this.props.resetKey };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  static getDerivedStateFromProps(props: { resetKey?: unknown }, state: { error: Error | null; key: unknown }) {
    if (props.resetKey !== state.key) return { error: null, key: props.resetKey };
    return null;
  }

  componentDidCatch(error: Error) {
    console.error("[theme-studio] pane crashed", error);
  }

  render() {
    if (this.state.error) return <PanelError message={this.state.error.message} onRetry={() => this.setState({ error: null })} />;
    return this.props.children;
  }
}

function PanelError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const t = useTranslations("themeStudio.studio");
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center" role="alert">
      <AlertTriangle size={22} className="text-amber-600" aria-hidden />
      <p className="text-sm font-medium text-stone-800">{t("paneError")}</p>
      <p className="max-w-xs text-xs break-words text-stone-500">{message.slice(0, 200)}</p>
      <button type="button" onClick={onRetry} className="focus-ring inline-flex items-center gap-1.5 rounded-md border border-stone-300 px-2.5 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-50">
        <RotateCcw size={13} aria-hidden /> {t("paneRetry")}
      </button>
    </div>
  );
}
