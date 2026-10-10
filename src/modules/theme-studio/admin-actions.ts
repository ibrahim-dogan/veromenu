"use server";
/** Platform theme library (Admin → Themes). Platform admins only. */
import { z } from "zod";
import { action } from "@/core/http/action";
import { ForbiddenError } from "@/core/http/errors";
import { getCurrentUser } from "@/core/auth/session";
import { audit } from "@/core/audit";
import { sampleThemeView } from "@/modules/theme-engine";
import { seedStarterThemes } from "@/modules/theme-engine/service";
import { deleteLibraryTheme, getLibraryPackage, promoteToLibrary, renderPreviewHtml, updateLibraryTheme } from "./service";

async function admin() {
  const user = await getCurrentUser();
  if (!user?.isPlatformAdmin) throw new ForbiddenError();
  return user;
}

const tid = z.uuid();
const meta = { name: z.string().trim().min(1).max(80), description: z.string().trim().max(300).nullable() };

export const promoteThemeAction = action(z.object({ sourceThemeId: tid, ...meta }), async ({ sourceThemeId, name, description }) => {
  const user = await admin();
  const res = await promoteToLibrary({ sourceThemeId, name, description: description || null, userId: user.id });
  await audit({ userId: user.id, action: "admin.theme.promote", entityType: "theme", entityId: res.themeId, data: { from: sourceThemeId } });
  return res;
});

export const updateLibraryThemeAction = action(z.object({ themeId: tid, ...meta }), async ({ themeId, name, description }) => {
  const user = await admin();
  await updateLibraryTheme(themeId, { name, description: description || null });
  await audit({ userId: user.id, action: "admin.theme.update", entityType: "theme", entityId: themeId, data: { name } });
  return { themeId };
});

export const deleteLibraryThemeAction = action(z.object({ themeId: tid }), async ({ themeId }) => {
  const user = await admin();
  await deleteLibraryTheme(themeId);
  await audit({ userId: user.id, action: "admin.theme.delete", entityType: "theme", entityId: themeId });
  return { themeId };
});

export const seedStartersAction = action(z.object({}), async () => {
  const user = await admin();
  const res = await seedStarterThemes();
  await audit({ userId: user.id, action: "admin.theme.seed", data: res });
  return { added: res.created, updated: res.updated };
});

export const adminPreviewAction = action(z.object({ themeId: tid }), async ({ themeId }) => {
  await admin();
  const { pkg } = await getLibraryPackage(themeId);
  return { html: await renderPreviewHtml(pkg, sampleThemeView(), {}) };
});
