"use server";
import { z } from "zod";
import { and, eq, gt, isNull } from "drizzle-orm";
import { headers } from "next/headers";
import { getLocale } from "next-intl/server";
import { db } from "@/core/db";
import { invitations, memberships, restaurants, userTokens, users } from "@/core/db/schema";
import { action, AppError } from "@/core/http/action";
import { hashPassword, verifyPassword } from "@/core/auth/password";
import { createSession, destroyAllSessions, destroySession, getCurrentUser } from "@/core/auth/session";
import { randomToken, sha256 } from "@/core/crypto";
import { clientIp, rateLimit } from "@/core/http/rate-limit";
import { sendMail } from "@/core/mail";
import { env } from "@/core/env";
import { createRestaurant } from "@/modules/tenancy/service";
import { audit } from "@/core/audit";

const email = z.string().trim().toLowerCase().email().max(200);
const password = z.string().min(8, "weakPassword").max(200);

async function limit(key: string, n = 10) {
  const ip = clientIp(await headers());
  if (!rateLimit(`${key}:${ip}`, n, 15 * 60_000)) throw new AppError("rateLimited");
}

async function localePath(path: string) {
  const locale = await getLocale();
  return `${env().APP_URL}${locale === "de" ? "" : `/${locale}`}${path}`;
}

async function issueToken(userId: string, type: "verify_email" | "reset_password", hours: number) {
  const token = randomToken(32);
  await db.insert(userTokens).values({ id: sha256(token), userId, type, expiresAt: new Date(Date.now() + hours * 36e5) });
  return token;
}

async function sendVerification(userId: string, to: string) {
  const token = await issueToken(userId, "verify_email", 72);
  const link = await localePath(`/verify-email?token=${token}`);
  await sendMail(to, "VeroMenu – E-Mail bestätigen", `Bitte bestätige deine E-Mail-Adresse:\n${link}\n\nPlease confirm your email address.`);
}

export const register = action(
  z.object({
    name: z.string().trim().min(1).max(100),
    email,
    password,
    restaurantName: z.string().trim().min(2).max(100),
    acceptTerms: z.literal(true),
  }),
  async (input) => {
    await limit("register", 5);
    const [exists] = await db.select({ id: users.id }).from(users).where(eq(users.email, input.email)).limit(1);
    if (exists) throw new AppError("emailTaken");
    const locale = await getLocale();
    const [user] = await db
      .insert(users)
      .values({ email: input.email, name: input.name, passwordHash: await hashPassword(input.password), locale })
      .returning();
    const restaurant = await createRestaurant({ name: input.restaurantName, ownerUserId: user.id, createdBy: user.id, uiLocale: locale });
    await sendVerification(user.id, user.email);
    await createSession(user.id);
    return { restaurantId: restaurant.id };
  },
);

export const login = action(z.object({ email, password: z.string().min(1).max(200) }), async (input) => {
  await limit("login", 10);
  const [user] = await db.select().from(users).where(eq(users.email, input.email)).limit(1);
  // Always run a hash verification to avoid user enumeration via timing.
  const ok = await verifyPassword(user?.passwordHash ?? "$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHQ$ZmFrZWhhc2g", input.password);
  if (!user || !ok) throw new AppError("invalidCredentials");
  if (user.disabledAt) throw new AppError("accountDisabled");
  await createSession(user.id);
  return { isPlatformAdmin: user.isPlatformAdmin };
});

export async function logout() {
  await destroySession();
}

export const requestPasswordReset = action(z.object({ email }), async ({ email: mail }) => {
  await limit("reset", 5);
  const [user] = await db.select().from(users).where(eq(users.email, mail)).limit(1);
  if (user && !user.disabledAt) {
    const token = await issueToken(user.id, "reset_password", 2);
    const link = await localePath(`/reset-password?token=${token}`);
    await sendMail(user.email, "VeroMenu – Passwort zurücksetzen", `Neues Passwort festlegen:\n${link}\n\nReset your password:\n${link}`);
  }
  return null;
});

