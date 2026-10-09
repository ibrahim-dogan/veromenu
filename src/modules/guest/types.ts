/** Client-safe types of the guest menu (output of load.ts). */

export type GuestLocaleOption = { code: string; native: string; flag: string; rtl: boolean };

export type GuestImage = { sm: string; md: string; alt: string | null; isAi: boolean; width: number | null; height: number | null };

export type GuestCatalogLabel = { code: string; letter: string; icon: string; label: string };

export type GuestVariant = { id: string; name: string; priceCents: number };

export type GuestItem = {
  id: string;
  categoryId: string;
  name: string;
  description: string | null;
  /** null = no base price (variants only, or "price on request"). */
  priceCents: number | null;
  variants: GuestVariant[];
  image: GuestImage | null;
  tags: string[];
  /** false → allergens are NOT confirmed: never show "free of X", show the staff notice instead. */
  allergensConfirmed: boolean;
  allergens: GuestCatalogLabel[];
  additives: GuestCatalogLabel[];
  /** false = sold out ("ausverkauft"): visible but not orderable. */
  available: boolean;
  /** Can be put into the cart right now (ordering on, available, has a price). */
  orderable: boolean;
};

export type GuestCategory = {
  id: string;
  menuId: string;
  name: string;
  description: string | null;
  image: GuestImage | null;
  items: GuestItem[];
};

export type GuestMenu = {
  id: string;
  name: string;
  description: string | null;
  /** Has time windows. */
  scheduled: boolean;
  /** Within a time window now (or not scheduled). */
  activeNow: boolean;
  schedule: { days: number[]; from: string; to: string }[];
  categories: GuestCategory[];
};

export type GuestPdfPage = { id: string; url: string; mime: string; image: GuestImage | null };

export type GuestOpeningHours = { day: number; open: string; close: string }[];

export type GuestRestaurant = {
  id: string;
  slug: string;
  name: string;
  cuisine: string | null;
  address: { street?: string; zip?: string; city?: string; country?: string } | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  logo: GuestImage | null;
  cover: GuestImage | null;
  openingHours: GuestOpeningHours;
  legal: {
    companyName?: string;
    representative?: string;
    registerCourt?: string;
    registerNumber?: string;
    vatId?: string;
    extra?: string;
  };
  currency: string;
  timezone: string;
};

export type GuestOrdering = {
  /** Cart + checkout available. */
  enabled: boolean;
  /** Ordering is on, but only from table QR codes and no (valid) table token was given. */
  needsTable: boolean;
  allowNotes: boolean;
};

export type GuestMenuData = {
  restaurant: GuestRestaurant;
  locale: string;
  defaultLocale: string;
  dir: "ltr" | "rtl";
  availableLocales: GuestLocaleOption[];
  menuMode: "digital" | "pdf";
  menus: GuestMenu[];
  pdfPages: GuestPdfPage[];
  table: { id: string; label: string } | null;
  tableToken: string | null;
  ordering: GuestOrdering;
  /** Show "Powered by VeroMenu" (plan without custom_branding). */
  showBranding: boolean;
  /** Allergens / additives used on confirmed items (legend + footnotes). */
  legend: { allergens: GuestCatalogLabel[]; additives: GuestCatalogLabel[] };
  /** At least one visible item has unconfirmed allergen info. */
  hasUnconfirmedAllergens: boolean;
  theme: { id: string; config: Record<string, unknown> };
  /** Rendered as theme preview for an authorized dashboard user (no tracking). */
  preview: boolean;
};

/** Compact item data shipped to the client (detail sheet, cart). */
export type ClientItem = {
  id: string;
  c: string;
  n: string;
  d: string | null;
  p: number | null;
  v: GuestVariant[];
  img: string | null;
  ai: boolean;
  t: string[];
  ac: boolean;
  al: GuestCatalogLabel[];
  ad: GuestCatalogLabel[];
  av: boolean;
  o: boolean;
};
