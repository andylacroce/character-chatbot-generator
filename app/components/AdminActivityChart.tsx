"use client";

import React, { useMemo, useState } from "react";
import styles from "./styles/AdminActivityChart.module.css";

/** One day's counts of the three tracked product-usage event types. */
export interface DailyActivityRow {
  day: string;
  validated: number;
  created: number;
  avatarGenerated: number;
}

const RANGE_OPTIONS = [7, 30, 90] as const;
type RangeDays = (typeof RANGE_OPTIONS)[number];

const SERIES = [
  { key: "validated" as const, label: "Names validated", colorVar: "var(--series-validated)" },
  { key: "created" as const, label: "Characters created", colorVar: "var(--series-created)" },
  { key: "avatarGenerated" as const, label: "Avatars generated", colorVar: "var(--series-avatar)" },
];

const VIEW_W = 640;
const VIEW_H = 220;
const PAD = { top: 12, right: 12, bottom: 24, left: 32 };
const PLOT_W = VIEW_W - PAD.left - PAD.right;
const PLOT_H = VIEW_H - PAD.top - PAD.bottom;

/** Rounds a max value up to a visually clean axis ceiling (1/2/5 * 10^n). */
function niceCeil(max: number): number {
  if (max <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(max));
  const normalized = max / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

/** Fills gaps in sparse per-day rows so the last `days` calendar days all render, zero-filled. */
function buildDenseSeries(data: DailyActivityRow[], days: number): DailyActivityRow[] {
  const byDay = new Map(data.map((row) => [row.day, row]));
  const result: DailyActivityRow[] = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    const day = d.toISOString().slice(0, 10);
    result.push(byDay.get(day) ?? { day, validated: 0, created: 0, avatarGenerated: 0 });
  }
  return result;
}

/** Formats an ISO day string ("2026-09-11") as a short, locale-agnostic label. */
function formatDay(day: string): string {
  const [, month, date] = day.split("-");
  const monthNames = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return `${monthNames[Number(month) - 1]} ${Number(date)}`;
}

/**
 * Multi-line chart of daily product-usage activity (names validated, characters
 * created, avatars generated) with a 7/30/90-day range toggle, hover/focus
 * crosshair tooltip, and a collapsible table view carrying the same values for
 * keyboard users and anyone below the light-mode contrast floor on the aqua series.
 */
