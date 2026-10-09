"use client";
import * as React from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button, Field, Input, Textarea } from "@/components/ui";
import { Dialog } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { useAction } from "@/components/use-action";
import { AiImageButton } from "@/modules/ai/components/ai-image-button";
import { MediaPicker } from "@/modules/media/components/media-picker";
import { DialogIsolate } from "@/modules/media/components/dialog-isolate";
import { invalidateMedia } from "@/modules/media/components/media-client";
import { deleteCategoryAction, saveCategoryAction } from "../actions";
import { ConfirmDialog, ownCloseOnly } from "./shared";
import type { EditorCategory, EditorContext } from "./types";

export function CategoryDialog({
  ctx,
  menuId,
  category,
  onClose,
}: {
  ctx: EditorContext;
  menuId: string;
  /** null = create */
  category: EditorCategory | null;
  onClose: () => void;
}) {
  const t = useTranslations("menu");
  const router = useRouter();
  const { restaurantId, perms } = ctx;
  const [name, setName] = React.useState(category?.name ?? "");
  const [description, setDescription] = React.useState(category?.description ?? "");
  const [imageMediaId, setImageMediaId] = React.useState<string | null>(category?.imageMediaId ?? null);
  const [isVisible, setVisible] = React.useState(category?.isVisible ?? true);
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  const save = useAction(saveCategoryAction, { success: t("categorySaved"), onSuccess: () => onClose() });
  const del = useAction(deleteCategoryAction, { success: t("categoryDeleted"), onSuccess: () => onClose() });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    save.run({
      restaurantId,
      categoryId: category?.id,
      menuId,
      name: name.trim(),
      description: description.trim() || null,
      imageMediaId,
      isVisible,
    });
  }

  return (
    <Dialog
      open
      onClose={ownCloseOnly(onClose)}
      title={category ? t("editCategory") : t("newCategory")}
      description={category ? undefined : t("newCategoryHint")}
      footer={
        <>
          {category && (
            <Button type="button" variant="ghost" size="sm" className="me-auto text-red-600 hover:bg-red-50" onClick={() => setConfirmDelete(true)}>
              <Trash2 size={15} aria-hidden /> {t("delete")}
            </Button>
          )}
          <Button type="button" variant="secondary" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button type="submit" form="category-form" loading={save.pending}>
            {category ? t("save") : t("createCategory")}
          </Button>
        </>
      }
    >
      <form id="category-form" onSubmit={submit} className="space-y-4">
        <Field label={t("fieldName")} htmlFor="cat-name">
          <Input
            id="cat-name"
            required
            autoFocus
            maxLength={120}
            value={name}
            placeholder={t("categoryNamePlaceholder")}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label={t("fieldDescription")} htmlFor="cat-desc" hint={t("categoryDescriptionHint")}>
          <Textarea id="cat-desc" rows={2} maxLength={1000} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
      </form>
      {/* outside the form: nested dialogs must not submit it */}
      <div className="mt-4 space-y-4">
        <div className="flex flex-wrap items-end gap-4">
          <MediaPicker restaurantId={restaurantId} value={imageMediaId} onChange={setImageMediaId} accept="image" label={t("fieldImage")} />
          {category && perms.ai && ctx.aiImages && (
            <DialogIsolate>
              <AiImageButton
                restaurantId={restaurantId}
                target={{ type: "category", id: category.id }}
                onApplied={(mediaId) => {
                  invalidateMedia(restaurantId);
                  setImageMediaId(mediaId);
                  router.refresh();
                }}
              />
            </DialogIsolate>
          )}
        </div>
        <Switch checked={isVisible} onCheckedChange={setVisible} label={t("visibleForGuests")} />
      </div>
      {category && (
        <DialogIsolate>
          <ConfirmDialog
            open={confirmDelete}
            title={t("deleteCategoryTitle")}
            message={
              category.items.length
                ? t("deleteCategoryConfirmItems", { name: category.name, count: category.items.length })
                : t("deleteCategoryConfirm", { name: category.name })
            }
            confirmLabel={t("delete")}
            pending={del.pending}
            onClose={() => setConfirmDelete(false)}
            onConfirm={() => del.run({ restaurantId, categoryId: category.id })}
          />
        </DialogIsolate>
      )}
    </Dialog>
  );
}
