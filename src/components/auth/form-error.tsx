"use client";
import { useTranslations } from "next-intl";
import type { AuthFormState } from "@/modules/auth/actions";

/** Inline, translated error for auth forms (aria-live so screen readers announce it). */
export function FormError({ state }: { state: AuthFormState }) {
  const t = useTranslations("errors");
  if (!state.error) return null;
  const first = state.fieldErrors ? Object.values(state.fieldErrors)[0]?.[0] : undefined;
  const code = state.error === "validation" && first && t.has(first) ? first : state.error;
  return (
    <p role="alert" aria-live="polite" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
      {t.has(code) ? t(code) : t("unexpected")}
    </p>
  );
}

/** Field-level message helper. */
export function useFieldError(state: AuthFormState) {
  const t = useTranslations("errors");
  return (k: string) => {
    const m = state.fieldErrors?.[k]?.[0];
    return m ? (t.has(m) ? t(m) : t("validation")) : undefined;
  };
}
