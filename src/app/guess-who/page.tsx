/**
 * "Guess Who": see progressively-revealing clues about a hidden character and guess
 * who they are, building a streak.
 * @module GuessWhoPage route
 */

import GuessWhoPage from "../components/GuessWhoPage";

export const metadata = {
  title: "Guess Who — Portrayal",
  description: "See progressively-revealing clues about a hidden character and guess who they are.",
};

export default function GuessWho() {
  return <GuessWhoPage />;
}
