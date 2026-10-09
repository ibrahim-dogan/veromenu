import { storage } from "@/core/storage";

const TYPES: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", avif: "image/avif",
  heic: "image/heic", pdf: "application/pdf", svg: "image/svg+xml",
};

/** Serves stored media. Keys contain a random id, so URLs are unguessable and immutable. */
export async function GET(_req: Request, { params }: RouteContext<"/media/[...key]">) {
  const { key } = await params;
  const k = key.join("/");
  if (k.includes("..")) return new Response("bad request", { status: 400 });
  const buf = await storage().get(k);
  if (!buf) return new Response("not found", { status: 404 });
  const ext = k.split(".").pop()?.toLowerCase() ?? "";
  return new Response(new Uint8Array(buf), {
    headers: {
      "content-type": TYPES[ext] ?? "application/octet-stream",
      "cache-control": "public, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
    },
  });
}
