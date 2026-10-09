/** Quick connectivity check for the configured AI routing: pnpm ai:smoke */
import { z } from "zod";
import { aiJson } from "@/core/ai";
import { sql } from "@/core/db";

async function main() {
  const r = await aiJson(
    "translate",
    { messages: [{ role: "user", content: 'Translate the German dish "Schweinebraten mit Knödeln" to English and Turkish.' }] },
    z.object({ en: z.string(), tr: z.string() }),
    { restaurantId: null },
  );
  console.log(r.model, r.data, r.usage);
  await sql.end();
}
main().catch(async (e) => {
  console.error(e);
  await sql.end();
  process.exit(1);
});
