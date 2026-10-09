import { getRestaurantContext } from "@/core/auth/guards";
import type { Permission } from "@/core/auth/permissions";
import { AppError } from "@/core/http/errors";
import { rateLimit } from "@/core/http/rate-limit";
import { audit } from "@/core/audit";
import { listMedia, MAX_UPLOAD_BYTES, storeUpload, toMediaDto, type MediaFilter } from "@/modules/media/service";

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "cache-control": "no-store" } });

async function ctxWithAny(rid: string, perms: Permission[]) {
  const ctx = await getRestaurantContext(rid);
  if (!ctx) return { error: json({ error: "unauthorized" }, 401) } as const;
  if (!perms.some((p) => ctx.can(p))) return { error: json({ error: "forbidden" }, 403) } as const;
  return { ctx } as const;
}

/** GET /api/restaurants/[rid]/media?type=image|pdf|any&kind=upload|ai_generated → { items: MediaDto[] } */
export async function GET(req: Request, { params }: RouteContext<"/api/restaurants/[rid]/media">) {
  const { rid } = await params;
  const r = await ctxWithAny(rid, ["menu.view", "menu.edit", "media.manage", "settings.manage"]);
  if ("error" in r) return r.error;
  const url = new URL(req.url);
  const typeParam = url.searchParams.get("type");
  const type: MediaFilter = typeParam === "image" || typeParam === "pdf" ? typeParam : "any";
  const kindParam = url.searchParams.get("kind");
  const kind = kindParam === "upload" || kindParam === "ai_generated" ? kindParam : undefined;
  const rows = await listMedia(rid, { type, kind });
  return json({ items: rows.map(toMediaDto) });
}

/** POST multipart (field "file", optional "alt") → 201 { id, url, variants, ...MediaDto } */
export async function POST(req: Request, { params }: RouteContext<"/api/restaurants/[rid]/media">) {
  const { rid } = await params;
  const r = await ctxWithAny(rid, ["media.manage", "menu.edit"]);
  if ("error" in r) return r.error;
  const { ctx } = r;
  if (!rateLimit(`media-upload:${ctx.user.id}`, 120, 10 * 60_000)) return json({ error: "rateLimited" }, 429);

  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_UPLOAD_BYTES + 64 * 1024) return json({ error: "tooLarge" }, 413);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json({ error: "invalid" }, 400);
  }
  const file = form.get("file");
  if (!(file instanceof File)) return json({ error: "invalid" }, 400);
  if (file.size > MAX_UPLOAD_BYTES) return json({ error: "tooLarge" }, 413);
  const altRaw = form.get("alt");
  const alt = typeof altRaw === "string" && altRaw.trim() ? altRaw.trim().slice(0, 300) : null;

  try {
    const m = await storeUpload({
      restaurantId: rid,
      userId: ctx.user.id,
      data: Buffer.from(await file.arrayBuffer()),
      mime: file.type,
      alt,
    });
    await audit({ restaurantId: rid, userId: ctx.user.id, action: "media.upload", entityType: "media", entityId: m.id, data: { mime: m.mime, size: m.sizeBytes } });
    return json(toMediaDto(m), 201);
  } catch (e) {
    if (e instanceof AppError) return json({ error: e.detail === "mime" ? "unsupportedType" : "invalid" }, 400);
    console.error("[media upload]", e);
    return json({ error: "unexpected" }, 500);
  }
}
