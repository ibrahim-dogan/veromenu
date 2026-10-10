"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Code2, ExternalLink, Library, Lock, Palette, Plus, Sparkles, SlidersHorizontal, Wand2 } from "lucide-react";
import { Link } from "@/core/i18n/navigation";
import { Badge, Button, buttonClass, Card, EmptyState } from "@/components/ui";
import { Tabs } from "@/components/ui/tabs";
import type { ThemeConfig, ThemeManifest as BuiltinManifest } from "@/themes/types";
import { DesignEditor } from "@/modules/design/components/design-editor";
import type { ThemeCardData } from "../lib/client";
import { LibraryThemeCard, OwnThemeCard, StatusBadges } from "./theme-cards";
import { NewTheme } from "./new-theme";

export type HubTab = "mine" | "new" | "library" | "builtin";

type Props = {
  restaurantId: string;
  slug: string;
  studioEnabled: boolean;
  engineReady: boolean;
  canUseAi: boolean;
  initialTab: HubTab;
  active: { kind: "builtin" | "studio"; name: string; theme: ThemeCardData | null };
  own: ThemeCardData[];
  library: ThemeCardData[];
  starters: { key: string; name: string; description: string | null }[];
  builtin: { manifests: BuiltinManifest[]; activeId: string | null; config: ThemeConfig };
};

export function DesignHub(p: Props) {
  const t = useTranslations("themeStudio.hub");
  const [tab, setTabState] = useState<HubTab>(p.initialTab);
  const setTab = (v: HubTab) => {
    setTabState(v);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", v);
      window.history.replaceState(window.history.state, "", url);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="space-y-6">
      <ActiveDesign {...p} onBuiltin={() => setTab("builtin")} />

      <Tabs<HubTab>
        value={tab}
        onChange={setTab}
        items={[
          { value: "mine", label: t("tabMine"), badge: p.own.length ? <Badge>{p.own.length}</Badge> : undefined },
          { value: "new", label: t("tabNew") },
          { value: "library", label: t("tabLibrary") },
          { value: "builtin", label: t("tabBuiltin") },
        ]}
      />

      {tab === "builtin" ? (
        <DesignEditor restaurantId={p.restaurantId} slug={p.slug} manifests={p.builtin.manifests} savedThemeId={p.builtin.activeId} savedConfig={p.builtin.config} />
      ) : !p.studioEnabled ? (
        <UpgradeCard onBuiltin={() => setTab("builtin")} />
      ) : !p.engineReady ? (
        <EmptyState icon={<Wand2 size={28} />} title={t("engineUnavailable")} description={t("engineUnavailableHint")} />
      ) : tab === "mine" ? (
        p.own.length === 0 ? (
          <EmptyState
            icon={<Palette size={28} />}
            title={t("emptyMine")}
            description={t("emptyMineHint")}
            action={
              <Button onClick={() => setTab("new")}>
                <Plus size={16} aria-hidden /> {t("newTheme")}
              </Button>
            }
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {p.own.map((th) => (
              <OwnThemeCard key={th.id} restaurantId={p.restaurantId} theme={th} />
            ))}
          </div>
        )
      ) : tab === "new" ? (
        <NewTheme restaurantId={p.restaurantId} canUseAi={p.canUseAi} onTemplates={() => setTab("library")} />
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-stone-500">{t("libraryHint")}</p>
          {p.library.length === 0 && p.starters.length === 0 ? (
            <EmptyState icon={<Library size={28} />} title={t("emptyLibrary")} />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
              {p.library.map((th) => (
                <LibraryThemeCard key={th.id} restaurantId={p.restaurantId} theme={th} />
              ))}
              {p.library.length === 0 &&
                p.starters.map((s) => <LibraryThemeCard key={s.key} restaurantId={p.restaurantId} theme={{ name: s.name, description: s.description }} starterKey={s.key} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ActiveDesign({ restaurantId, slug, active, studioEnabled, onBuiltin }: Props & { onBuiltin: () => void }) {
  const t = useTranslations("themeStudio.hub");
  const studio = active.theme ? `/dashboard/${restaurantId}/design/studio/${active.theme.id}` : null;
  return (
    <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700">{active.kind === "studio" ? <Code2 size={22} aria-hidden /> : <Palette size={22} aria-hidden />}</span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold tracking-wide text-stone-500 uppercase">{t("activeTitle")}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-2">
          <p className="truncate text-lg font-semibold text-stone-900">{active.name}</p>
          <Badge tone={active.kind === "studio" ? "purple" : "blue"}>{active.kind === "studio" ? t("kindStudio") : t("kindBuiltin")}</Badge>
          {active.theme && <StatusBadges theme={{ ...active.theme, isActive: false }} />}
        </div>
        <p className="mt-0.5 text-sm text-stone-500">{t("activeHint")}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <a href={`/m/${slug}`} target="_blank" rel="noopener" className={buttonClass("secondary", "sm")}>
          <ExternalLink size={14} aria-hidden /> {t("guestView")}
        </a>
        {studio && studioEnabled ? (
          <Link href={`${studio}?panel=customize`} className={buttonClass("primary", "sm")}>
            <SlidersHorizontal size={14} aria-hidden /> {t("customize")}
          </Link>
        ) : (
          <Button size="sm" onClick={onBuiltin}>
            <SlidersHorizontal size={14} aria-hidden /> {t("customize")}
          </Button>
        )}
      </div>
    </Card>
  );
}

function UpgradeCard({ onBuiltin }: { onBuiltin: () => void }) {
  const t = useTranslations("themeStudio.upgrade");
  return (
    <Card className="overflow-hidden">
      <div className="grid gap-6 p-6 md:grid-cols-[1fr_auto] md:items-center">
        <div className="space-y-3">
          <Badge tone="purple">
            <Lock size={12} aria-hidden /> {t("badge")}
          </Badge>
          <h2 className="text-xl font-semibold text-stone-900">{t("title")}</h2>
          <p className="max-w-xl text-sm text-stone-600">{t("description")}</p>
          <ul className="grid gap-2 text-sm text-stone-700 sm:grid-cols-2">
            {(["ai", "code", "versions", "library"] as const).map((k) => (
              <li key={k} className="flex items-center gap-2">
                <Sparkles size={14} className="text-violet-600" aria-hidden /> {t(`feature_${k}`)}
              </li>
            ))}
          </ul>
          <p className="text-xs text-stone-500">{t("plans")}</p>
        </div>
        <Button variant="secondary" onClick={onBuiltin}>
          {t("useBuiltin")}
        </Button>
      </div>
    </Card>
  );
}
