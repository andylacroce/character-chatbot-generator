import { NextApiRequest, NextApiResponse } from "next";
import audioHandler from "../../pages/api/audio";

describe("Audio API Handler - OpenAI+TTS Regeneration", () => {
  const createTestObjects = () => {
    const req = {
      query: {},
      headers: { "x-internal-api-secret": process.env.INTERNAL_API_SECRET },
    } as Partial<NextApiRequest>;
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      setHeader: jest.fn(),
      send: jest.fn(),
    } as unknown as NextApiResponse;
    return { req, res };
  };

  let originalEnv: NodeJS.ProcessEnv;
  beforeEach(() => {
    jest.useRealTimers();
    originalEnv = { ...process.env };
    process.env.OPENAI_API_KEY = "test-key";
  });
  afterEach(() => {
    process.env = { ...originalEnv };
    jest.restoreAllMocks();
    setOpenAIMock(undefined);
  });

  it("should attempt OpenAI+TTS regen and succeed on first try", async () => {
    const { req, res } = createTestObjects();
    req.query = { file: "regen.mp3" };
    let callCount = 0;
    jest.spyOn(require("fs"), "existsSync").mockImplementation(() => {
      callCount++;
      return callCount > 1;
    });
    jest.spyOn(require("fs"), "realpathSync").mockReturnValue(require("path").resolve("/tmp", "regen.mp3"));
    setOpenAIMock({
      chat: { completions: { create: jest.fn().mockResolvedValue({ choices: [{ message: { content: "Bot reply" } }] }) } }
    });
    jest.spyOn(require("fs"), "writeFileSync").mockImplementation(() => {});
    jest.spyOn(require("../../src/utils/tts"), "synthesizeSpeechToFile").mockResolvedValue(undefined);
    jest.spyOn(require("fs"), "readFileSync").mockReturnValue(Buffer.from("audio content"));
    await audioHandler(req as NextApiRequest, res as NextApiResponse);
    expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "audio/mpeg");
    expect(res.send).toHaveBeenCalledWith(Buffer.from("audio content"));
  });

  it("should return 404 if OpenAI+TTS regen fails and file never appears", async () => {
    const { req, res } = createTestObjects();
    req.query = { file: "regenfail.mp3" };
    jest.spyOn(require("fs"), "existsSync").mockReturnValue(false);
    setOpenAIMock({
      chat: { completions: { create: jest.fn().mockRejectedValue(new Error("fail")) } }
    });
    jest.spyOn(require("fs"), "realpathSync").mockReturnValue("");
    jest.spyOn(require("fs"), "writeFileSync").mockImplementation(() => {});
    jest.spyOn(require("../../src/utils/tts"), "synthesizeSpeechToFile").mockRejectedValue(new Error("tts fail"));
    jest.spyOn(require("fs"), "readFileSync").mockImplementation(() => { throw new Error("not found"); });
    await audioHandler(req as NextApiRequest, res as NextApiResponse);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: "File not found after all regeneration attempts" });
  });

  it("should return 404 if OPENAI_API_KEY is missing during regen", async () => {
    const { req, res } = createTestObjects();
    req.query = { file: "regenfail.mp3" };
    process.env.OPENAI_API_KEY = "";
    jest.spyOn(require("fs"), "existsSync").mockReturnValue(false);
    jest.spyOn(require("fs"), "realpathSync").mockReturnValue("");
    jest.spyOn(require("fs"), "writeFileSync").mockImplementation(() => {});
    jest.spyOn(require("../../src/utils/tts"), "synthesizeSpeechToFile").mockResolvedValue(undefined);
    jest.spyOn(require("fs"), "readFileSync").mockImplementation(() => { throw new Error("not found"); });
    await audioHandler(req as NextApiRequest, res as NextApiResponse);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: "File not found after all regeneration attempts" });
  });

  it("should wait for file to appear after regen and succeed if file appears late", async () => {
    const { req, res } = createTestObjects();
    req.query = { file: "delayed.mp3" };
    const txtPath = require("path").resolve("/tmp", "delayed.txt");
    const mp3Path = require("path").resolve("/tmp", "delayed.mp3");
    let pollCount = 0;
    let mp3Exists = false;
    jest.spyOn(require("fs"), "existsSync").mockImplementation((...args) => {
      const filePath = args[0];
      if (filePath === txtPath) return true;
      if (filePath === mp3Path) {
        if (!mp3Exists && pollCount < 3) {
          pollCount++;
          return false;
        }
        mp3Exists = true;
        return true;
      }
      return false;
    });
    jest.spyOn(require("fs"), "realpathSync").mockImplementation((...args) => {
      const filePath = args[0];
      if (filePath === mp3Path && mp3Exists) {
        return mp3Path;
      } else if (filePath === txtPath) {
        return txtPath;
      } else {
        throw new Error("ENOENT");
      }
    });
    jest.spyOn(require("fs"), "readFileSync").mockImplementation((...args) => {
      const filePath = args[0];
      if (filePath === txtPath) return "Some Bot reply";
      if (filePath === mp3Path) return Buffer.from("audio content");
      throw new Error("ENOENT");
    });
    jest.spyOn(require("fs"), "writeFileSync").mockImplementation(() => {});
    jest.spyOn(require("../../src/utils/tts"), "synthesizeSpeechToFile").mockResolvedValue(undefined);
    await audioHandler(req as NextApiRequest, res as NextApiResponse);
    expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "audio/mpeg");
    expect(res.send).toHaveBeenCalledWith(Buffer.from("audio content"));
  }, 10000);

  it("should regenerate audio if .txt file exists but does not match expected text", async () => {
    const { req, res } = createTestObjects();
    req.query = { file: "existing.mp3", text: "EXPECTED REPLY" };
    const audioContent = Buffer.from("audio content");
    const txtPath = require("path").resolve("/tmp", "existing.txt");
    const mp3Path = require("path").resolve("/tmp", "existing.mp3");
    jest.spyOn(require("fs"), "existsSync").mockImplementation((filePath) => {
      if (filePath === mp3Path) return true;
      if (filePath === txtPath) return true;
      return false;
    });
    jest.spyOn(require("fs"), "realpathSync").mockImplementation((filePath) => {
      if (filePath === mp3Path) return mp3Path;
      if (filePath === txtPath) return txtPath;
      throw new Error("ENOENT");
    });
    jest.spyOn(require("fs"), "readFileSync").mockImplementation((filePath, encoding) => {
      if (filePath === txtPath) return "OLD REPLY";
      if (filePath === mp3Path) return audioContent;
      throw new Error("ENOENT");
    });
    const synthesizeSpy = jest.spyOn(require("../../src/utils/tts"), "synthesizeSpeechToFile").mockResolvedValue(undefined);
    const writeFileSyncSpy = jest.spyOn(require("fs"), "writeFileSync").mockImplementation(() => {});
    await audioHandler(req as NextApiRequest, res as NextApiResponse);
    expect(synthesizeSpy).toHaveBeenCalledWith(expect.objectContaining({ text: expect.stringContaining("EXPECTED REPLY") }));
    expect(writeFileSyncSpy).toHaveBeenCalledWith(txtPath, "EXPECTED REPLY", "utf8");
    expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "audio/mpeg");
    expect(res.send).toHaveBeenCalledWith(audioContent);
  });

  it("should not regenerate audio if .txt file matches expected text", async () => {
    const { req, res } = createTestObjects();
    req.query = { file: "existing.mp3", text: "MATCHING REPLY" };
    const audioContent = Buffer.from("audio content");
    const txtPath = require("path").resolve("/tmp", "existing.txt");
    const mp3Path = require("path").resolve("/tmp", "existing.mp3");
    jest.spyOn(require("fs"), "existsSync").mockImplementation((filePath) => {
      if (filePath === mp3Path) return true;
      if (filePath === txtPath) return true;
      return false;
    });
    jest.spyOn(require("fs"), "realpathSync").mockImplementation((filePath) => {
      if (filePath === mp3Path) return mp3Path;
      if (filePath === txtPath) return txtPath;
      throw new Error("ENOENT");
    });
    jest.spyOn(require("fs"), "readFileSync").mockImplementation((filePath, encoding) => {
      if (filePath === txtPath) return "MATCHING REPLY";
      if (filePath === mp3Path) return audioContent;
      throw new Error("ENOENT");
    });
    const synthesizeSpy = jest.spyOn(require("../../src/utils/tts"), "synthesizeSpeechToFile").mockResolvedValue(undefined);
    await audioHandler(req as NextApiRequest, res as NextApiResponse);
    const calls = synthesizeSpy.mock.calls.filter(call => {
      const arg = call[0] as any;
      return arg && typeof arg.filePath === "string" && arg.filePath.endsWith("existing.mp3") && arg.text && arg.text.includes("MATCHING REPLY");
    });
    expect(calls.length).toBe(0);
    expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "audio/mpeg");
    expect(res.send).toHaveBeenCalledWith(audioContent);
  });

  it("should return 400 if file param is missing", async () => {
    const { req, res } = createTestObjects();
    req.query = {};
    await audioHandler(req as NextApiRequest, res as NextApiResponse);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "File parameter is required" });
  });

  it("should return 403 if file path is outside allowed dirs", async () => {
    const { req, res } = createTestObjects();
    req.query = { file: "../hack.mp3" };
    jest.spyOn(require("fs"), "existsSync").mockReturnValue(true);
    jest.spyOn(require("fs"), "realpathSync").mockReturnValue("/etc/passwd");
    jest.spyOn(require("fs"), "readFileSync").mockImplementation((filePath) => {
      if (typeof filePath === "string" && filePath.endsWith("hack.mp3")) throw new Error("ENOENT");
      return "dummy";
    });
    await audioHandler(req as NextApiRequest, res as NextApiResponse);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: "Access forbidden" });
  });

  it("should return 500 if reading the file throws", async () => {
    const { req, res } = createTestObjects();
    req.query = { file: "failread.mp3" };
    jest.spyOn(require("fs"), "existsSync").mockReturnValue(true);
    jest.spyOn(require("fs"), "realpathSync").mockReturnValue(require("path").resolve("/tmp", "failread.mp3"));
    jest.spyOn(require("fs"), "readFileSync").mockImplementation((filePath) => {
      if (typeof filePath === "string" && filePath.endsWith("failread.mp3")) throw new Error("fail");
      return "";
    });
    await audioHandler(req as NextApiRequest, res as NextApiResponse);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: "Error reading file" });
  });

  it("should return 404 if file not found after all regen attempts and forbidden path", async () => {
    const { req, res } = createTestObjects();
    req.query = { file: "notfound.mp3" };
    jest.spyOn(require("fs"), "existsSync").mockReturnValue(false);
    jest.spyOn(require("fs"), "realpathSync").mockReturnValue("/etc/passwd");
    await audioHandler(req as NextApiRequest, res as NextApiResponse);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: "File not found after all regeneration attempts" });
  });

  it("should handle OpenAI returning empty message", async () => {
    const { req, res } = createTestObjects();
    req.query = { file: "regen.mp3" };
    jest.spyOn(require("fs"), "existsSync").mockReturnValue(false);
    jest.spyOn(require("fs"), "realpathSync").mockReturnValue("");
    setOpenAIMock({
      chat: { completions: { create: jest.fn().mockResolvedValue({ choices: [{ message: { content: "" } }] }) } }
    });
    jest.spyOn(require("fs"), "writeFileSync").mockImplementation(() => {});
    jest.spyOn(require("../../src/utils/tts"), "synthesizeSpeechToFile").mockResolvedValue(undefined);
    jest.spyOn(require("fs"), "readFileSync").mockImplementation(() => { throw new Error("not found"); });
    await audioHandler(req as NextApiRequest, res as NextApiResponse);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: "File not found after all regeneration attempts" });
  });
});

