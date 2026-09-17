/**
 * The guessing game: chat with a hidden character, gather clues, and guess who they
 * are to build a streak.
 * @module GamePage route
 */

import GamePage from "../components/GamePage";

export const metadata = {
  title: "Guess Who — Portrayal",
  description: "Chat with a hidden character, gather clues, and guess who they are.",
};

export default function Game() {
  return <GamePage />;
}
