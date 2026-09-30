/**
 * The "Guess Who's Next" guessing game: chat with a named character who steers the
 * conversation toward a different, hidden figure to guess. A correct guess reveals
 * them as the new chat partner, continuing the streak.
 * @module Guess Who's Next route
 */

import GamePage from "../components/GamePage";

export const metadata = {
  title: "Guess Who's Next — Portrayal",
  description: "Chat with a named character who's steering toward someone else — guess who's next.",
};

export default function GuessWhoNext() {
  return <GamePage gameId="guessWhoNext" />;
}
