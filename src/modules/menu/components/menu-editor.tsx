"use client";
import * as React from "react";
import { useTranslations } from "next-intl";
import { BookOpen, FileText, FileUp, LayoutList, Pencil, Plus, Trash2 } from "lucide-react";
import { cn } from "@/core/utils";
import { Link } from "@/core/i18n/navigation";
import { Badge, Button, buttonClass, EmptyState, Field, Input, PageHeader, Textarea } from "@/components/ui";
import { Dialog } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { useAction } from "@/components/use-action";
import { createMenuAction, deleteMenuAction, setMenuModeAction, updateMenuAction } from "../actions";
import { CategoryDialog } from "./category-dialog";
import { ItemDialog, type ItemDialogTarget } from "./item-dialog";
import { MenuBoard } from "./menu-board";
import { PdfMenuSection } from "./pdf-menu-section";
import { ConfirmDialog } from "./shared";
import type { EditorCategory, EditorContext, EditorMenu } from "./types";

type CategoryTarget = { menuId: string; categoryId: string | null };

export function MenuEditor({
  restaurantId,
  menus,
  initialMenuId,
  menuMode,
  usage,
  limits,
  ctx,
}: {
  restaurantId: string;
  menus: EditorMenu[];
  initialMenuId?: string;
  menuMode: "digital" | "pdf";
  usage: { items: number; menus: number };
  limits: { items: number; menus: number };
  ctx: EditorContext;
}) {
  const t = useTranslations("menu");
  const [activeId, setActiveId] = React.useState<string | null>(
    menus.find((m) => m.id === initialMenuId)?.id ?? menus[0]?.id ?? null,
  );
  const active = menus.find((m) => m.id === activeId) ?? menus[0] ?? null;
  const [menuDialog, setMenuDialog] = React.useState<{ mode: "create" } | { mode: "edit"; menu: EditorMenu } | null>(null);
  const [catTarget, setCatTarget] = React.useState<CategoryTarget | null>(null);
  const [itemTarget, setItemTarget] = React.useState<ItemDialogTarget | null>(null);
  const [awaitItem, setAwaitItem] = React.useState<string | null>(null);
  const [deleteMenu, setDeleteMenu] = React.useState<EditorMenu | null>(null);
  const [mode, setMode] = React.useState(menuMode);
  const [syncedMode, setSyncedMode] = React.useState(menuMode);
  if (syncedMode !== menuMode) {
    setSyncedMode(menuMode);
    setMode(menuMode);
  }

  const allCats = React.useMemo(() => menus.flatMap((m) => m.categories), [menus]);
  const findItem = (id: string) => allCats.flatMap((c) => c.items).find((i) => i.id === id) ?? null;

  // After creating an item, switch the dialog to edit mode as soon as the refreshed tree contains it.
  if (awaitItem && findItem(awaitItem)) {
    setItemTarget({ mode: "edit", itemId: awaitItem });
    setAwaitItem(null);
  }

  function selectMenu(id: string) {
    setActiveId(id);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("menu", id);
      window.history.replaceState(null, "", url);
    } catch {
      /* ignore */
    }
  }

  const modeAction = useAction(setMenuModeAction, { success: t("modeSaved") });
  const toggleActive = useAction(updateMenuAction);
  const delMenu = useAction(deleteMenuAction, { success: t("menuDeleted"), onSuccess: () => setDeleteMenu(null) });

  const itemPct = Math.min(100, Math.round((usage.items / Math.max(1, limits.items)) * 100));
  const menuLimitReached = usage.menus >= limits.menus;
  const itemLimitReached = usage.items >= limits.items;
  const { perms } = ctx;

  const editingItem = itemTarget?.mode === "edit" ? findItem(itemTarget.itemId) : null;
  const itemCategoryId = itemTarget?.mode === "create" ? itemTarget.categoryId : (editingItem?.categoryId ?? null);
  const itemMenu = itemCategoryId ? menus.find((m) => m.categories.some((c) => c.id === itemCategoryId)) : null;
  const editingCategory: EditorCategory | null = catTarget?.categoryId ? (allCats.find((c) => c.id === catTarget.categoryId) ?? null) : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <>
            {perms.ai && (
              <Link href={`/dashboard/${restaurantId}/import`} className={buttonClass("secondary")}>
                <FileUp size={16} aria-hidden /> {t("importCta")}
              </Link>
            )}
            {perms.edit && active && (
              <Button onClick={() => setCatTarget({ menuId: active.id, categoryId: null })}>
                <Plus size={16} aria-hidden /> {t("newCategory")}
              </Button>
            )}
          </>
        }
      />

      {/* usage + guest presentation */}
      <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
        <div className="rounded-xl border border-stone-200 bg-white px-4 py-3 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 text-sm">
            <span className="text-stone-600">
              {t("usageItems", { used: usage.items, limit: limits.items })}
              <span className="mx-2 text-stone-300" aria-hidden>
                |
              </span>
              {t("usageMenus", { used: usage.menus, limit: limits.menus })}
            </span>
            <span className="text-xs text-stone-500">{t("vatNote")}</span>
          </div>
          <div
            className="mt-2 h-1.5 overflow-hidden rounded-full bg-stone-100"
            role="progressbar"
            aria-valuenow={usage.items}
            aria-valuemin={0}
            aria-valuemax={limits.items}
            aria-label={t("usageItemsLabel")}
          >
            <div className={cn("h-full rounded-full", itemPct >= 90 ? "bg-amber-500" : "bg-brand-500")} style={{ width: `${itemPct}%` }} />
          </div>
          {itemLimitReached && <p className="mt-2 text-xs text-amber-800">{t("itemLimitReached")}</p>}
        </div>

        <div className="rounded-xl border border-stone-200 bg-white px-4 py-3 shadow-sm">
          <p id="mode-label" className="mb-2 text-xs font-medium tracking-wide text-stone-500 uppercase">
            {t("guestView")}
          </p>
          <div role="radiogroup" aria-labelledby="mode-label" className="inline-flex rounded-lg bg-stone-100 p-1">
            {(["digital", "pdf"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={mode === m}
                disabled={!perms.edit || modeAction.pending}
                onClick={() => {
                  if (mode === m) return;
                  setMode(m);
                  modeAction.run({ restaurantId, mode: m });
                }}
                className={cn(
                  "focus-ring inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed",
                  mode === m ? "bg-white text-stone-900 shadow-sm" : "text-stone-600 hover:text-stone-900",
                )}
              >
                {m === "digital" ? <LayoutList size={15} aria-hidden /> : <FileText size={15} aria-hidden />}
                {t(m === "digital" ? "modeDigital" : "modePdf")}
              </button>
            ))}
          </div>
        </div>
      </div>

      {menus.length === 0 ? (
        <EmptyState
          icon={<BookOpen size={32} />}
          title={t("noMenusTitle")}
          description={t("noMenusDescription")}
          action={
            perms.edit && (
              <Button onClick={() => setMenuDialog({ mode: "create" })}>
                <Plus size={16} aria-hidden /> {t("newMenu")}
              </Button>
            )
          }
        />
      ) : (
        <>
          {/* menu tabs */}
          <div className="flex items-end gap-2 border-b border-stone-200">
            <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto" role="tablist" aria-label={t("menusLabel")}>
              {menus.map((m) => {
                const sel = m.id === active?.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    role="tab"
                    aria-selected={sel}
                    onClick={() => selectMenu(m.id)}
                    className={cn(
                      "focus-ring -mb-px flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap",
                      sel ? "border-brand-600 text-brand-800" : "border-transparent text-stone-500 hover:text-stone-800",
                    )}
                  >
                    {m.name}
                    {!m.isActive && <Badge className="text-[10px]">{t("inactive")}</Badge>}
                  </button>
                );
              })}
            </div>
            {perms.edit && (
              <Button
                variant="ghost"
                size="sm"
                className="mb-1 shrink-0"
                disabled={menuLimitReached}
                title={menuLimitReached ? t("menuLimitReached") : undefined}
                onClick={() => setMenuDialog({ mode: "create" })}
              >
                <Plus size={15} aria-hidden /> <span className="hidden sm:inline">{t("newMenu")}</span>
                <span className="sr-only sm:hidden">{t("newMenu")}</span>
              </Button>
            )}
          </div>

          {active && (
            <div role="tabpanel" className="space-y-4">
              {perms.edit && (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <Switch
                    checked={active.isActive}
                    disabled={toggleActive.pending}
                    onCheckedChange={(v) => toggleActive.run({ restaurantId, menuId: active.id, isActive: v })}
                    label={<span className="text-sm text-stone-700">{active.isActive ? t("menuActive") : t("menuInactive")}</span>}
                  />
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => setMenuDialog({ mode: "edit", menu: active })}>
                      <Pencil size={14} aria-hidden /> {t("renameMenu")}
                    </Button>
                    <Button variant="ghost" size="sm" className="text-red-600 hover:bg-red-50" onClick={() => setDeleteMenu(active)}>
                      <Trash2 size={14} aria-hidden /> {t("deleteMenu")}
                    </Button>
                  </div>
                </div>
              )}
              {active.description && <p className="text-sm text-stone-500">{active.description}</p>}

              {mode === "pdf" && <PdfMenuSection key={`pdf-${active.id}`} menu={active} ctx={ctx} pdfMode />}

              {active.categories.length === 0 ? (
                <EmptyState
                  icon={<LayoutList size={32} />}
                  title={t("emptyTitle")}
                  description={t("emptyDescription")}
                  action={
                    perms.edit && (
                      <div className="flex flex-wrap justify-center gap-2">
                        <Button onClick={() => setCatTarget({ menuId: active.id, categoryId: null })}>
                          <Plus size={16} aria-hidden /> {t("addFirstCategory")}
                        </Button>
                        {perms.ai && (
                          <Link href={`/dashboard/${restaurantId}/import`} className={buttonClass("secondary")}>
                            <FileUp size={16} aria-hidden /> {t("importCta")}
                          </Link>
                        )}
                      </div>
                    )
                  }
                />
              ) : (
                <>
                  <MenuBoard
                    key={active.id}
                    menu={active}
                    ctx={ctx}
                    onEditCategory={(c) => setCatTarget({ menuId: active.id, categoryId: c.id })}
                    onEditItem={(i) => setItemTarget({ mode: "edit", itemId: i.id })}
                    onAddItem={(categoryId) => setItemTarget({ mode: "create", categoryId })}
                  />
                  {perms.edit && (
                    <button
                      type="button"
                      onClick={() => setCatTarget({ menuId: active.id, categoryId: null })}
                      className="focus-ring flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-stone-300 py-4 text-sm font-medium text-stone-600 hover:border-stone-400 hover:text-stone-800"
                    >
                      <Plus size={16} aria-hidden /> {t("newCategory")}
                    </button>
                  )}
                </>
              )}

              {mode !== "pdf" && perms.edit && <PdfMenuSection key={`pdf-${active.id}`} menu={active} ctx={ctx} pdfMode={false} />}
            </div>
          )}
        </>
      )}

      {menuDialog && (
        <MenuDialog
          restaurantId={restaurantId}
          menu={menuDialog.mode === "edit" ? menuDialog.menu : null}
          onClose={() => setMenuDialog(null)}
          onCreated={(id) => selectMenu(id)}
        />
      )}
      {catTarget && (catTarget.categoryId === null || editingCategory) && (
        <CategoryDialog
          key={catTarget.categoryId ?? "new"}
          ctx={ctx}
          menuId={catTarget.menuId}
          category={editingCategory}
          onClose={() => setCatTarget(null)}
        />
      )}
      {itemTarget && itemCategoryId && (itemTarget.mode === "create" || editingItem) && (
        <ItemDialog
          key={itemTarget.mode === "edit" ? itemTarget.itemId : `new-${itemTarget.categoryId}`}
          ctx={ctx}
          item={editingItem}
          categoryId={itemCategoryId}
          categories={(itemMenu?.categories ?? []).map((c) => ({ id: c.id, name: c.name }))}
          onClose={() => {
            setItemTarget(null);
            setAwaitItem(null);
          }}
          onCreated={(id) => setAwaitItem(id)}
        />
      )}
      <ConfirmDialog
        open={!!deleteMenu}
        title={t("deleteMenuTitle")}
        message={
          deleteMenu
            ? t("deleteMenuConfirm", {
                name: deleteMenu.name,
                categories: deleteMenu.categories.length,
                items: deleteMenu.categories.reduce((n, c) => n + c.items.length, 0),
              })
            : null
        }
        confirmLabel={t("deleteMenu")}
        pending={delMenu.pending}
        onClose={() => setDeleteMenu(null)}
        onConfirm={() => deleteMenu && delMenu.run({ restaurantId, menuId: deleteMenu.id })}
      />
    </div>
  );
}

