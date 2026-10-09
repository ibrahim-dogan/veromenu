"use client";
import * as React from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Copy, Plus, Trash2, X } from "lucide-react";
import { cn, parsePriceToCents } from "@/core/utils";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import { Dialog } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { useAction } from "@/components/use-action";
import { DIET_TAGS } from "@/modules/allergens/catalog";
import { AiImageButton } from "@/modules/ai/components/ai-image-button";
import { MediaPicker } from "@/modules/media/components/media-picker";
import { DialogIsolate } from "@/modules/media/components/dialog-isolate";
import { invalidateMedia } from "@/modules/media/components/media-client";
import { deleteItemAction, duplicateItemAction, saveItemAction } from "../actions";
import { AllergenSection } from "./allergen-section";
import { centsToInput, ConfirmDialog, ownCloseOnly, TranslationGapBadge } from "./shared";
import type { EditorCategory, EditorContext, EditorItem } from "./types";

type VariantRow = { key: number; name: string; price: string };
type Tag = (typeof DIET_TAGS)[number];

let variantSeq = 0;

export type ItemDialogTarget = { mode: "create"; categoryId: string } | { mode: "edit"; itemId: string };

/** Create / edit one item (dish or drink). */
export function ItemDialog({
  ctx,
  item,
  categoryId,
  categories,
  onClose,
  onCreated,
}: {
  ctx: EditorContext;
  /** null = create mode */
  item: EditorItem | null;
  categoryId: string;
  categories: Pick<EditorCategory, "id" | "name">[];
  onClose: () => void;
  onCreated?: (id: string) => void;
}) {
  const t = useTranslations("menu");
  const router = useRouter();
  const { restaurantId, perms } = ctx;
  const readOnly = !perms.edit;

  const [name, setName] = React.useState(item?.name ?? "");
  const [description, setDescription] = React.useState(item?.description ?? "");
  const [ingredients, setIngredients] = React.useState(item?.ingredients ?? "");
  const [price, setPrice] = React.useState(centsToInput(item?.priceCents));
  const [variants, setVariants] = React.useState<VariantRow[]>(
    () => item?.variants.map((v) => ({ key: ++variantSeq, name: v.name, price: centsToInput(v.priceCents) })) ?? [],
  );
  const [tags, setTags] = React.useState<string[]>(item?.tags ?? []);
  const [imageMediaId, setImageMediaId] = React.useState<string | null>(item?.imageMediaId ?? null);
  const [isVisible, setVisible] = React.useState(item?.isVisible ?? true);
  const [isAvailable, setAvailable] = React.useState(item?.isAvailable ?? true);
  const [catId, setCatId] = React.useState(item?.categoryId ?? categoryId);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  const save = useAction(saveItemAction, {
    success: t("itemSaved"),
    onSuccess: (d) => {
      if (!item) onCreated?.(d.id);
      else onClose();
    },
  });
  const del = useAction(deleteItemAction, { success: t("itemDeleted"), onSuccess: () => onClose() });
  const dup = useAction(duplicateItemAction, { success: t("itemDuplicated"), onSuccess: () => onClose() });

  const dirtyRecipe =
    !!item &&
    (name.trim() !== item.name || (description.trim() || null) !== (item.description || null) || (ingredients.trim() || null) !== (item.ingredients || null));

  function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (readOnly) return;
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = t("errName");
    const priceCents = price.trim() ? parsePriceToCents(price) : null;
    if (price.trim() && (priceCents == null || priceCents < 0)) errs.price = t("errPrice");
    const vs: { name: string; priceCents: number }[] = [];
    variants.forEach((v, i) => {
      if (!v.name.trim() && !v.price.trim()) return;
      const c = parsePriceToCents(v.price);
      if (!v.name.trim()) errs[`v${i}`] = t("errVariantName");
      else if (c == null || c < 0) errs[`v${i}`] = t("errPrice");
      else vs.push({ name: v.name.trim(), priceCents: c });
    });
    if (new Set(vs.map((v) => v.name.toLowerCase())).size !== vs.length) errs.variants = t("errVariantDuplicate");
    setErrors(errs);
    if (Object.keys(errs).length) return;
    save.run({
      restaurantId,
      itemId: item?.id,
      categoryId: catId,
      name: name.trim(),
      description: description.trim() || null,
      ingredients: ingredients.trim() || null,
      priceCents,
      imageMediaId,
      isVisible,
      isAvailable,
      tags: tags as Tag[],
      variants: vs,
    });
  }

  const close = ownCloseOnly(onClose);

  return (
    <Dialog
      open
      onClose={close}
      size="lg"
      title={item ? t("editItem") : t("newItem")}
      description={item ? <TranslationGapInline ctx={ctx} itemId={item.id} /> : t("newItemHint")}
      footer={
        <>
          {item && perms.edit && (
            <div className="me-auto flex gap-1">
              <Button type="button" variant="ghost" size="sm" className="text-red-600 hover:bg-red-50" onClick={() => setConfirmDelete(true)}>
                <Trash2 size={15} aria-hidden /> <span className="hidden sm:inline">{t("delete")}</span>
              </Button>
              <Button type="button" variant="ghost" size="sm" loading={dup.pending} onClick={() => dup.run({ restaurantId, itemId: item.id })}>
                <Copy size={15} aria-hidden /> <span className="hidden sm:inline">{t("duplicate")}</span>
              </Button>
            </div>
          )}
          <Button type="button" variant="secondary" onClick={onClose}>
            {readOnly ? t("close") : t("cancel")}
          </Button>
          {!readOnly && (
            <Button type="submit" form="item-form" loading={save.pending}>
              {item ? t("save") : t("createItem")}
            </Button>
          )}
        </>
      }
    >
      {/* Only plain fields live inside the <form>: nested dialogs (media picker, AI buttons) must not submit it. */}
      <div className="space-y-5">
        <form id="item-form" onSubmit={submit}>
          <fieldset disabled={readOnly} className="space-y-4">
          <Field label={t("fieldName")} htmlFor="item-name" error={errors.name}>
            <Input id="item-name" value={name} maxLength={120} required autoFocus={!item} onChange={(e) => setName(e.target.value)} aria-invalid={!!errors.name} />
          </Field>
          <Field label={t("fieldDescription")} htmlFor="item-desc" hint={t("fieldDescriptionHint")}>
            <Textarea id="item-desc" value={description} maxLength={1000} rows={2} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          <Field label={t("fieldIngredients")} htmlFor="item-ingr" hint={t("fieldIngredientsHint")}>
            <Textarea id="item-ingr" value={ingredients} maxLength={2000} rows={2} onChange={(e) => setIngredients(e.target.value)} />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("fieldPrice")} htmlFor="item-price" error={errors.price} hint={variants.length ? t("fieldPriceVariantsHint") : t("fieldPriceHint")}>
              <div className="relative">
                <Input
                  id="item-price"
                  inputMode="decimal"
                  placeholder={t("priceOnRequest")}
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  aria-invalid={!!errors.price}
                  className="pe-8"
                />
                <span className="pointer-events-none absolute inset-y-0 end-3 flex items-center text-sm text-stone-400">€</span>
              </div>
            </Field>
            {item && categories.length > 1 && (
              <Field label={t("fieldCategory")} htmlFor="item-cat">
                <Select id="item-cat" value={catId} onChange={(e) => setCatId(e.target.value)}>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-stone-700">{t("variants")}</legend>
            <p className="text-xs text-stone-500">{t("variantsHint")}</p>
            {variants.map((v, i) => (
              <div key={v.key}>
                <div className="flex items-center gap-2">
                  <Input
                    aria-label={t("variantName")}
                    placeholder={t("variantNamePlaceholder")}
                    value={v.name}
                    maxLength={60}
                    onChange={(e) => setVariants(variants.map((x) => (x.key === v.key ? { ...x, name: e.target.value } : x)))}
                  />
                  <div className="relative w-32 shrink-0">
                    <Input
                      aria-label={t("variantPrice")}
                      inputMode="decimal"
                      placeholder="0,00"
                      value={v.price}
                      className="pe-7"
                      onChange={(e) => setVariants(variants.map((x) => (x.key === v.key ? { ...x, price: e.target.value } : x)))}
                    />
                    <span className="pointer-events-none absolute inset-y-0 end-2.5 flex items-center text-sm text-stone-400">€</span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={t("removeVariant")}
                    onClick={() => setVariants(variants.filter((x) => x.key !== v.key))}
                  >
                    <X size={16} />
                  </Button>
                </div>
                {errors[`v${i}`] && <p className="mt-1 text-xs text-red-600">{errors[`v${i}`]}</p>}
              </div>
            ))}
            {errors.variants && <p className="text-xs text-red-600">{errors.variants}</p>}
            {!readOnly && variants.length < 20 && (
              <Button type="button" variant="secondary" size="sm" onClick={() => setVariants([...variants, { key: ++variantSeq, name: "", price: "" }])}>
                <Plus size={14} aria-hidden /> {t("addVariant")}
              </Button>
            )}
          </fieldset>

          <fieldset>
            <legend className="mb-2 text-sm font-medium text-stone-700">{t("tags")}</legend>
            <div className="flex flex-wrap gap-1.5">
              {DIET_TAGS.map((tag) => {
                const on = tags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setTags(on ? tags.filter((x) => x !== tag) : [...tags, tag])}
                    className={cn(
                      "focus-ring rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                      on ? "border-brand-600 bg-brand-600 text-white" : "border-stone-300 bg-white text-stone-700 hover:bg-stone-50",
                    )}
                  >
                    {t(`tag.${tag}`)}
                  </button>
                );
              })}
            </div>
          </fieldset>
          </fieldset>
        </form>

        <fieldset disabled={readOnly} className="space-y-4">
          <div className="flex flex-wrap items-end gap-4">
            <MediaPicker restaurantId={restaurantId} value={imageMediaId} onChange={setImageMediaId} accept="image" label={t("fieldImage")} />
            {item && perms.ai && ctx.aiImages && (
              <DialogIsolate>
                <AiImageButton
                  restaurantId={restaurantId}
                  target={{ type: "item", id: item.id }}
                  onApplied={(mediaId) => {
                    invalidateMedia(restaurantId);
                    setImageMediaId(mediaId);
                    router.refresh();
                  }}
                />
              </DialogIsolate>
            )}
          </div>

          <div className="flex flex-wrap gap-x-6 gap-y-3 rounded-lg bg-stone-50 px-4 py-3">
            <Switch checked={isVisible} onCheckedChange={setVisible} label={t("visibleForGuests")} />
            <Switch checked={!isAvailable} onCheckedChange={(v) => setAvailable(!v)} label={t("soldOut")} />
          </div>
        </fieldset>

        {item ? (
          <AllergenSection restaurantId={restaurantId} item={item} canReview={perms.allergens} canUseAi={perms.ai} dirtyRecipe={dirtyRecipe} />
        ) : (
          <p className="rounded-lg bg-stone-50 px-4 py-3 text-sm text-stone-600">{t("allergensAfterCreate")}</p>
        )}
      </div>

      {item && (
        <DialogIsolate>
          <ConfirmDialog
            open={confirmDelete}
            title={t("deleteItemTitle")}
            message={t("deleteItemConfirm", { name: item.name })}
            confirmLabel={t("delete")}
            pending={del.pending}
            onClose={() => setConfirmDelete(false)}
            onConfirm={() => del.run({ restaurantId, itemId: item.id })}
          />
        </DialogIsolate>
      )}
    </Dialog>
  );
}

function TranslationGapInline({ ctx, itemId }: { ctx: EditorContext; itemId: string }) {
  const t = useTranslations("menu");
  const gaps = ctx.gaps[itemId];
  if (!gaps?.length) return null;
  return (
    <span className="mt-1 inline-flex items-center gap-2 text-sm">
      <TranslationGapBadge restaurantId={ctx.restaurantId} locales={gaps} linkable={ctx.perms.translations} />
      <span>{t("translationGapShort", { count: gaps.length })}</span>
    </span>
  );
}
