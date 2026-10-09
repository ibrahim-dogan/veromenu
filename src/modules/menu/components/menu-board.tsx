"use client";
import * as React from "react";
import { useTranslations } from "next-intl";
import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronDown, EyeOff, GripVertical, ImageIcon, Pencil, Plus } from "lucide-react";
import { cn } from "@/core/utils";
import { Badge, Button } from "@/components/ui";
import { Switch } from "@/components/ui/switch";
import { useAction } from "@/components/use-action";
import { arrangeItemsAction, reorderCategoriesAction, setCategoryVisibleAction, setItemFlagsAction } from "../actions";
import { AllergenStatusBadge, priceLabel, TranslationGapBadge } from "./shared";
import type { EditorCategory, EditorContext, EditorItem, EditorMenu } from "./types";

type Layout = { cats: string[]; items: Record<string, string[]> };

const layoutOf = (menu: EditorMenu): Layout => ({
  cats: menu.categories.map((c) => c.id),
  items: Object.fromEntries(menu.categories.map((c) => [c.id, c.items.map((i) => i.id)])),
});

const C = "c:";
const I = "i:";
const Z = "z:";
const findCat = (l: Layout, itemId: string) => Object.keys(l.items).find((c) => l.items[c].includes(itemId));

/**
 * Categories with their items. Drag & drop: categories (vertical), items within and across categories.
 * Optimistic local layout, persisted via server actions; the server tree resets the layout on refresh.
 */
