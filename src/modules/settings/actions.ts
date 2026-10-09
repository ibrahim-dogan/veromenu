"use server";
import { z } from "zod";
import { action, AppError } from "@/core/http/action";
import { assertRestaurantPermission } from "@/core/auth/guards";
import { audit } from "@/core/audit";
import { planHas } from "@/modules/billing/plans";
import { assertOwnMediaIds } from "@/modules/media/service";
import { changeSlug, exportMenu, patchSettings, setEnabledLocales, slugAvailability } from "./service";

const rid = z.uuid();
const text = (max: number) => z.string().trim().max(max).optional().transform((v) => v || undefined);
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

async function guard(restaurantId: string) {
  return assertRestaurantPermission(restaurantId, "settings.manage");
}

export const updateGeneralAction = action(
  z.object({
    restaurantId: rid,
    name: z.string().trim().min(2).max(100),
    cuisine: text(80),
    phone: text(40),
    email: z.union([z.literal(""), z.string().trim().email().max(200)]).optional().transform((v) => v || undefined),
    website: z.union([z.literal(""), z.string().trim().url().max(300)]).optional().transform((v) => v || undefined),
    address: z.object({ street: text(120), zip: text(12), city: text(80), country: text(60) }),
    logoMediaId: z.uuid().nullable(),
    coverMediaId: z.uuid().nullable(),
  }),
  async ({ restaurantId, name, ...s }) => {
    const ctx = await guard(restaurantId);
    const ids = [s.logoMediaId, s.coverMediaId].filter((x): x is string => !!x);
    if (ids.length) await assertOwnMediaIds(restaurantId, ids);
    await patchSettings(
      restaurantId,
      {
        cuisine: s.cuisine,
        phone: s.phone,
        email: s.email,
        website: s.website,
        address: s.address,
        logoMediaId: s.logoMediaId,
        coverMediaId: s.coverMediaId,
      },
      { name },
    );
    await audit({ restaurantId, userId: ctx.user.id, action: "settings.general", data: { name } });
    return null;
  },
);

export const checkSlugAction = action(z.object({ restaurantId: rid, slug: z.string().trim().toLowerCase().max(60) }), async ({ restaurantId, slug }) => {
  await guard(restaurantId);
  return slugAvailability(restaurantId, slug);
});

export const changeSlugAction = action(z.object({ restaurantId: rid, slug: z.string().trim().toLowerCase().max(60) }), async ({ restaurantId, slug }) => {
  const ctx = await guard(restaurantId);
  const before = ctx.restaurant.slug;
  const r = await changeSlug(restaurantId, slug);
  await audit({ restaurantId, userId: ctx.user.id, action: "settings.slug", data: { from: before, to: r.slug } });
  return { slug: r.slug };
});

export const updateOpeningHoursAction = action(
  z.object({
    restaurantId: rid,
    hours: z.array(z.object({ day: z.number().int().min(1).max(7), open: time, close: time })).max(42),
  }),
  async ({ restaurantId, hours }) => {
    const ctx = await guard(restaurantId);
    const sorted = [...hours].sort((a, b) => a.day - b.day || a.open.localeCompare(b.open));
    await patchSettings(restaurantId, { openingHours: sorted });
    await audit({ restaurantId, userId: ctx.user.id, action: "settings.opening_hours" });
    return null;
  },
);

export const updateLegalAction = action(
  z.object({
    restaurantId: rid,
    legal: z.object({
      companyName: text(200),
      representative: text(200),
      registerCourt: text(120),
      registerNumber: text(60),
      vatId: text(30),
      extra: text(2000),
    }),
  }),
  async ({ restaurantId, legal }) => {
    const ctx = await guard(restaurantId);
    await patchSettings(restaurantId, { legal });
    await audit({ restaurantId, userId: ctx.user.id, action: "settings.legal" });
    return null;
  },
);

export const updateLocalesAction = action(
  z.object({ restaurantId: rid, locales: z.array(z.string().min(2).max(10)).max(40) }),
  async ({ restaurantId, locales }) => {
    const ctx = await guard(restaurantId);
    const r = await setEnabledLocales(restaurantId, locales);
    await audit({ restaurantId, userId: ctx.user.id, action: "settings.locales", data: { enabledLocales: r.enabledLocales } });
    return { enabledLocales: r.enabledLocales };
  },
);

export const updateOrderingAction = action(
  z.object({
    restaurantId: rid,
    ordering: z.object({
      enabled: z.boolean(),
      acceptMode: z.enum(["manual", "auto"]),
      requireTable: z.boolean(),
      allowNotes: z.boolean(),
    }),
  }),
  async ({ restaurantId, ordering }) => {
    const ctx = await guard(restaurantId);
    if (ordering.enabled && !planHas(ctx.restaurant.plan, "ordering")) throw new AppError("featureNotInPlan");
    await patchSettings(restaurantId, { ordering });
    await audit({ restaurantId, userId: ctx.user.id, action: "settings.ordering", data: ordering });
    return null;
  },
);

export const updateTranslationSettingsAction = action(
  z.object({
    restaurantId: rid,
    translations: z.object({
      guestsSeeOnlyApproved: z.boolean(),
      autoApproveThreshold: z.number().min(3.5).max(5).nullable(),
    }),
  }),
  async ({ restaurantId, translations }) => {
    const ctx = await guard(restaurantId);
    const t = { ...translations, autoApproveThreshold: translations.autoApproveThreshold == null ? null : Math.round(translations.autoApproveThreshold * 10) / 10 };
    await patchSettings(restaurantId, { translations: t });
    await audit({ restaurantId, userId: ctx.user.id, action: "settings.translations", data: t });
    return null;
  },
);

export const exportMenuAction = action(z.object({ restaurantId: rid }), async ({ restaurantId }) => {
  const ctx = await guard(restaurantId);
  const data = await exportMenu(restaurantId);
  await audit({ restaurantId, userId: ctx.user.id, action: "settings.export" });
  return data;
});
