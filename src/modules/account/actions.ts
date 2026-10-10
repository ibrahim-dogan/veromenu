"use server";
import { z } from "zod";
import { and, eq, ne } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/core/db";
import { sessions, users } from "@/core/db/schema";
import { action, AppError } from "@/core/http/action";
import { getCurrentUser, SESSION_COOKIE } from "@/core/auth/session";
import { hashPassword, verifyPassword } from "@/core/auth/password";
import { sha256 } from "@/core/crypto";
import { audit } from "@/core/audit";

async function me() {
  const user = await getCurrentUser();
  if (!user) throw new AppError("forbidden");
  return user;
}
async function currentSessionId() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? sha256(token) : "";
}

export const updateProfile = action(
  z.object({ name: z.string().trim().min(1).max(100), locale: z.enum(["de", "en", "tr"]) }),
  async ({ name, locale }) => {
    const user = await me();
    await db.update(users).set({ name, locale }).where(eq(users.id, user.id));
    return null;
  },
);

/** Changes the password and signs out every other device. */
export const changePassword = action(
  z.object({ currentPassword: z.string().min(1).max(200), newPassword: z.string().min(8, "weakPassword").max(200) }),
  async ({ currentPassword, newPassword }) => {
    const user = await me();
    if (!(await verifyPassword(user.passwordHash, currentPassword))) throw new AppError("invalidCredentials");
    await db.update(users).set({ passwordHash: await hashPassword(newPassword) }).where(eq(users.id, user.id));
    await db.delete(sessions).where(and(eq(sessions.userId, user.id), ne(sessions.id, await currentSessionId())));
    await audit({ userId: user.id, action: "user.password_change" });
    return null;
  },
);

export const signOutOtherSessions = action(z.object({}), async () => {
  const user = await me();
  await db.delete(sessions).where(and(eq(sessions.userId, user.id), ne(sessions.id, await currentSessionId())));
  return null;
});
