/** A signed-in user's saved characters, each resumable into its chat. */

import HistoryPage from "../components/HistoryPage";

export const metadata = {
  title: "Past Chats — Portrayal",
  description: "Pick up a conversation with one of your saved characters.",
};

export default function Page() {
  return <HistoryPage />;
}