async function consumeToken(token: string, type: "verify_email" | "reset_password") {
  const [row] = await db
    .update(userTokens)
    .set({ usedAt: new Date() })
    .where(and(eq(userTokens.id, sha256(token)), eq(userTokens.type, type), isNull(userTokens.usedAt), gt(userTokens.expiresAt, new Date())))
    .returning();
  return row ?? null;
}

export const resetPassword = action(z.object({ token: z.string().min(10), password }), async (input) => {
  const row = await consumeToken(input.token, "reset_password");
  if (!row) throw new AppError("tokenInvalid");
  await db.update(users).set({ passwordHash: await hashPassword(input.password) }).where(eq(users.id, row.userId));
  await destroyAllSessions(row.userId);
  await audit({ userId: row.userId, action: "user.password_reset" });
  return null;
});

/** Called from the verify-email page (server component). */
export async function verifyEmailToken(token: string) {
  const row = await consumeToken(token, "verify_email");
  if (!row) return false;
  await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, row.userId));
  return true;
}

export const resendVerification = action(z.object({}), async () => {
  const user = await getCurrentUser();
  if (!user) throw new AppError("forbidden");
  await limit("resend", 3);
  if (!user.emailVerifiedAt) await sendVerification(user.id, user.email);
  return null;
});

/** Accept an invitation: existing logged-in user, or create the account on the fly. */
export const acceptInvitation = action(
  z.object({ token: z.string().min(10), name: z.string().trim().max(100).optional(), password: z.string().max(200).optional() }),
  async (input) => {
    const [inv] = await db
      .select()
      .from(invitations)
      .where(and(eq(invitations.tokenHash, sha256(input.token)), isNull(invitations.acceptedAt), gt(invitations.expiresAt, new Date())))
      .limit(1);
    if (!inv) throw new AppError("tokenInvalid");
    let user = await getCurrentUser();
    if (!user) {
      const [existing] = await db.select().from(users).where(eq(users.email, inv.email)).limit(1);
      if (existing) {
        if (!input.password || !(await verifyPassword(existing.passwordHash, input.password))) throw new AppError("invalidCredentials");
        user = existing;
      } else {
        if (!input.password || input.password.length < 8) throw new AppError("weakPassword");
        [user] = await db
          .insert(users)
          .values({
            email: inv.email,
            name: input.name ?? "",
            passwordHash: await hashPassword(input.password),
            emailVerifiedAt: new Date(), // invitation link proves the address
            locale: await getLocale(),
          })
          .returning();
      }
      await createSession(user.id);
    }
    await db
      .insert(memberships)
      .values({ restaurantId: inv.restaurantId, userId: user.id, roleId: inv.roleId })
      .onConflictDoUpdate({ target: [memberships.restaurantId, memberships.userId], set: { roleId: inv.roleId } });
    await db.update(invitations).set({ acceptedAt: new Date() }).where(eq(invitations.id, inv.id));
    await audit({ restaurantId: inv.restaurantId, userId: user.id, action: "team.invitation_accepted", data: { email: inv.email } });
    return { restaurantId: inv.restaurantId };
  },
);

export async function getInvitationInfo(token: string) {
  const [row] = await db
    .select({ email: invitations.email, restaurant: restaurants.name })
    .from(invitations)
    .innerJoin(restaurants, eq(restaurants.id, invitations.restaurantId))
    .where(and(eq(invitations.tokenHash, sha256(token)), isNull(invitations.acceptedAt), gt(invitations.expiresAt, new Date())))
    .limit(1);
  if (!row) return null;
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, row.email)).limit(1);
  return { ...row, hasAccount: !!existing };
}

export const createRestaurantForMe = action(z.object({ name: z.string().trim().min(2).max(100) }), async ({ name }) => {
  const user = await getCurrentUser();
  if (!user) throw new AppError("forbidden");
  const r = await createRestaurant({ name, ownerUserId: user.id, createdBy: user.id, uiLocale: await getLocale() });
  return { restaurantId: r.id };
});

export const updateMyLocale = action(z.object({ locale: z.enum(["de", "en", "tr"]) }), async ({ locale }) => {
  const user = await getCurrentUser();
  if (user) await db.update(users).set({ locale }).where(eq(users.id, user.id));
  return null;
});
