import { getTranslations } from "next-intl/server";
import { requireRestaurant } from "@/core/auth/guards";
import { Link } from "@/core/i18n/navigation";
import { buttonClass } from "@/components/ui";
import { planHas } from "@/modules/billing/plans";
import { canManageKind } from "@/modules/theme-studio/access";
import { KitOnboarding } from "@/modules/kit/components/kit-onboarding";
import { canStartKit, kitStepsFor } from "@/modules/kit/plan";
import { getLatestKitJobRow } from "@/modules/kit/runner";
import { getStoredSources, toKitDto } from "@/modules/kit/service";

export async function generateMetadata() {
  const t = await getTranslations("kit");
  return { title: t("metaTitle") };
}

/**
 * Guided start (also right after registration): upload the printed menu once → menu import, logo and – with
 * Starter/Pro – menu theme + print design, then one review screen. `?new=1` starts a new upload.
 */
export default async function OnboardingPage({ params, searchParams }: PageProps<"/[locale]/dashboard/[rid]/onboarding">) {
  const { rid } = await params;
  const sp = await searchParams;
  const ctx = await requireRestaurant(rid);
  const t = await getTranslations("kit");
  const r = ctx.restaurant;

  if (!canStartKit(ctx)) {
    return (
      <div className="mx-auto max-w-xl space-y-4 rounded-xl border border-stone-200 bg-white px-6 py-10 text-center">
        <p className="text-sm text-stone-600">{t("noPermission")}</p>
        <Link href={`/dashboard/${rid}`} className={buttonClass("secondary")}>
          {t("progress.leave")}
        </Link>
      </div>
    );
  }

  const [job, stored] = await Promise.all([getLatestKitJobRow(rid), getStoredSources(rid).catch(() => ({ files: [], hasBrief: false }))]);
  const firstName = (ctx.user.name || "").trim().split(/\s+/)[0] || null;

  return (
    <div className="mx-auto max-w-5xl">
      <KitOnboarding
        restaurantId={rid}
        restaurantSlug={r.slug}
        firstName={firstName}
        initialJob={job ? await toKitDto(job, r) : null}
        startFresh={sp.new === "1"}
        designs={planHas(r.plan, "theme_studio")}
        steps={kitStepsFor(ctx)}
        stored={stored.files}
        perms={{ theme: canManageKind(ctx, "menu"), print: canManageKind(ctx, "print"), logo: ctx.can("settings.manage") }}
      />
    </div>
  );
}
