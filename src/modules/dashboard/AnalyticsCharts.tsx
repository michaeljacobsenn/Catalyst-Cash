  import { useMemo,useState } from "react";
  import { Area,AreaChart,ResponsiveContainer,Tooltip,XAxis,YAxis } from "recharts";
  import { T } from "../constants.js";
  import ErrorBoundary from "../ErrorBoundary.js";
  import { haptic } from "../haptics.js";
  import { Card,Label } from "../ui.js";
  import { fmt } from "../utils.js";

export default function AnalyticsCharts({ chartData, scoreData, spendData, chartA11y }) {
  const [chartTab, setChartTab] = useState("networth");
  const chartMeta = useMemo(() => {
    const buildMeta = (points, mode) => {
      const current = points?.[points.length - 1];
      const previous = points?.[points.length - 2];
      const currentValue =
        mode === "health"
          ? `${current?.score || 0}/100`
          : mode === "spending"
            ? fmt(current?.spent || 0)
            : fmt(current?.nw || 0);
      const prevNumber =
        mode === "health" ? Number(previous?.score || 0)
          : mode === "spending" ? Number(previous?.spent || 0)
            : Number(previous?.nw || 0);
      const currentNumber =
        mode === "health" ? Number(current?.score || 0)
          : mode === "spending" ? Number(current?.spent || 0)
            : Number(current?.nw || 0);
      const delta = currentNumber - prevNumber;
      const trendLabel =
        mode === "health"
          ? `${delta >= 0 ? "+" : ""}${Math.round(delta)} pts`
          : `${delta >= 0 ? "+" : "-"}${fmt(Math.abs(delta))}`;
      return {
        currentValue,
        trendLabel,
        positive: delta >= 0,
        dateLabel: current?.date || "Latest",
      };
    };

    return {
      networth: buildMeta(chartData || [], "networth"),
      health: buildMeta(scoreData || [], "health"),
      spending: buildMeta(spendData || [], "spending"),
    };
  }, [chartData, scoreData, spendData]);

  if ((chartData?.length || 0) <= 1 && (scoreData?.length || 0) <= 1 && (spendData?.length || 0) <= 1) return null;

  return (
    <ErrorBoundary name="Analytics Charts">
      <Card animate delay={400} style={{ background: T.bg.card, border: `1px solid ${T.border.subtle}` }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <Label style={{ margin: 0 }}>Analytics</Label>
          <div
            role="tablist"
            aria-label="Analytics chart type"
            style={{
              display: "flex",
              gap: 6,
              background: T.bg.elevated,
              padding: 4,
              borderRadius: 20,
              border: `1px solid ${T.border.subtle}`,
            }}
          >
            {[
              { id: "networth", label: "Net Worth", show: chartData.length > 1 },
              { id: "health", label: "Health", show: scoreData.length > 1 },
              { id: "spending", label: "Spending", show: spendData.length > 1 },
            ]
              .filter(t => t.show)
              .map(tab => (
                <button
                  key={tab.id}
                  role="tab"
                  aria-selected={chartTab === tab.id}
                  className={`chart-tab a11y-hit-target ${chartTab === tab.id ? "chart-tab-active" : "chart-tab-inactive"}`}
                  onClick={() => {
                    haptic.selection();
                    setChartTab(tab.id);
                  }}
                >
                  {tab.label}
                </button>
              ))}
          </div>
        </div>

        <div
          className="stagger-container"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            gap: 8,
            marginBottom: 14,
          }}
        >
          {[
            {
              label: "Net Worth",
              value: chartData?.length ? chartMeta.networth.currentValue : "N/A",
              trend: chartMeta.networth.trendLabel,
              dateLabel: chartMeta.networth.dateLabel,
              positive: chartMeta.networth.positive,
              active: chartTab === "networth",
            },
            {
              label: "Health",
              value: scoreData?.length ? chartMeta.health.currentValue : "N/A",
              trend: chartMeta.health.trendLabel,
              dateLabel: chartMeta.health.dateLabel,
              positive: chartMeta.health.positive,
              active: chartTab === "health",
            },
            {
              label: "Spend",
              value: spendData?.length ? chartMeta.spending.currentValue : "N/A",
              trend: chartMeta.spending.trendLabel,
              dateLabel: chartMeta.spending.dateLabel,
              positive: !chartMeta.spending.positive,
              active: chartTab === "spending",
            },
          ].map((item) => (
            <div
              key={item.label}
              style={{
                padding: "11px 11px 10px",
                borderRadius: 16,
                background: item.active ? T.bg.elevated : T.bg.surface,
                border: `1px solid ${item.active ? T.accent.primarySoft : T.border.subtle}`,
                transition: "border-color .22s ease, background .22s ease",
              }}
            >
              <div style={{ fontSize: 9, fontWeight: 800, color: T.text.dim, letterSpacing: "0.05em", textTransform: "uppercase", fontFamily: T.font.mono }}>
                {item.label}
              </div>
              <div style={{ marginTop: 4, fontSize: 12, fontWeight: 800, color: item.active ? T.text.primary : T.text.secondary, fontFamily: T.font.mono }}>
                {item.value}
              </div>
              <div style={{ marginTop: 6, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                <span
                  style={{
                    padding: "3px 6px",
                    borderRadius: 999,
                    border: `1px solid ${item.positive ? `${T.status.green}2c` : `${T.status.red}2c`}`,
                    background: item.positive ? `${T.status.green}12` : `${T.status.red}10`,
                    color: item.positive ? T.status.green : T.status.red,
                    fontSize: 9,
                    fontWeight: 800,
                    fontFamily: T.font.mono,
                    letterSpacing: "0.02em",
                  }}
                >
                  {item.trend}
                </span>
                <span style={{ fontSize: 9, color: T.text.dim, fontFamily: T.font.mono }}>
                  {item.dateLabel}
                </span>
              </div>
            </div>
          ))}
        </div>

        {chartTab === "networth" && chartData.length > 1 && (
          <div
            key="chart-networth"
            role="img"
            aria-label={chartA11y.netWorthLabel}
            aria-describedby="networth-chart-hint"
            style={{ animation: "fadeInUp .3s ease-out both" }}
          >
            <span id="networth-chart-hint" className="sr-only">
              {chartA11y.netWorthHint}
            </span>
            <ResponsiveContainer width="100%" height={172} aria-hidden="true">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                <defs>
                  <linearGradient id="nwG" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={T.accent.primary} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={T.accent.primary} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: T.text.dim, fontFamily: T.font.mono }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis hide domain={["dataMin-200", "dataMax+200"]} />
                <Tooltip
                  contentStyle={{
                    background: T.bg.card,
                    border: `1px solid ${T.border.default}`,
                    borderRadius: T.radius.md,
                    fontSize: 11,
                    fontFamily: T.font.mono,
                    boxShadow: T.shadow.elevated,
                  }}
                  formatter={v => [fmt(v), "Net Worth"]}
                />
                <Area
                  type="monotone"
                  dataKey="nw"
                  stroke={T.accent.primary}
                  strokeWidth={2.5}
                  fill="url(#nwG)"
                  baseValue="dataMin"
                  dot={{ fill: T.accent.primary, r: 3, strokeWidth: 0 }}
                  activeDot={{ r: 5, fill: T.accent.primary, stroke: "#fff", strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}

        {chartTab === "health" && scoreData.length > 1 && (
          <div
            key="chart-health"
            role="img"
            aria-label={chartA11y.healthLabel}
            aria-describedby="health-chart-hint"
            style={{ animation: "fadeInUp .3s ease-out both" }}
          >
            <span id="health-chart-hint" className="sr-only">
              {chartA11y.healthHint}
            </span>
            <ResponsiveContainer width="100%" height={172} aria-hidden="true">
              <AreaChart data={scoreData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                <defs>
                  <linearGradient id="hsG" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={T.status.green} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={T.status.green} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: T.text.dim, fontFamily: T.font.mono }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis hide domain={[0, 100]} />
                <Tooltip
                  contentStyle={{
                    background: T.bg.card,
                    border: `1px solid ${T.border.default}`,
                    borderRadius: T.radius.md,
                    fontSize: 11,
                    fontFamily: T.font.mono,
                    boxShadow: T.shadow.elevated,
                  }}
                  formatter={(v, _n, props) => [`${v} /100 (${props.payload.grade})`, "Health Score"]}
                />
                <Area
                  type="monotone"
                  dataKey="score"
                  stroke={T.status.green}
                  strokeWidth={2.5}
                  fill="url(#hsG)"
                  dot={{ fill: T.status.green, r: 3, strokeWidth: 0 }}
                  activeDot={{ r: 5, fill: T.status.green, stroke: "#fff", strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}

        {chartTab === "spending" && spendData.length > 1 && (
          <div
            key="chart-spending"
            role="img"
            aria-label={chartA11y.spendingLabel}
            aria-describedby="spending-chart-hint"
            style={{ animation: "fadeInUp .3s ease-out both" }}
          >
            <span id="spending-chart-hint" className="sr-only">
              {chartA11y.spendingHint}
            </span>
            <ResponsiveContainer width="100%" height={172} aria-hidden="true">
              <AreaChart data={spendData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                <defs>
                  <linearGradient id="spG" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={T.status.amber} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={T.status.amber} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: T.text.dim, fontFamily: T.font.mono }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis hide domain={[0, "auto"]} />
                <Tooltip
                  contentStyle={{
                    background: T.bg.card,
                    border: `1px solid ${T.border.default}`,
                    borderRadius: T.radius.md,
                    fontSize: 11,
                    fontFamily: T.font.mono,
                    boxShadow: T.shadow.elevated,
                  }}
                  formatter={v => [fmt(v), "Weekly Spend"]}
                />
                <Area
                  type="monotone"
                  dataKey="spent"
                  stroke={T.status.amber}
                  strokeWidth={2.5}
                  fill="url(#spG)"
                  dot={{ fill: T.status.amber, r: 3, strokeWidth: 0 }}
                  activeDot={{ r: 5, fill: T.status.amber, stroke: "#fff", strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>
    </ErrorBoundary>
  );
}
