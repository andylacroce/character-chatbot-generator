"use client";

import React, { useMemo } from "react";
import AdminActivityChart from "./AdminActivityChart";

/** Daily counts of successful game starts, correct guesses, and run endings. */
export interface GameDailyActivityRow {
  day: string;
  started: number;
  correct: number;
  ended: number;
}

const GAME_LABELS = ["Runs started", "Correct guesses", "Runs ended"] as const;
const GAME_DAY_LABELS = ["started", "correct", "ended"] as const;

/** Presents game activity with the same chart controls and interaction as character activity. */
export default function GameActivityChart({ data }: { data: GameDailyActivityRow[] }) {
  const chartData = useMemo(
    () =>
      data.map((row) => ({
        day: row.day,
        validated: row.started,
        created: row.correct,
        avatarGenerated: row.ended,
      })),
    [data],
  );
  return (
    <AdminActivityChart
      data={chartData}
      labels={GAME_LABELS}
      dayLabels={GAME_DAY_LABELS}
      activityLabel="Game activity"
    />
  );
}
