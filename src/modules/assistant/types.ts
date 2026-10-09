/**
 * Shared (client + server) types of the AI assistant change sets.
 * The agent proposes operations → the server resolves/validates them into `ResolvedOp`s and renders a
 * `ChangesetPreview` (dry run) → the user approves a subset → applied in one transaction with `InverseOp`s.
 */

export type VariantInput = { name: string; priceCents: number };

export type FieldKey =
  | "name"
  | "description"
  | "ingredients"
  | "price"
  | "available"
  | "visible"
  | "tags"
  | "category"
  | "variants"
  | "menu";

export type PreviewValue = string | number | boolean | null | string[] | VariantInput[];

export type PreviewField = { field: FieldKey; before?: PreviewValue; after?: PreviewValue };

export type OpKind = "update_item" | "create_item" | "delete_item" | "create_category" | "update_category" | "delete_category";

/** i18n note: code = key in the "assistant.notes" namespace, params = ICU params. */
export type PreviewNote = { code: string; params?: Record<string, string | number> };

export type PreviewOp = {
  key: string;
  kind: OpKind;
  /** Entity name (after the change for renames/creates). */
  title: string;
  /** "Menu › Category" breadcrumb. */
  context: string | null;
  fields: PreviewField[];
  destructive: boolean;
  /** Key of the create_category op this op depends on (new item in a new category). */
  dependsOn: string | null;
  notes: PreviewNote[];
};

export type ChangesetPreview = {
  ops: PreviewOp[];
  warnings: PreviewNote[];
  /** Operations the server rejected (unknown ids, insane prices …). */
  dropped: PreviewNote[];
  /** Keys that were actually applied (set on apply). */
  appliedKeys?: string[];
};

// ----------------------------------------------------------------- server-side resolved ops (stored in agent_changesets.operations)

export type ItemPatchJson = {
  name?: string;
  description?: string | null;
  ingredients?: string | null;
  priceCents?: number | null;
  isAvailable?: boolean;
  isVisible?: boolean;
  tags?: string[];
  categoryId?: string;
};

export type CategoryPatchJson = { name?: string; description?: string | null; isVisible?: boolean };

export type ResolvedOp =
  | { key: string; kind: "update_item"; itemId: string; patch: ItemPatchJson; variants?: VariantInput[]; expectUpdatedAt: string }
  | {
      key: string;
      kind: "create_item";
      categoryId: string | null;
      categoryRef: string | null;
      input: {
        name: string;
        description: string | null;
        ingredients: string | null;
        priceCents: number | null;
        tags: string[];
        variants: VariantInput[];
      };
    }
  | { key: string; kind: "delete_item"; itemId: string; expectUpdatedAt: string }
  | { key: string; kind: "create_category"; ref: string; menuId: string; name: string; description: string | null }
  | { key: string; kind: "update_category"; categoryId: string; patch: CategoryPatchJson; expectUpdatedAt: string }
  | { key: string; kind: "delete_category"; categoryId: string; expectUpdatedAt: string };

export type ItemSnapshot = {
  id: string;
  categoryId: string;
  name: string;
  description: string | null;
  ingredients: string | null;
  priceCents: number | null;
  imageMediaId: string | null;
  sort: number;
  isVisible: boolean;
  isAvailable: boolean;
  tags: string[];
  allergens: string[];
  additives: string[];
  allergenStatus: string;
  allergenConfirmedBy: string | null;
  variants: VariantInput[];
};

export type CategorySnapshot = {
  id: string;
  menuId: string;
  name: string;
  description: string | null;
  imageMediaId: string | null;
  isVisible: boolean;
  sort: number;
  items: ItemSnapshot[];
};

/** Undo operations, stored in application-reverse order. */
export type InverseOp =
  | {
      kind: "restore_item";
      itemId: string;
      name: string;
      patch: ItemPatchJson;
      variants?: VariantInput[];
      expectUpdatedAt?: string;
      expectVariants?: VariantInput[];
    }
  | { kind: "remove_item"; itemId: string; name: string; expectUpdatedAt?: string }
  | { kind: "recreate_item"; item: ItemSnapshot }
  | { kind: "remove_category"; categoryId: string; name: string; expectUpdatedAt?: string }
  | { kind: "restore_category"; categoryId: string; name: string; patch: CategoryPatchJson; expectUpdatedAt?: string }
  | { kind: "recreate_category"; category: CategorySnapshot };

export type ChangesetStatus = "draft" | "applied" | "discarded" | "failed" | "reverted";

export type ChangesetDto = {
  id: string;
  status: ChangesetStatus;
  input: string;
  inputKind: "text" | "voice";
  summary: string | null;
  preview: ChangesetPreview;
  createdAt: string;
  appliedAt: string | null;
  error: string | null;
};

export type PlanResult =
  | { kind: "clarify"; summary: string; clarifications: string[] }
  | { kind: "changeset"; changeset: ChangesetDto; clarifications: string[] }
  | { kind: "empty"; summary: string };

export type ApplyResult = { status: "applied" } | { status: "conflict"; names: string[] };
export type UndoResult = { status: "reverted" } | { status: "conflict"; names: string[] };
