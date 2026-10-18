/**
 * Producer/consumer contract for chat audio: what `synthesizeReplyAudio` writes must be exactly
 * what `/api/audio` serves. Real helper, real route, real temp dir; only Google synthesis and
 * the Claude voice lookup are stubbed (the unit suites mock `fs`, so they can't see this seam).
 */
import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";
import type { NextApiRequest, NextApiResponse } from "next";

const AUDIO_BYTES = Buffer.from("fake-mp3-bytes");
const mockSynthesize = jest.fn(async ({ filePath }: { filePath: string }) => {
  fs.writeFileSync(filePath, AUDIO_BYTES);
});
jest.mock("../../src/utils/tts", () => ({
  synthesizeSpeechToFile: (...args: [{ filePath: string }]) => mockSynthesize(...args),
}));
jest.mock("../../src/utils/cache", () => ({ setReplyCache: jest.fn(), getReplyCache: jest.fn() }));
jest.mock("../../src/utils/characterVoices", () => ({ getVoiceConfigForCharacter: jest.fn() }));
jest.mock("../../src/utils/logger", () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  logEvent: jest.fn(),
  sanitizeLogMeta: (m: unknown) => m,
}));

import { synthesizeReplyAudio } from "../../src/utils/ttsReply";
import type { CharacterVoiceConfig } from "../../src/utils/characterVoices";

const handler = require("../../src/pages/api/audio").default as (
  req: NextApiRequest,
  res: NextApiResponse,
) => Promise<void>;

const VOICE = {
  languageCodes: ["en-GB"],
  name: "en-GB-Wavenet-D",
  ssmlGender: "MALE",
} as unknown as CharacterVoiceConfig;

// Unique per run so a leftover file in the shared temp dir can't satisfy a test by accident.
const runId = crypto.randomUUID();
const created = new Set<string>();

/** Parses the `/api/audio?...` URL into the query object Next would hand the route. */
function queryOf(url: string): Record<string, string> {
  return Object.fromEntries(new URL(url, "http://localhost").searchParams);
}

/** Calls the real audio route with the URL's query and returns the response mock. */
async function replay(url: string) {
  const res = { setHeader: jest.fn(), status: jest.fn(), json: jest.fn(), send: jest.fn() };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  const req = {
    method: "GET",
    headers: { "x-forwarded-for": `10.9.${Math.floor(Math.random() * 250)}.1` },
    socket: { remoteAddress: "10.9.0.1" },
    query: queryOf(url),
  } as unknown as NextApiRequest;
  await handler(req, res as unknown as NextApiResponse);
  return res;
}

/** Records the mp3 and sidecar behind a URL so afterAll can delete them. */
function track(url: string) {
  const mp3 = path.join(os.tmpdir(), queryOf(url).file);
  created.add(mp3);
  created.add(mp3.replace(/\.mp3$/, ".txt"));
  return { mp3, txt: mp3.replace(/\.mp3$/, ".txt") };
}

describe("chat audio round trip (real fs)", () => {
  beforeEach(() => mockSynthesize.mockClear());
  afterAll(() => created.forEach((f) => fs.rmSync(f, { force: true })));

  it("serves from /api/audio exactly the file the helper wrote, without re-synthesizing", async () => {
    const text = `Round trip ${runId}`;
    const url = await synthesizeReplyAudio(text, "Ada", "female", VOICE, false, "chat");
    expect(url).toBeDefined();
    const { mp3, txt } = track(url!);
    expect(fs.readFileSync(txt, "utf8")).toBe(text);
    expect(mockSynthesize).toHaveBeenCalledTimes(1);

    const res = await replay(url!);

    expect(mockSynthesize).toHaveBeenCalledTimes(1);
    expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "audio/mpeg");
    expect(res.send).toHaveBeenCalledWith(fs.readFileSync(mp3));
    expect(res.send.mock.calls[0][0].equals(AUDIO_BYTES)).toBe(true);
  });

  it("reuses one file for an identical reply and voice, whatever the key order", async () => {
    const text = `Shared ${runId}`;
    const reordered = {
      ssmlGender: "MALE",
      name: "en-GB-Wavenet-D",
      languageCodes: ["en-GB"],
    } as unknown as CharacterVoiceConfig;

    const first = await synthesizeReplyAudio(text, "Ada", null, VOICE, false, "chat");
    const second = await synthesizeReplyAudio(text, "Ada", null, reordered, false, "chat");
    track(first!);

    expect(queryOf(second!).file).toBe(queryOf(first!).file);
    expect(mockSynthesize).toHaveBeenCalledTimes(1);
  });

  it("heals a stale sidecar so the route serves the cached audio instead of regenerating", async () => {
    const text = `Stale sidecar ${runId}`;
    const url = (await synthesizeReplyAudio(text, "Ada", "female", VOICE, false, "chat"))!;
    const { txt } = track(url);
    fs.writeFileSync(txt, "something else entirely", "utf8");
    mockSynthesize.mockClear();

    await synthesizeReplyAudio(text, "Ada", "female", VOICE, false, "chat");
    expect(fs.readFileSync(txt, "utf8")).toBe(text);

    const res = await replay(url);
    expect(mockSynthesize).not.toHaveBeenCalled();
    expect(res.send).toHaveBeenCalled();
  });

  it("keeps a hidden speaker's name and gender out of the URL while still replaying", async () => {
    const text = `Mystery ${runId}`;
    const url = (await synthesizeReplyAudio(text, "Sherlock Holmes", "male", VOICE, true))!;
    track(url);

    expect(decodeURIComponent(url)).not.toContain("Sherlock");
    expect(queryOf(url)).toMatchObject({ botName: "Character", gender: "" });
    const res = await replay(url);
    expect(res.send).toHaveBeenCalled();
  });
});
