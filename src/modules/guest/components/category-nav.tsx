"use client";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/core/utils";
import { useGuest } from "./runtime";

/**
 * Sticky category navigation with scrollspy. Server-rendered sections must carry
 * `id="cat-<id>"` + `data-vm-cat="<id>"` (see blocks.tsx → categoryAttrs). Themes restyle via class props.
 */
export function CategoryNav({
  categories,
  className,
  listClassName,
  linkClassName,
  activeClassName,
  inactiveClassName,
}: {
  categories: { id: string; name: string }[];
  className?: string;
  listClassName?: string;
  linkClassName?: string;
  activeClassName?: string;
  inactiveClassName?: string;
}) {
  const { t, beacon } = useGuest();
  const [active, setActive] = useState<string | null>(categories[0]?.id ?? null);
  const [visible, setVisible] = useState<Set<string> | null>(null);
  const seen = useRef(new Set<string>());
  const listRef = useRef<HTMLUListElement>(null);
  const clickLock = useRef(0);

  useEffect(() => {
    const sections = Array.from(document.querySelectorAll<HTMLElement>("[data-vm-cat]"));
    if (!sections.length || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const id = (e.target as HTMLElement).dataset.vmCat!;
          if (!seen.current.has(id)) {
            seen.current.add(id);
            beacon("category_view", { categoryId: id });
          }
          if (Date.now() > clickLock.current) setActive(id);
        }
      },
      { rootMargin: "-30% 0px -60% 0px" },
    );
    sections.forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, [beacon]);

  useEffect(() => {
    function onFilter(e: Event) {
      const ids = (e as CustomEvent<{ visibleCats: string[] | null }>).detail?.visibleCats;
      setVisible(ids ? new Set(ids) : null);
    }
    document.addEventListener("vm:filter", onFilter);
    return () => document.removeEventListener("vm:filter", onFilter);
  }, []);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-nav-cat="${active}"]`);
    if (el && listRef.current) {
      const box = listRef.current;
      const target = el.offsetLeft - box.clientWidth / 2 + el.clientWidth / 2;
      // RTL scroll containers use negative scrollLeft in modern browsers
      if (getComputedStyle(box).direction === "rtl") box.scrollLeft = target - (box.scrollWidth - box.clientWidth);
      else box.scrollLeft = target;
    }
  }, [active]);

  if (categories.length < 2) return null;
  return (
    <nav aria-label={t("categories")} className={cn("sticky top-0 z-30", className)}>
      <ul ref={listRef} className={cn("vm-noscrollbar relative flex gap-2 overflow-x-auto", listClassName)}>
        {categories.map((c) => (
          <li key={c.id} data-nav-cat={c.id} hidden={visible ? !visible.has(c.id) : false} className="shrink-0">
            <a
              href={`#cat-${c.id}`}
              aria-current={active === c.id ? "true" : undefined}
              onClick={() => {
                setActive(c.id);
                clickLock.current = Date.now() + 900;
              }}
              className={cn("block whitespace-nowrap", linkClassName, active === c.id ? activeClassName : inactiveClassName)}
            >
              {c.name}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