afterAll(() => {
  jest.useRealTimers();
});

jest.mock("../../src/utils/tts", () => ({
  synthesizeSpeechToFile: jest.fn().mockResolvedValue(undefined),
}));

(global as any).__OPENAI_MOCK__ = undefined;
jest.mock("openai", () => {
  return function (opts: any) {
    if (opts && typeof opts === "object") {
      opts.dangerouslyAllowBrowser = true;
    }
    return (global as any).__OPENAI_MOCK__ || {
      chat: {
        completions: {
          create: jest.fn().mockResolvedValue({ choices: [{ message: { content: "Bot reply" } }] })
        }
      }
    };
  };
});

function setOpenAIMock(mockImpl: any) {
  (global as any).__OPENAI_MOCK__ = mockImpl;
}

describe("edge cases and public dir fallback", () => {
  const createTestObjects = () => {
    const req = {
      query: {},
      headers: { "x-internal-api-secret": process.env.INTERNAL_API_SECRET },
    } as Partial<NextApiRequest>;
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      setHeader: jest.fn(),
      send: jest.fn(),
    } as unknown as NextApiResponse;
    return { req, res };
  };

  it("should use .txt from public if not in /tmp and match expected text", async () => {
    const { req, res } = createTestObjects();
    req.query = { file: "publicfile.mp3", text: "MATCHING PUBLIC" };
    const audioContent = Buffer.from("audio content");
    const txtPathPublic = require("path").resolve("public", "publicfile.txt");
    const mp3PathPublic = require("path").resolve("public", "publicfile.mp3");
    jest.spyOn(require("fs"), "existsSync").mockImplementation((filePath) => {
      if (filePath === mp3PathPublic) return true;
      if (filePath === txtPathPublic) return true;
      return false;
    });
    jest.spyOn(require("fs"), "realpathSync").mockImplementation((filePath) => {
      if (filePath === mp3PathPublic) return mp3PathPublic;
      if (filePath === txtPathPublic) return txtPathPublic;
      throw new Error("ENOENT");
    });
    jest.spyOn(require("fs"), "readFileSync").mockImplementation((filePath, encoding) => {
      if (filePath === txtPathPublic) return "MATCHING PUBLIC";
      if (filePath === mp3PathPublic) return audioContent;
      throw new Error("ENOENT");
    });
    await audioHandler(req as NextApiRequest, res as NextApiResponse);
    expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "audio/mpeg");
    expect(res.send).toHaveBeenCalledWith(audioContent);
  });

  it("should regenerate if .txt in public does not match expected text", async () => {
    const { req, res } = createTestObjects();
    req.query = { file: "publicfile.mp3", text: "EXPECTED" };
    const audioContent = Buffer.from("audio content");
    const txtPathPublic = require("path").resolve("public", "publicfile.txt");
    const mp3PathPublic = require("path").resolve("public", "publicfile.mp3");
    jest.spyOn(require("fs"), "existsSync").mockImplementation((filePath) => {
      if (filePath === mp3PathPublic) return true;
      if (filePath === txtPathPublic) return true;
      return false;
    });
    jest.spyOn(require("fs"), "realpathSync").mockImplementation((filePath) => {
      if (filePath === mp3PathPublic) return mp3PathPublic;
      if (filePath === txtPathPublic) return txtPathPublic;
      throw new Error("ENOENT");
    });
    jest.spyOn(require("fs"), "readFileSync").mockImplementation((filePath, encoding) => {
      if (filePath === txtPathPublic) return "OLD PUBLIC";
      if (filePath === mp3PathPublic) return audioContent;
      throw new Error("ENOENT");
    });
    const synthesizeSpy = jest.spyOn(require("../../src/utils/tts"), "synthesizeSpeechToFile").mockResolvedValue(undefined);
    const writeFileSyncSpy = jest.spyOn(require("fs"), "writeFileSync").mockImplementation(() => {});
    await audioHandler(req as NextApiRequest, res as NextApiResponse);
    expect(synthesizeSpy).toHaveBeenCalledWith(expect.objectContaining({ text: expect.stringContaining("EXPECTED") }));
    expect(writeFileSyncSpy).toHaveBeenCalledWith(expect.stringMatching(/publicfile\.txt$/), "EXPECTED", "utf8");
    expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "audio/mpeg");
    expect(res.send).toHaveBeenCalledWith(audioContent);
  });

  it("should handle synthesizeSpeechToFile failure in fallback and log error", async () => {
    const { req, res } = createTestObjects();
    req.query = { file: "failregen.mp3" };
    const txtPath = require("path").resolve("/tmp", "failregen.txt");
    jest.spyOn(require("fs"), "existsSync").mockImplementation((filePath) => filePath === txtPath);
    jest.spyOn(require("fs"), "realpathSync").mockImplementation((filePath) => filePath === txtPath ? txtPath : "");
    jest.spyOn(require("fs"), "readFileSync").mockImplementation((filePath, encoding) => filePath === txtPath ? "Some text" : "");
    const synthesizeSpy = jest.spyOn(require("../../src/utils/tts"), "synthesizeSpeechToFile").mockRejectedValue(new Error("tts fail"));
    const logger = require("../../src/utils/logger").default;
    const errorSpy = jest.spyOn(logger, "error");
    await audioHandler(req as NextApiRequest, res as NextApiResponse);
    expect(synthesizeSpy).toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Failed to regenerate audio from cached text"), expect.any(Error));
    errorSpy.mockRestore();
  });

  it("should serve regenerated audio from /tmp if it appears there after regen", async () => {
    const { req, res } = createTestObjects();
    req.query = { file: "regentmp.mp3", text: "Some Bot reply" };
    let regenDone = false;
    // Simulate both .mp3 and .txt files for regentmp
    jest.spyOn(require("fs"), "existsSync").mockImplementation((filePath) => {
      if (typeof filePath === "string" && filePath.includes("regentmp.mp3")) {
        return regenDone;
      }
      if (typeof filePath === "string" && filePath.includes("regentmp.txt")) {
        return regenDone;
      }
      return false;
    });
    jest.spyOn(require("fs"), "realpathSync").mockImplementation((filePath) => {
      if (regenDone && typeof filePath === "string" && (filePath.includes("regentmp.mp3") || filePath.includes("regentmp.txt"))) {
        return filePath;
      }
      throw new Error("ENOENT");
    });
    jest.spyOn(require("fs"), "readFileSync").mockImplementation((filePath) => {
      if (typeof filePath === "string" && filePath.includes("regentmp.mp3")) {
        return Buffer.from("audio content");
      }
      if (typeof filePath === "string" && filePath.includes("regentmp.txt")) {
        return "Some Bot reply";
      }
      throw new Error("ENOENT");
    });
    // Simulate synthesizeSpeechToFile sets regenDone to true (files appear in /tmp)
    const synthesizeSpy = jest.spyOn(require("../../src/utils/tts"), "synthesizeSpeechToFile").mockImplementation(async () => { regenDone = true; });
    await audioHandler(req as NextApiRequest, res as NextApiResponse);
    expect(synthesizeSpy).toHaveBeenCalled();
    expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "audio/mpeg");
    expect(res.send).toHaveBeenCalledWith(Buffer.from("audio content"));
  });

  it("should handle fs.writeFileSync error in fallback and log", async () => {
    const { req, res } = createTestObjects();
    req.query = { file: "failwrite.mp3", text: "SOME TEXT" };
    const txtPath = require("path").resolve("/tmp", "failwrite.txt");
    const mp3Path = require("path").resolve("/tmp", "failwrite.mp3");
    jest.spyOn(require("fs"), "existsSync").mockImplementation((filePath) => {
      if (filePath === mp3Path) return true;
      if (filePath === txtPath) return false;
      return false;
    });
    jest.spyOn(require("fs"), "realpathSync").mockImplementation((filePath) => {
      if (filePath === mp3Path) return mp3Path;
      throw new Error("ENOENT");
    });
    jest.spyOn(require("fs"), "readFileSync").mockImplementation((filePath) => {
      if (filePath === mp3Path) return Buffer.from("audio content");
      throw new Error("ENOENT");
    });
    jest.spyOn(require("fs"), "writeFileSync").mockImplementation(() => { throw new Error("fail write"); });
    const logger = require("../../src/utils/logger").default;
    const errorSpy = jest.spyOn(logger, "error");
    await audioHandler(req as NextApiRequest, res as NextApiResponse);
    // Accept either error message depending on which code path throws
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringMatching(/Failed to (synthesize audio from text param|ensure \.txt file for audio reply)/),
      expect.any(Error)
    );
    errorSpy.mockRestore();
  });

  it("should handle fs.readFileSync error in fallback and log (or throw)", async () => {
    const { req, res } = createTestObjects();
    req.query = { file: "failreadtxt.mp3", text: "SOME TEXT" };
    const txtPath = require("path").resolve("/tmp", "failreadtxt.txt");
    const mp3Path = require("path").resolve("/tmp", "failreadtxt.mp3");
    jest.spyOn(require("fs"), "existsSync").mockImplementation((filePath) => {
      if (filePath === mp3Path) return true;
      if (filePath === txtPath) return true;
      return false;
    });
    jest.spyOn(require("fs"), "realpathSync").mockImplementation((filePath) => {
      if (filePath === mp3Path) return mp3Path;
      if (filePath === txtPath) return txtPath;
      throw new Error("ENOENT");
    });
    jest.spyOn(require("fs"), "readFileSync").mockImplementation((filePath) => {
      if (filePath === txtPath) throw new Error("fail read");
      if (filePath === mp3Path) return Buffer.from("audio content");
      throw new Error("ENOENT");
    });
    const logger = require("../../src/utils/logger").default;
    const errorSpy = jest.spyOn(logger, "error");
    let threw = false;
    try {
      await audioHandler(req as NextApiRequest, res as NextApiResponse);
    } catch (e) {
      threw = true;
      if (e instanceof Error) {
        expect(e.message).toMatch(/fail read/);
      } else {
        throw e;
      }
    }
    // Accept either: error is logged, or error is thrown
    if (!threw) {
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringMatching(/Failed to (synthesize audio from text param|ensure \.txt file for audio reply)/),
        expect.any(Error)
      );
    }
    errorSpy.mockRestore();
  });
});

