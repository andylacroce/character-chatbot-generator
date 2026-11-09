import {
  defaultExportTimestamp,
  isValidAvatarUrl,
  renderTranscriptHtml,
  transcriptFilename,
} from "../../src/utils/chat/transcriptHtml";

const base = {
  filename: "Transcript.html",
  displayTimestamp: "Nov 9, 2026",
  senderName: "Sam",
};

describe("renderTranscriptHtml", () => {
  it("renders a self-contained document with the filename as its title", () => {
    const html = renderTranscriptHtml({ ...base, messages: [] });
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("<title>Transcript.html</title>");
    expect(html).toContain("<style>");
    expect(html).toContain("Exported:</strong> Nov 9, 2026");
  });

  it("labels the visitor's lines with their name and the character's with the bot's", () => {
    const html = renderTranscriptHtml({
      ...base,
      bot: { name: "Ada Lovelace", avatarUrl: "/a.png" },
      messages: [
        { sender: "User", text: "hello" },
        { sender: "Ada Lovelace", text: "good day" },
      ],
    });
    expect(html).toContain('class="user-sender">Sam:');
    expect(html).toContain('class="bot-sender">Ada Lovelace:');
    expect(html).toContain('<img src="/a.png" alt="Ada Lovelace"');
  });

  it("omits the character header when there is no bot", () => {
    const html = renderTranscriptHtml({ ...base, messages: [{ sender: "Zeus", text: "hi" }] });
    expect(html).not.toContain('bot-header">');
    expect(html).toContain("Zeus:");
  });

  it("HTML-escapes every piece of user-supplied text", () => {
    const html = renderTranscriptHtml({
      filename: "t.html",
      displayTimestamp: "<script>alert(1)</script>",
      senderName: "<b>Sam</b>",
      bot: { name: '"><img src=x>', avatarUrl: "/a.png" },
      messages: [
        { sender: "User", text: "<script>alert(2)</script>" },
        { sender: "Bot", text: "<img onerror=alert(3)>" },
      ],
    });
    expect(html).not.toContain("<script>alert");
    expect(html).not.toContain("<img onerror");
    expect(html).not.toContain("<b>Sam</b>");
    expect(html).not.toContain('"><img src=x>');
  });

  it("drops an unsafe avatar URL but still shows the name", () => {
    const html = renderTranscriptHtml({
      ...base,
      bot: { name: "Ada", avatarUrl: "javascript:alert(1)" },
      messages: [],
    });
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("<img");
    expect(html).toContain("<h2>Ada</h2>");
  });
});

describe("isValidAvatarUrl", () => {
  it.each(["/silhouette.svg", "silhouette.svg", "https://x.test/a.png", "http://x.test/a.png"])(
    "allows %s",
    (url) => expect(isValidAvatarUrl(url)).toBe(true),
  );

  it("allows raster data URLs but not SVG or script schemes", () => {
    expect(isValidAvatarUrl("data:image/png;base64,AAAA")).toBe(true);
    expect(isValidAvatarUrl("data:image/svg+xml;base64,AAAA")).toBe(false);
    expect(isValidAvatarUrl("javascript:alert(1)")).toBe(false);
    expect(isValidAvatarUrl("ftp://x.test/a.png")).toBe(false);
  });

  it("rejects empty and non-string values", () => {
    expect(isValidAvatarUrl("")).toBe(false);
    expect(isValidAvatarUrl(undefined as unknown as string)).toBe(false);
  });
});

describe("transcriptFilename and defaultExportTimestamp", () => {
  it("stamps the filename with the local date and time", () => {
    const name = transcriptFilename(new Date(2026, 10, 9, 14, 5, 7));
    expect(name).toBe("Character Chat Transcript 2026-11-09_14-05-07.html");
  });

  it("formats a human-readable export time", () => {
    expect(defaultExportTimestamp(new Date(2026, 10, 9, 14, 5, 7))).toMatch(/2026/);
  });
});
