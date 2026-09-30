/**
 * "Guess Who": chat with a mystery character who never says its own name, guess who they
 * are from the clues they drop, and build a streak.
 * @module Guess Who route
 */

import GamePage from "../components/GamePage";

export const metadata = {
  title: "Guess Who — Portrayal",
  description: "Chat with a mystery character who never says its own name and guess who it is.",
};

export default function GuessWho() {
  return <GamePage gameId="guessWho" />;
}
