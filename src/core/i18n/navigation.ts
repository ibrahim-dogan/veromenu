import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

/** Locale-aware Link / redirect / useRouter. Use these instead of next/link inside [locale] routes. */
export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);
