/**
 * Operator ("Anbieter") data for Impressum, Datenschutzerklärung, AGB and AVV.
 * Read from process.env at REQUEST time (legal pages call `connection()`), never via env() –
 * so the Docker image can be built without these values and configured at runtime.
 *
 *   LEGAL_NAME                  Firmenname / Name des Betreibers (required)
 *   LEGAL_ADDRESS               Anschrift, lines separated by "\n" or ", " (required)
 *   LEGAL_EMAIL                 Kontakt-E-Mail (required)
 *   LEGAL_PHONE                 Telefon (required)
 *   LEGAL_VAT_ID                USt-IdNr. (required if available)
 *   LEGAL_REPRESENTATIVE        Vertretungsberechtigte Person(en) (optional)
 *   LEGAL_REGISTER              Registereintrag, e.g. "Amtsgericht Hamburg, HRB 12345" (optional)
 *   LEGAL_SUPERVISORY_AUTHORITY Datenschutz-Aufsichtsbehörde, lines (optional, default HmbBfDI)
 *   LEGAL_HOSTER                Hosting-Anbieter, lines (optional, default Hetzner Online GmbH)
 */
export type OperatorKey =
  | "LEGAL_NAME"
  | "LEGAL_ADDRESS"
  | "LEGAL_EMAIL"
  | "LEGAL_PHONE"
  | "LEGAL_VAT_ID"
  | "LEGAL_REPRESENTATIVE"
  | "LEGAL_REGISTER";

export type Operator = {
  name?: string;
  address?: string[];
  email?: string;
  phone?: string;
  vatId?: string;
  representative?: string;
  register?: string;
  supervisoryAuthority: string[];
  supervisoryAuthorityIsDefault: boolean;
  hoster: string[];
  hosterIsDefault: boolean;
};

export const DEFAULT_HOSTER = ["Hetzner Online GmbH", "Industriestr. 25", "91710 Gunzenhausen", "Deutschland"];
export const DEFAULT_SUPERVISORY_AUTHORITY = [
  "Der Hamburgische Beauftragte für Datenschutz und Informationsfreiheit (HmbBfDI)",
  "Ludwig-Erhard-Straße 22",
  "20459 Hamburg",
];

const val = (k: string) => {
  const v = process.env[k]?.trim();
  return v ? v : undefined;
};

/** Splits "Musterstr. 1\n20095 Hamburg" (real or escaped newline) or "Musterstr. 1, 20095 Hamburg" into lines. */
export const toLines = (s: string | undefined) =>
  s
    ? s
        .split(/\\n|\r?\n|,\s+/)
        .map((x) => x.trim())
        .filter(Boolean)
    : undefined;

export function getOperator(): Operator {
  const sa = toLines(val("LEGAL_SUPERVISORY_AUTHORITY"));
  const hoster = toLines(val("LEGAL_HOSTER"));
  return {
    name: val("LEGAL_NAME"),
    address: toLines(val("LEGAL_ADDRESS")),
    email: val("LEGAL_EMAIL"),
    phone: val("LEGAL_PHONE"),
    vatId: val("LEGAL_VAT_ID"),
    representative: val("LEGAL_REPRESENTATIVE"),
    register: val("LEGAL_REGISTER"),
    supervisoryAuthority: sa ?? DEFAULT_SUPERVISORY_AUTHORITY,
    supervisoryAuthorityIsDefault: !sa,
    hoster: hoster ?? DEFAULT_HOSTER,
    hosterIsDefault: !hoster,
  };
}
