"use client";
import { useFormatter, useTranslations } from "next-intl";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function SignupsChart({ data }: { data: { week: string; signups: number }[] }) {
  const t = useTranslations("admin.overview");
  const f = useFormatter();
  const label = (w: string) => f.dateTime(new Date(`${w}T12:00:00`), { day: "numeric", month: "short" });
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="#e7e5e4" strokeDasharray="3 3" />
          <XAxis dataKey="week" tickFormatter={label} tick={{ fontSize: 11, fill: "#78716c" }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
          <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#78716c" }} axisLine={false} tickLine={false} width={40} />
          <Tooltip
            cursor={{ fill: "rgba(39,81,60,0.06)" }}
            contentStyle={{ borderRadius: 10, border: "1px solid #e7e5e4", fontSize: 12 }}
            labelFormatter={(w) => t("weekOf", { date: label(String(w)) })}
            formatter={(v) => [v, t("signups")]}
          />
          <Bar dataKey="signups" fill="#27513c" radius={[6, 6, 0, 0]} maxBarSize={36} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
