"use client";
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { BookA, Plus, Trash2 } from "lucide-react";
import { Badge, Button, Card, CardBody, CardHeader, Field, Input, Select } from "@/components/ui";
import { useAction } from "@/components/use-action";
import { addGlossaryTerm, deleteGlossaryTerm } from "../actions";

export type GlossaryItem = { id: string; term: string; locale: string | null; translation: string | null; doNotTranslate: boolean };

export function GlossaryCard({ restaurantId, locales, entries }: { restaurantId: string; locales: string[]; entries: GlossaryItem[] }) {
  const t = useTranslations("translations");
  const tc = useTranslations("common");
  const uiLocale = useLocale();
  const [term, setTerm] = useState("");
  const [mode, setMode] = useState<"keep" | "fixed">("keep");
  const [locale, setLocale] = useState<string>("");
  const [translation, setTranslation] = useState("");
  const add = useAction(addGlossaryTerm, {
    success: t("glossaryAdded"),
    onSuccess: () => {
      setTerm("");
      setTranslation("");
    },
  });
  const del = useAction(deleteGlossaryTerm, {});
  const langName = (code: string) => {
    try {
      return new Intl.DisplayNames([uiLocale], { type: "language" }).of(code) ?? code;
    } catch {
      return code;
    }
  };

  return (
    <Card>
      <CardHeader
        title={
          <span className="inline-flex items-center gap-2">
            <BookA size={18} className="text-stone-400" /> {t("glossaryTitle")}
          </span>
        }
        description={t("glossaryDescription")}
      />
      <CardBody className="space-y-4">
        <form
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.2fr_1fr_1fr_1.2fr_auto] lg:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            void add.run({
              restaurantId,
              term,
              locale: mode === "fixed" ? locale || null : null,
              translation: mode === "fixed" ? translation : null,
              doNotTranslate: mode === "keep",
            });
          }}
        >
          <Field label={t("glossaryTerm")} htmlFor="g-term">
            <Input id="g-term" value={term} onChange={(e) => setTerm(e.target.value)} placeholder={t("glossaryTermPlaceholder")} required maxLength={120} />
          </Field>
          <Field label={t("glossaryMode")} htmlFor="g-mode">
            <Select id="g-mode" value={mode} onChange={(e) => setMode(e.target.value as "keep" | "fixed")}>
              <option value="keep">{t("glossaryKeep")}</option>
              <option value="fixed">{t("glossaryFixed")}</option>
            </Select>
          </Field>
          <Field label={t("glossaryLocale")} htmlFor="g-locale">
            <Select id="g-locale" value={locale} onChange={(e) => setLocale(e.target.value)} disabled={mode === "keep"}>
              <option value="">{t("glossaryAllLocales")}</option>
              {locales.map((l) => (
                <option key={l} value={l}>
                  {langName(l)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("glossaryTranslation")} htmlFor="g-tr">
            <Input
              id="g-tr"
              value={translation}
              onChange={(e) => setTranslation(e.target.value)}
              disabled={mode === "keep"}
              required={mode === "fixed"}
              maxLength={200}
            />
          </Field>
          <Button type="submit" loading={add.pending} disabled={!term.trim() || (mode === "fixed" && !translation.trim())}>
            <Plus size={15} /> {tc("add")}
          </Button>
        </form>

        {entries.length === 0 ? (
          <p className="text-sm text-stone-500">{t("glossaryEmpty")}</p>
        ) : (
          <ul className="divide-y divide-stone-100 rounded-lg border border-stone-200">
            {entries.map((g) => (
              <li key={g.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="font-medium text-stone-900">{g.term}</span>
                  {g.doNotTranslate ? (
                    <Badge tone="purple">{t("glossaryKeepBadge")}</Badge>
                  ) : (
                    <>
                      <span className="text-stone-400" aria-hidden>
                        →
                      </span>
                      <span className="text-stone-700">{g.translation}</span>
                      <Badge>{g.locale ? langName(g.locale) : t("glossaryAllLocales")}</Badge>
                    </>
                  )}
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`${tc("delete")}: ${g.term}`}
                  disabled={del.pending}
                  onClick={() => del.run({ restaurantId, id: g.id })}
                >
                  <Trash2 size={15} />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-stone-500">{t("glossaryHint")}</p>
      </CardBody>
    </Card>
  );
}
