import { getTranslations } from "next-intl/server";
import type { OperatorKey } from "./operator";

export type LegalSection = { id: string; heading: string; content: React.ReactNode };

/** Clearly visible marker for missing operator data (set the env var before going live). */
export async function Placeholder({ name }: { name: OperatorKey }) {
  const t = await getTranslations("legal");
  return (
    <span className="mx-0.5 inline-block rounded-md border border-dashed border-amber-500 bg-amber-50 px-1.5 py-0.5 font-mono text-[0.8em] font-medium text-amber-800">
      [{t("placeholder", { name })}]
    </span>
  );
}

/** Operator value or placeholder. */
export function Val({ value, name }: { value: string | undefined; name: OperatorKey }) {
  return value ? <>{value}</> : <Placeholder name={name} />;
}

/** Multi-line postal address block. */
export function AddressBlock({ lines, name }: { lines: (string | undefined)[] | undefined; name?: OperatorKey }) {
  const rows = (lines ?? []).filter(Boolean) as string[];
  return (
    <address className="mt-3 not-italic leading-relaxed">
      {rows.length ? rows.map((l, i) => <span key={i} className="block">{l}</span>) : name ? <Placeholder name={name} /> : null}
    </address>
  );
}

/** Contact line: email as mailto link or placeholder. */
export function Email({ value }: { value: string | undefined }) {
  return value ? <a href={`mailto:${value}`}>{value}</a> : <Placeholder name="LEGAL_EMAIL" />;
}

/** Simple definition list (label → value) for operator data. */
export function InfoRows({ rows }: { rows: { label: string; value: React.ReactNode }[] }) {
  return (
    <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
      {rows.map((r) => (
        <div key={r.label} className="contents">
          <dt className="text-stone-500">{r.label}</dt>
          <dd className="text-stone-800">{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Highlighted box inside legal text (e.g. Widerspruchsrecht Art. 21, Allergen responsibility). */
export function Callout({ children }: { children: React.ReactNode }) {
  return <div className="mt-4 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-brand-900 [&>p:first-child]:mt-0">{children}</div>;
}
