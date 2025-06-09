/**
 * Downloads the chat transcript as a text file by calling the /api/transcript endpoint.
 * @param {Array<object>} messages - The array of chat messages to include in the transcript.
 * @returns {Promise<void>} Resolves when the download is triggered.
 * @throws {Error} If the transcript fetch fails.
 */
export async function downloadTranscript(messages: any[]) {
  if (!Array.isArray(messages)) {
    throw new Error("Transcript must be an array");
  }
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, "0");
  const datetime = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
  const friendlyTime = now.toLocaleString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
    timeZoneName: "short"
  });
  let response;
  try {
    response = await fetch("/api/transcript", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages, exportedAt: friendlyTime }),
    });
  } catch (err) {
    // Network error
    throw err;
  }
  if (!response.ok) throw new Error("Failed to fetch transcript");
  let blob;
  try {
    blob = await response.blob();
  } catch (err) {
    throw err;
  }
  const filename = `Chat Transcript ${datetime}.txt`;
  if (!window.URL || !window.URL.createObjectURL) throw new Error("window.URL.createObjectURL is not available");
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    if (window.URL && window.URL.revokeObjectURL) window.URL.revokeObjectURL(url);
    if (a.remove) a.remove();
  }, 100);
}