export default function AdminActivityChart({ data }: { data: DailyActivityRow[] }) {
  const [range, setRange] = useState<RangeDays>(30);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const rows = useMemo(() => buildDenseSeries(data, range), [data, range]);
  const n = rows.length;

  const yMax = useMemo(
    () =>
      niceCeil(Math.max(1, ...rows.flatMap((r) => [r.validated, r.created, r.avatarGenerated]))),
    [rows],
  );

  const xForIndex = (i: number) => PAD.left + (n > 1 ? (i * PLOT_W) / (n - 1) : PLOT_W / 2);
  const yForValue = (v: number) => PAD.top + PLOT_H - (v / yMax) * PLOT_H;

  const linePath = (key: "validated" | "created" | "avatarGenerated") =>
    rows.map((row, i) => `${i === 0 ? "M" : "L"}${xForIndex(i)},${yForValue(row[key])}`).join(" ");

  const hasAnyActivity = rows.some((r) => r.validated + r.created + r.avatarGenerated > 0);
  const hovered = hoverIndex !== null ? rows[hoverIndex] : null;
  const tooltipLeftPct =
    hoverIndex !== null ? Math.min(92, Math.max(8, (xForIndex(hoverIndex) / VIEW_W) * 100)) : 0;

  const yTicks = [0, yMax / 2, yMax];

  return (
    <div className={styles.root}>
      <div className={styles.headerRow}>
        <div className={styles.rangeToggle} role="group" aria-label="Date range">
          {RANGE_OPTIONS.map((opt) => (
            <button
              key={opt}
              type="button"
              className={`${styles.rangeButton} ${range === opt ? styles.rangeButtonActive : ""}`}
              aria-pressed={range === opt}
              onClick={() => {
                setRange(opt);
                setHoverIndex(null);
              }}
            >
              {opt}d
            </button>
          ))}
        </div>
      </div>

      {!hasAnyActivity ? (
        <p className={styles.emptyState}>No activity recorded in this range yet.</p>
      ) : (
        <div className={styles.chartWrap} onMouseLeave={() => setHoverIndex(null)}>
          <svg
            className={styles.svg}
            viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
            role="img"
            aria-label={`Daily activity over the last ${range} days`}
          >
            {yTicks.map((tick) => (
              <g key={tick}>
                <line
                  className={tick === 0 ? styles.baseline : styles.gridLine}
                  x1={PAD.left}
                  x2={VIEW_W - PAD.right}
                  y1={yForValue(tick)}
                  y2={yForValue(tick)}
                />
                <text
                  className={styles.tick}
                  x={PAD.left - 6}
                  y={yForValue(tick) + 3}
                  textAnchor="end"
                >
                  {Math.round(tick)}
                </text>
              </g>
            ))}

            <text className={styles.tick} x={xForIndex(0)} y={VIEW_H - 4} textAnchor="start">
              {formatDay(rows[0].day)}
            </text>
            {n > 2 && (
              <text
                className={styles.tick}
                x={xForIndex(Math.floor((n - 1) / 2))}
                y={VIEW_H - 4}
                textAnchor="middle"
              >
                {formatDay(rows[Math.floor((n - 1) / 2)].day)}
              </text>
            )}
            <text className={styles.tick} x={xForIndex(n - 1)} y={VIEW_H - 4} textAnchor="end">
              {formatDay(rows[n - 1].day)}
            </text>

            {SERIES.map((series) => (
              <path
                key={series.key}
                className={styles.seriesLine}
                style={{ stroke: series.colorVar }}
                d={linePath(series.key)}
              />
            ))}

            {hoverIndex !== null && (
              <>
                <line
                  className={styles.crosshair}
                  x1={xForIndex(hoverIndex)}
                  x2={xForIndex(hoverIndex)}
                  y1={PAD.top}
                  y2={VIEW_H - PAD.bottom}
                />
                {SERIES.map((series) => (
                  <circle
                    key={series.key}
                    className={styles.dot}
                    style={{ fill: series.colorVar }}
                    cx={xForIndex(hoverIndex)}
                    cy={yForValue(rows[hoverIndex][series.key])}
                    r={4}
                  />
                ))}
              </>
            )}

            {rows.map((row, i) => {
              const bandW = n > 1 ? PLOT_W / (n - 1) : PLOT_W;
              return (
                <rect
                  key={row.day}
                  className={styles.hitColumn}
                  x={xForIndex(i) - bandW / 2}
                  y={PAD.top}
                  width={bandW}
                  height={PLOT_H}
                  tabIndex={0}
                  role="img"
                  aria-label={`${formatDay(row.day)}: ${row.validated} validated, ${row.created} created, ${row.avatarGenerated} avatars generated`}
                  onMouseEnter={() => setHoverIndex(i)}
                  onFocus={() => setHoverIndex(i)}
                  onBlur={() => setHoverIndex(null)}
                />
              );
            })}
          </svg>

          {hovered && (
            <div className={styles.tooltip} style={{ left: `${tooltipLeftPct}%` }}>
              <div className={styles.tooltipDate}>{formatDay(hovered.day)}</div>
              {SERIES.map((series) => (
                <div className={styles.tooltipRow} key={series.key}>
                  <span className={styles.tooltipKey} style={{ background: series.colorVar }} />
                  <span className={styles.tooltipLabel}>{series.label}</span>
                  <span className={styles.tooltipValue}>{hovered[series.key]}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className={styles.legend}>
        {SERIES.map((series) => (
          <span className={styles.legendItem} key={series.key}>
            <span className={styles.legendKey} style={{ background: series.colorVar }} />
            {series.label}
          </span>
        ))}
      </div>

      <details className={styles.tableToggle}>
        <summary>View as table</summary>
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Date</th>
                {SERIES.map((series) => (
                  <th key={series.key}>{series.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...rows].reverse().map((row) => (
                <tr key={row.day}>
                  <td>{row.day}</td>
                  <td data-label={SERIES[0].label}>{row.validated}</td>
                  <td data-label={SERIES[1].label}>{row.created}</td>
                  <td data-label={SERIES[2].label}>{row.avatarGenerated}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
