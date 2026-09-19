/** Public guessing-game leaderboard page. */

import LeaderboardPage from "../components/LeaderboardPage";

export const metadata = {
  title: "Leaderboard — Portrayal",
  description: "Top guessing-game streaks shared by players.",
};

export default function Page() {
  return <LeaderboardPage />;
}