describe("additional edge cases for audio regen", () => {
  const createTestObjects = () => {
    const req = {
      query: {},
      headers: { "x-internal-api-secret": process.env.INTERNAL_API_SECRET },
    } as Partial<NextApiRequest>;
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      setHeader: jest.fn(),
      send: jest.fn(),
    } as unknown as NextApiResponse;
    return { req, res };
  };

  it("should wait for file to appear on the 5th poll after regen", async () => {
    const { req, res } = createTestObjects();
    req.query = { file: "latefile.mp3" };
    const txtPath = require("path").resolve("/tmp", "latefile.txt");
    const mp3Path = require("path").resolve("/tmp", "latefile.mp3");
    let pollCount = 0;
    let mp3Exists = false;
    jest.spyOn(require("fs"), "existsSync").mockImplementation((filePath) => {
      if (filePath === txtPath) return true;
      if (filePath === mp3Path) {
        if (!mp3Exists && pollCount < 4) {
          pollCount++;
          return false;
        }
        mp3Exists = true;
        return true;
      }
      return false;
    });
    jest.spyOn(require("fs"), "realpathSync").mockImplementation((filePath) => {
      if (filePath === mp3Path && mp3Exists) return mp3Path;
      if (filePath === txtPath) return txtPath;
      throw new Error("ENOENT");
    });
    jest.spyOn(require("fs"), "readFileSync").mockImplementation((filePath) => {
      if (filePath === txtPath) return "Some Bot reply";
      if (filePath === mp3Path) return Buffer.from("audio content");
      throw new Error("ENOENT");
    });
    jest.spyOn(require("fs"), "writeFileSync").mockImplementation(() => {});
    jest.spyOn(require("../../src/utils/tts"), "synthesizeSpeechToFile").mockResolvedValue(undefined);
    await audioHandler(req as NextApiRequest, res as NextApiResponse);
    expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "audio/mpeg");
    expect(res.send).toHaveBeenCalledWith(Buffer.from("audio content"));
    expect(pollCount).toBe(4); // 5th poll triggers file found
  });

  it("should return 403 if both /tmp and /public are forbidden", async () => {
    const { req, res } = createTestObjects();
    req.query = { file: "forbidden.mp3" };
    const mp3Path = require("path").resolve("/tmp", "forbidden.mp3");
    const mp3PathPublic = require("path").resolve("public", "forbidden.mp3");
    jest.spyOn(require("fs"), "existsSync").mockImplementation((filePath) => {
      if (filePath === mp3Path) return true;
      if (filePath === mp3PathPublic) return true;
      return false;
    });
    jest.spyOn(require("fs"), "realpathSync").mockImplementation((filePath) => {
      if (filePath === mp3Path) return "/notallowed/forbidden.mp3";
      if (filePath === mp3PathPublic) return "/notallowed/forbidden.mp3";
      throw new Error("ENOENT");
    });
    jest.spyOn(require("fs"), "readFileSync").mockImplementation((filePath) => Buffer.from("audio content"));
    await audioHandler(req as NextApiRequest, res as NextApiResponse);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: "Access forbidden" });
  });

  it("should trigger regen if .txt is only in public and missing", async () => {
    const { req, res } = createTestObjects();
    req.query = { file: "missingpublic.mp3", text: "NEW TEXT" };
    const mp3PathPublic = require("path").resolve("public", "missingpublic.mp3");
    const txtPathPublic = require("path").resolve("public", "missingpublic.txt");
    jest.spyOn(require("fs"), "existsSync").mockImplementation((filePath) => {
      if (filePath === mp3PathPublic) return true;
      // .txt does not exist in public or /tmp
      return false;
    });
    jest.spyOn(require("fs"), "realpathSync").mockImplementation((filePath) => {
      if (filePath === mp3PathPublic) return mp3PathPublic;
      throw new Error("ENOENT");
    });
    jest.spyOn(require("fs"), "readFileSync").mockImplementation((filePath, encoding) => {
      if (filePath === mp3PathPublic) return Buffer.from("audio content");
      throw new Error("ENOENT");
    });
    const synthesizeSpy = jest.spyOn(require("../../src/utils/tts"), "synthesizeSpeechToFile").mockResolvedValue(undefined);
    const writeFileSyncSpy = jest.spyOn(require("fs"), "writeFileSync").mockImplementation(() => {});
    await audioHandler(req as NextApiRequest, res as NextApiResponse);
    expect(synthesizeSpy).toHaveBeenCalledWith(expect.objectContaining({ text: expect.stringContaining("NEW TEXT") }));
    expect(writeFileSyncSpy).toHaveBeenCalledWith(expect.stringMatching(/missingpublic\.txt$/), "NEW TEXT", "utf8");
    expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "audio/mpeg");
    expect(res.send).toHaveBeenCalledWith(Buffer.from("audio content"));
  });
});