function MenuDialog({
  restaurantId,
  menu,
  onClose,
  onCreated,
}: {
  restaurantId: string;
  menu: EditorMenu | null;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const t = useTranslations("menu");
  const [name, setName] = React.useState(menu?.name ?? "");
  const [description, setDescription] = React.useState(menu?.description ?? "");
  const create = useAction(createMenuAction, {
    success: t("menuCreated"),
    onSuccess: (d) => {
      onCreated(d.id);
      onClose();
    },
  });
  const update = useAction(updateMenuAction, { success: t("menuSaved"), onSuccess: () => onClose() });
  const pending = create.pending || update.pending;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    if (menu) update.run({ restaurantId, menuId: menu.id, name: name.trim(), description: description.trim() || null });
    else create.run({ restaurantId, name: name.trim(), description: description.trim() || null });
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={menu ? t("renameMenu") : t("newMenu")}
      description={menu ? undefined : t("newMenuHint")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button type="submit" form="menu-form" loading={pending}>
            {menu ? t("save") : t("createMenu")}
          </Button>
        </>
      }
    >
      <form id="menu-form" onSubmit={submit} className="space-y-4">
        <Field label={t("fieldName")} htmlFor="menu-name">
          <Input
            id="menu-name"
            required
            autoFocus
            maxLength={120}
            value={name}
            placeholder={t("menuNamePlaceholder")}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label={t("fieldDescription")} htmlFor="menu-desc" hint={t("menuDescriptionHint")}>
          <Textarea id="menu-desc" rows={2} maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
      </form>
    </Dialog>
  );
}
