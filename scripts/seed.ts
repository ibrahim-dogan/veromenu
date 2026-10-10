/**
 * Idempotent seed: first platform admin (ADMIN_EMAIL / ADMIN_PASSWORD) + default AI provider settings.
 * Run: pnpm db:seed
 */
import { eq } from "drizzle-orm";
import { db, sql } from "@/core/db";
import { users } from "@/core/db/schema";
import { hashPassword } from "@/core/auth/password";
import { seedAiDefaults } from "@/core/ai/seed";
import { seedStarterThemes } from "@/modules/theme-engine/service";

async function main() {
  const email = process.env.ADMIN_EMAIL?.toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (email && password) {
    const [u] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (!u) {
      await db.insert(users).values({
        email,
        name: "Platform Admin",
        passwordHash: await hashPassword(password),
        isPlatformAdmin: true,
        emailVerifiedAt: new Date(),
      });
      console.log(`✔ platform admin created: ${email}`);
    } else if (!u.isPlatformAdmin) {
      await db.update(users).set({ isPlatformAdmin: true }).where(eq(users.id, u.id));
      console.log(`✔ ${email} promoted to platform admin`);
    } else console.log(`• platform admin exists: ${email}`);
  }
  await seedAiDefaults();
  const themes = await seedStarterThemes();
  console.log(`✔ starter themes: ${themes.created} created, ${themes.updated} updated`);
  if (process.argv.includes("--demo")) {
    const { seedDemo } = await import("./seed-demo");
    await seedDemo();
  }
  await sql.end();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
