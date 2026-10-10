import { getPrintStarterPackages, listPrintDesigns } from "@/modules/theme-engine/service";
import { studioRoute } from "@/modules/theme-studio/http";

/**
 * GET /api/restaurants/[rid]/themes/print-templates → print designs of the platform library (with packages, rendered
 * client-side as previews) – or the shipped print starters while the library is not seeded yet.
 */
export async function GET(_req: Request, { params }: RouteContext<"/api/restaurants/[rid]/themes/print-templates">) {
  const { rid } = await params;
  return studioRoute(
    rid,
    async (ctx) => {
      const locale = ctx.restaurant.defaultLocale;
      const { library } = await listPrintDesigns(rid);
      if (library.length)
        return library.map((d) => ({ id: d.theme.id, starterKey: null, name: d.theme.name, description: d.theme.description, pkg: d.pkg }));
      return (await getPrintStarterPackages()).map((s) => ({ id: null, starterKey: s.key, name: s.name, description: s.description[locale] ?? s.description.de ?? null, pkg: s.pkg }));
    },
    "print",
  );
}