export function MenuBoard({
  menu,
  ctx,
  onEditCategory,
  onEditItem,
  onAddItem,
}: {
  menu: EditorMenu;
  ctx: EditorContext;
  onEditCategory: (c: EditorCategory) => void;
  onEditItem: (i: EditorItem) => void;
  onAddItem: (categoryId: string) => void;
}) {
  const t = useTranslations("menu");
  const [layout, setLayout] = React.useState<Layout>(() => layoutOf(menu));
  const [syncedMenu, setSyncedMenu] = React.useState(menu);
  if (syncedMenu !== menu) {
    setSyncedMenu(menu);
    setLayout(layoutOf(menu));
  }
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const snapshot = React.useRef<Layout | null>(null);
  const [collapsed, setCollapsed] = React.useState<Set<string>>(new Set());

  const catById = React.useMemo(() => new Map(menu.categories.map((c) => [c.id, c])), [menu]);
  const itemById = React.useMemo(() => new Map(menu.categories.flatMap((c) => c.items.map((i) => [i.id, i] as const))), [menu]);

  const reorderCats = useAction(reorderCategoriesAction);
  const arrange = useAction(arrangeItemsAction);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const collision: CollisionDetection = React.useCallback((args) => {
    if (String(args.active.id).startsWith(C)) {
      return closestCenter({ ...args, droppableContainers: args.droppableContainers.filter((d) => String(d.id).startsWith(C)) });
    }
    const containers = args.droppableContainers.filter((d) => !String(d.id).startsWith(C));
    const hits = pointerWithin({ ...args, droppableContainers: containers });
    const itemHits = hits.filter((h) => String(h.id).startsWith(I));
    if (itemHits.length)
      return closestCenter({ ...args, droppableContainers: containers.filter((d) => itemHits.some((h) => h.id === d.id)) });
    if (hits.length) return hits;
    return closestCenter({ ...args, droppableContainers: containers });
  }, []);

  function onDragStart(e: DragStartEvent) {
    snapshot.current = layout;
    setActiveId(String(e.active.id));
  }

  function onDragOver(e: DragOverEvent) {
    const a = String(e.active.id);
    const o = e.over ? String(e.over.id) : null;
    if (!a.startsWith(I) || !o) return;
    const itemId = a.slice(2);
    setLayout((l) => {
      const from = findCat(l, itemId);
      let to: string | undefined;
      let index: number;
      if (o.startsWith(I)) {
        to = findCat(l, o.slice(2));
        index = to ? l.items[to].indexOf(o.slice(2)) : 0;
      } else if (o.startsWith(Z)) {
        to = o.slice(2);
        index = l.items[to]?.length ?? 0;
      } else return l;
      if (!from || !to || from === to) return l;
      const fromList = l.items[from].filter((x) => x !== itemId);
      const toList = [...l.items[to]];
      toList.splice(index < 0 ? toList.length : index, 0, itemId);
      return { ...l, items: { ...l.items, [from]: fromList, [to]: toList } };
    });
  }

  function onDragEnd(e: DragEndEvent) {
    const a = String(e.active.id);
    const o = e.over ? String(e.over.id) : null;
    setActiveId(null);
    const before = snapshot.current;
    snapshot.current = null;
    if (!o || !before) {
      if (before) setLayout(before);
      return;
    }
    if (a.startsWith(C)) {
      if (!o.startsWith(C) || a === o) return;
      const next = arrayMove(layout.cats, layout.cats.indexOf(a.slice(2)), layout.cats.indexOf(o.slice(2)));
      setLayout({ ...layout, cats: next });
      reorderCats.run({ restaurantId: ctx.restaurantId, menuId: menu.id, ids: next });
      return;
    }
    const itemId = a.slice(2);
    const to = findCat(layout, itemId);
    if (!to) return;
    let list = layout.items[to];
    if (o.startsWith(I) && o !== a && list.includes(o.slice(2))) {
      list = arrayMove(list, list.indexOf(itemId), list.indexOf(o.slice(2)));
      setLayout({ ...layout, items: { ...layout.items, [to]: list } });
    }
    const from = findCat(before, itemId);
    const unchanged = from === to && before.items[to].join() === list.join();
    if (!unchanged) arrange.run({ restaurantId: ctx.restaurantId, categoryId: to, ids: list });
  }

  const activeCat = activeId?.startsWith(C) ? catById.get(activeId.slice(2)) : undefined;
  const activeItem = activeId?.startsWith(I) ? itemById.get(activeId.slice(2)) : undefined;
  const canDrag = ctx.perms.edit;

  return (
    <DndContext
      id={`menu-board-${menu.id}`}
      sensors={sensors}
      collisionDetection={collision}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={() => {
        if (snapshot.current) setLayout(snapshot.current);
        snapshot.current = null;
        setActiveId(null);
      }}
      accessibility={{
        screenReaderInstructions: { draggable: t("dndInstructions") },
      }}
    >
      <SortableContext items={layout.cats.map((id) => C + id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-4">
          {layout.cats.map((cid) => {
            const cat = catById.get(cid);
            if (!cat) return null;
            const ids = layout.items[cid] ?? [];
            return (
              <SortableCategory
                key={cid}
                category={cat}
                itemIds={ids}
                itemById={itemById}
                ctx={ctx}
                canDrag={canDrag}
                collapsed={collapsed.has(cid)}
                onToggleCollapse={() =>
                  setCollapsed((s) => {
                    const n = new Set(s);
                    if (n.has(cid)) n.delete(cid);
                    else n.add(cid);
                    return n;
                  })
                }
                onEdit={() => onEditCategory(cat)}
                onEditItem={onEditItem}
                onAddItem={() => onAddItem(cid)}
              />
            );
          })}
        </div>
      </SortableContext>
      <DragOverlay>
        {activeCat ? (
          <div className="rounded-xl border border-brand-300 bg-white px-4 py-3 font-semibold text-stone-900 shadow-xl">{activeCat.name}</div>
        ) : activeItem ? (
          <div className="rounded-lg border border-brand-300 bg-white shadow-xl">
            <ItemRowContent item={activeItem} ctx={ctx} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function SortableCategory({
  category,
  itemIds,
  itemById,
  ctx,
  canDrag,
  collapsed,
  onToggleCollapse,
  onEdit,
  onEditItem,
  onAddItem,
}: {
  category: EditorCategory;
  itemIds: string[];
  itemById: Map<string, EditorItem>;
  ctx: EditorContext;
  canDrag: boolean;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onEdit: () => void;
  onEditItem: (i: EditorItem) => void;
  onAddItem: () => void;
}) {
  const t = useTranslations("menu");
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: C + category.id,
    disabled: !canDrag,
  });
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: Z + category.id, disabled: !canDrag });
  const visible = useAction(setCategoryVisibleAction);
  const [optVisible, setOptVisible] = React.useState(category.isVisible);
  const [synced, setSynced] = React.useState(category.isVisible);
  if (synced !== category.isVisible) {
    setSynced(category.isVisible);
    setOptVisible(category.isVisible);
  }
  const img = category.imageMediaId ? ctx.mediaMap[category.imageMediaId] : undefined;
  const panelId = `cat-panel-${category.id}`;

  return (
    <section
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn("rounded-xl border border-stone-200 bg-white shadow-sm", isDragging && "opacity-40")}
      aria-label={category.name}
    >
      <header className="flex items-center gap-2 border-b border-stone-100 px-3 py-2.5 sm:px-4">
        {canDrag && (
          <button
            ref={setActivatorNodeRef}
            type="button"
            className="focus-ring -ms-1 cursor-grab touch-none rounded p-1 text-stone-400 hover:text-stone-700 active:cursor-grabbing"
            aria-label={t("dragCategory", { name: category.name })}
            {...attributes}
            {...listeners}
          >
            <GripVertical size={18} />
          </button>
        )}
        <button
          type="button"
          onClick={onToggleCollapse}
          className="focus-ring flex min-w-0 flex-1 items-center gap-3 rounded text-left"
          aria-expanded={!collapsed}
          aria-controls={panelId}
        >
          {img ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={img.thumb} alt="" className="h-9 w-9 shrink-0 rounded-md object-cover" />
          ) : null}
          <span className="min-w-0">
            <span className="flex items-center gap-2">
              <span className={cn("truncate font-semibold text-stone-900", !optVisible && "text-stone-400")}>{category.name}</span>
              <span className="shrink-0 text-xs text-stone-400 tabular-nums">{itemIds.length}</span>
              {!optVisible && (
                <Badge className="shrink-0">
                  <EyeOff size={12} aria-hidden /> {t("hidden")}
                </Badge>
              )}
            </span>
            {category.description && <span className="block truncate text-xs text-stone-500">{category.description}</span>}
          </span>
          <ChevronDown size={16} className={cn("ms-auto shrink-0 text-stone-400 transition-transform", collapsed && "-rotate-90")} aria-hidden />
        </button>
        {ctx.perms.edit && (
          <>
            <Switch
              className="hidden sm:inline-flex"
              checked={optVisible}
              onCheckedChange={(v) => {
                setOptVisible(v);
                visible.run({ restaurantId: ctx.restaurantId, categoryId: category.id, isVisible: v });
              }}
              label={<span className="sr-only">{t("visibleForGuests")}</span>}
            />
            <Button variant="ghost" size="icon" onClick={onEdit} aria-label={t("editCategoryNamed", { name: category.name })}>
              <Pencil size={16} />
            </Button>
          </>
        )}
      </header>

      {!collapsed && (
        <div id={panelId}>
          <SortableContext items={itemIds.map((id) => I + id)} strategy={verticalListSortingStrategy}>
            <ul ref={setDropRef} className={cn("min-h-12 divide-y divide-stone-100", isOver && itemIds.length === 0 && "bg-brand-50")}>
              {itemIds.length === 0 && <li className="px-4 py-4 text-center text-sm text-stone-400">{t("categoryEmpty")}</li>}
              {itemIds.map((iid) => {
                const it = itemById.get(iid);
                return it ? <SortableItem key={iid} item={it} ctx={ctx} canDrag={canDrag} onEdit={() => onEditItem(it)} /> : null;
              })}
            </ul>
          </SortableContext>
          {ctx.perms.edit && (
            <div className="border-t border-stone-100 px-3 py-2 sm:px-4">
              <Button variant="ghost" size="sm" onClick={onAddItem} className="text-brand-700">
                <Plus size={15} aria-hidden /> {t("addItem")}
              </Button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function SortableItem({ item, ctx, canDrag, onEdit }: { item: EditorItem; ctx: EditorContext; canDrag: boolean; onEdit: () => void }) {
  const t = useTranslations("menu");
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: I + item.id,
    disabled: !canDrag,
  });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn("flex items-stretch bg-white", isDragging && "opacity-30")}
    >
      {canDrag && (
        <button
          ref={setActivatorNodeRef}
          type="button"
          className="focus-ring cursor-grab touch-none px-2 text-stone-300 hover:text-stone-600 active:cursor-grabbing sm:px-3"
          aria-label={t("dragItem", { name: item.name })}
          {...attributes}
          {...listeners}
        >
          <GripVertical size={16} />
        </button>
      )}
      <ItemRowContent item={item} ctx={ctx} onEdit={onEdit} withToggles className={cn("flex-1", !canDrag && "ps-4")} />
    </li>
  );
}

function ItemRowContent({
  item,
  ctx,
  onEdit,
  withToggles,
  className,
}: {
  item: EditorItem;
  ctx: EditorContext;
  onEdit?: () => void;
  withToggles?: boolean;
  className?: string;
}) {
  const t = useTranslations("menu");
  const flags = useAction(setItemFlagsAction);
  const [opt, setOpt] = React.useState({ v: item.isVisible, a: item.isAvailable });
  const [synced, setSynced] = React.useState({ v: item.isVisible, a: item.isAvailable });
  if (synced.v !== item.isVisible || synced.a !== item.isAvailable) {
    setSynced({ v: item.isVisible, a: item.isAvailable });
    setOpt({ v: item.isVisible, a: item.isAvailable });
  }
  const img = item.imageMediaId ? ctx.mediaMap[item.imageMediaId] : undefined;
  const clickable = !!onEdit && ctx.perms.edit;

  const body = (
    <>
      <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-stone-100 text-stone-300">
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img.thumb} alt="" className="h-full w-full object-cover" />
        ) : (
          <ImageIcon size={18} aria-hidden />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className={cn("font-medium text-stone-900", !opt.v && "text-stone-400 line-through decoration-stone-300")}>{item.name}</span>
          {!opt.a && <Badge tone="red">{t("soldOutBadge")}</Badge>}
          {!opt.v && (
            <Badge>
              <EyeOff size={11} aria-hidden /> {t("hidden")}
            </Badge>
          )}
        </span>
        {item.description && <span className="mt-0.5 line-clamp-1 block text-sm text-stone-500">{item.description}</span>}
        <span className="mt-1 flex flex-wrap items-center gap-1.5">
          <AllergenStatusBadge status={item.allergenStatus} />
          {item.allergenStatus === "confirmed" && item.allergens.length > 0 && (
            <span className="text-xs text-stone-500">{item.allergens.length + item.additives.length}×</span>
          )}
          {item.tags.slice(0, 3).map((tag) => (
            <Badge key={tag} tone="blue" className="hidden sm:inline-flex">
              {t(`tag.${tag}`)}
            </Badge>
          ))}
          <TranslationGapBadge restaurantId={ctx.restaurantId} locales={ctx.gaps[item.id]} linkable={ctx.perms.translations} />
        </span>
      </span>
      <span className="shrink-0 text-end text-sm font-medium text-stone-800 tabular-nums sm:max-w-56">
        {priceLabel(item, ctx.currency, t("priceOnRequest"))}
      </span>
    </>
  );

  return (
    <div
      className={cn(
        "relative flex min-w-0 flex-col gap-2 py-3 pe-3 has-[>button:hover]:bg-stone-50 sm:flex-row sm:items-center sm:gap-4 sm:pe-4",
        className,
      )}
    >
      {/* stretched button: whole row opens the editor, inner links/toggles sit above it (z-10) */}
      {clickable && (
        <button
          type="button"
          onClick={onEdit}
          className="focus-ring absolute inset-0 rounded-lg"
          aria-label={t("editItemNamed", { name: item.name })}
        />
      )}
      <div className="flex min-w-0 flex-1 items-start gap-3 sm:items-center">{body}</div>
      {withToggles && (ctx.perms.edit || ctx.perms.availability) && (
        <div className="relative z-10 flex shrink-0 items-center gap-4 ps-15 sm:ps-0">
          {ctx.perms.edit && (
            <Switch
              checked={opt.v}
              onCheckedChange={(v) => {
                setOpt((o) => ({ ...o, v }));
                flags.run({ restaurantId: ctx.restaurantId, itemId: item.id, isVisible: v });
              }}
              label={<span className="text-xs text-stone-600">{t("visibleShort")}</span>}
            />
          )}
          <Switch
            checked={!opt.a}
            onCheckedChange={(soldOut) => {
              setOpt((o) => ({ ...o, a: !soldOut }));
              flags.run({ restaurantId: ctx.restaurantId, itemId: item.id, isAvailable: !soldOut });
            }}
            label={<span className="text-xs text-stone-600">{t("soldOut")}</span>}
          />
        </div>
      )}
    </div>
  );
}
