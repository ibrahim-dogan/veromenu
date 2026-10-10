"use client";
import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { ArrowUpCircle, Eye, Library, PackagePlus, Pencil, Search, Trash2 } from "lucide-react";
import { Badge, Button, Card, CardBody, CardHeader, DataTable, EmptyState, Field, Input, Td, Textarea, Th } from "@/components/ui";
import { Dialog } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { useAction } from "@/components/use-action";
import { adminPreviewAction, deleteLibraryThemeAction, promoteThemeAction, seedStartersAction, updateLibraryThemeAction } from "../admin-actions";
import { MiniPreview } from "./mini-preview";
import { SandboxFrame } from "./sandbox-frame";

type Lib = { id: string; name: string; description: string | null; origin: string; currentVersionId: string | null; updatedAt: string };
type Promotable = { id: string; name: string; origin: string; restaurantId: string; restaurantName: string; updatedAt: string };

export function AdminThemeLibrary({ library, promotable }: { library: Lib[]; promotable: Promotable[] }) {
  const t = useTranslations("themeStudio.admin");
  const f = useFormatter();
  const [edit, setEdit] = useState<{ mode: "edit"; theme: Lib } | { mode: "promote"; theme: Promotable } | null>(null);
  const [del, setDel] = useState<Lib | null>(null);
  const [preview, setPreview] = useState<{ name: string; html: string } | null>(null);
  const [q, setQ] = useState("");
  const seed = useAction(seedStartersAction, { onSuccess: (d) => toast.success(t("seeded", { count: d.added })) });
  const remove = useAction(deleteLibraryThemeAction, { success: t("deleted"), onSuccess: () => setDel(null) });
  const prev = useAction(adminPreviewAction, { refresh: false });
  const filtered = promotable.filter((p) => !q || `${p.name} ${p.restaurantName}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title={t("libraryTitle", { count: library.length })}
          description={t("libraryHint")}
          actions={
            <Button variant="secondary" size="sm" loading={seed.pending} onClick={() => seed.run({})}>
              <PackagePlus size={14} aria-hidden /> {t("seed")}
            </Button>
          }
        />
        <CardBody>
          {library.length === 0 ? (
            <EmptyState icon={<Library size={28} />} title={t("empty")} description={t("emptyHint")} />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {library.map((l) => (
                <article key={l.id} className="flex flex-col overflow-hidden rounded-xl border border-stone-200">
                  <MiniPreview cacheKey={`admin:${l.id}:${l.currentVersionId}`} load={() => adminPreviewAction({ themeId: l.id })} title={l.name} height={640} />
                  <div className="flex flex-1 flex-col gap-2 border-t border-stone-100 p-3">
                    <div className="flex items-center gap-2">
                      <h3 className="mr-auto font-semibold text-stone-900">{l.name}</h3>
                      <Badge tone={l.origin === "starter" ? "blue" : "purple"}>{t(l.origin === "starter" ? "originStarter" : "originPromoted")}</Badge>
                    </div>
                    {l.description && <p className="line-clamp-2 text-xs text-stone-500">{l.description}</p>}
                    <p className="text-[11px] text-stone-400">{f.dateTime(new Date(l.updatedAt), { dateStyle: "medium" })}</p>
                    <div className="mt-auto flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={async () => {
                          const r = await prev.run({ themeId: l.id });
                          if (r.ok) setPreview({ name: l.name, html: r.data.html });
                        }}
                      >
                        <Eye size={13} aria-hidden /> {t("preview")}
                      </Button>
                      <Button variant="ghost" size="icon" aria-label={t("edit")} title={t("edit")} onClick={() => setEdit({ mode: "edit", theme: l })}>
                        <Pencil size={14} />
                      </Button>
                      <Button variant="ghost" size="icon" aria-label={t("delete")} title={t("delete")} className="text-red-600 hover:bg-red-50" onClick={() => setDel(l)}>
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={t("promoteTitle")} description={t("promoteHint")} />
        <CardBody className="space-y-3">
          <div className="relative max-w-sm">
            <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-stone-400" aria-hidden />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("search")} aria-label={t("search")} className="pl-9" />
          </div>
          {filtered.length === 0 ? (
            <p className="py-6 text-center text-sm text-stone-500">{t("noRestaurantThemes")}</p>
          ) : (
            <div className="overflow-x-auto">
              <DataTable>
                <thead>
                  <tr>
                    <Th>{t("colTheme")}</Th>
                    <Th>{t("colRestaurant")}</Th>
                    <Th>{t("colUpdated")}</Th>
                    <Th className="text-right">
                      <span className="sr-only">{t("actions")}</span>
                    </Th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p) => (
                    <tr key={p.id}>
                      <Td className="font-medium text-stone-900">{p.name}</Td>
                      <Td>{p.restaurantName}</Td>
                      <Td className="whitespace-nowrap text-stone-500">{f.dateTime(new Date(p.updatedAt), { dateStyle: "medium" })}</Td>
                      <Td className="text-right">
                        <Button size="sm" variant="secondary" onClick={() => setEdit({ mode: "promote", theme: p })}>
                          <ArrowUpCircle size={14} aria-hidden /> {t("promote")}
                        </Button>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            </div>
          )}
        </CardBody>
      </Card>

      <MetaDialog state={edit} onClose={() => setEdit(null)} />
      <Dialog
        open={!!del}
        onClose={() => setDel(null)}
        size="sm"
        title={t("deleteTitle", { name: del?.name ?? "" })}
        description={t("deleteHint")}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDel(null)}>
              {t("cancel")}
            </Button>
            <Button variant="danger" loading={remove.pending} onClick={() => del && remove.run({ themeId: del.id })}>
              {t("delete")}
            </Button>
          </>
        }
      />
      <Dialog open={!!preview} onClose={() => setPreview(null)} size="lg" title={preview?.name}>
        {preview && (
          <div className="mx-auto h-[70vh] max-w-[420px] overflow-hidden rounded-2xl border border-stone-200">
            <SandboxFrame html={preview.html} title={preview.name} className="h-full w-full" />
          </div>
        )}
      </Dialog>
    </div>
  );
}

function MetaDialog({ state, onClose }: { state: { mode: "edit"; theme: Lib } | { mode: "promote"; theme: Promotable } | null; onClose: () => void }) {
  const t = useTranslations("themeStudio.admin");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [lastId, setLastId] = useState<string | null>(null);
  const id = state ? `${state.mode}:${state.theme.id}` : null;
  if (id !== lastId) {
    setLastId(id);
    setName(state?.theme.name ?? "");
    setDescription(state?.mode === "edit" ? (state.theme.description ?? "") : "");
  }
  const update = useAction(updateLibraryThemeAction, { success: t("saved"), onSuccess: onClose });
  const promote = useAction(promoteThemeAction, { success: t("promoted"), onSuccess: onClose });
  const pending = update.pending || promote.pending;
  const submit = () => {
    if (!state || !name.trim()) return;
    const data = { name: name.trim(), description: description.trim() || null };
    if (state.mode === "edit") update.run({ themeId: state.theme.id, ...data });
    else promote.run({ sourceThemeId: state.theme.id, ...data });
  };
  return (
    <Dialog
      open={!!state}
      onClose={onClose}
      title={state?.mode === "promote" ? t("promoteDialogTitle") : t("editDialogTitle")}
      description={state?.mode === "promote" ? t("promoteDialogHint", { restaurant: state.theme.restaurantName }) : undefined}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button loading={pending} disabled={!name.trim()} onClick={submit}>
            {state?.mode === "promote" ? t("promote") : t("save")}
          </Button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Field label={t("name")} htmlFor="lib-name">
          <Input id="lib-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
        </Field>
        <Field label={t("descriptionLabel")} htmlFor="lib-desc">
          <Textarea id="lib-desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} rows={3} />
        </Field>
      </form>
    </Dialog>
  );
}
