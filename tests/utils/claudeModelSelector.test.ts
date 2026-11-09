import { getClaudeModel } from "../../src/utils/claude/claudeModelSelector";
import { thinkingFor } from "../../src/utils/claude/claudeThinking";

describe("getClaudeModel", () => {
  const OLD_ENV = process.env;
  beforeEach(() => {
    jest.resetModules();
    process.env = { ...OLD_ENV };
  });
  afterAll(() => {
    process.env = OLD_ENV;
  });

  function setEnv(env: Partial<NodeJS.ProcessEnv>) {
    for (const key of Object.keys(env)) {
      Object.defineProperty(process.env, key, {
        value: env[key],
        configurable: true,
        writable: true,
        enumerable: true,
      });
    }
  }

  describe('"text" type', () => {
    it("returns claude-sonnet-5-5 in production", () => {
      setEnv({ NODE_ENV: "production", VERCEL_ENV: undefined });
      expect(getClaudeModel("text")).toBe("claude-sonnet-5-5");
    });

    it("returns claude-haiku-5-5 in development", () => {
      setEnv({ NODE_ENV: "development", VERCEL_ENV: undefined });
      expect(getClaudeModel("text")).toBe("claude-haiku-5-5");
    });

    it("returns claude-sonnet-5-5 when VERCEL_ENV is production", () => {
      setEnv({ NODE_ENV: "development", VERCEL_ENV: "production" });
      expect(getClaudeModel("text")).toBe("claude-sonnet-5-5");
    });
  });

  describe('"text-simple" type', () => {
    it("always returns claude-haiku-5-5 in production", () => {
      setEnv({ NODE_ENV: "production", VERCEL_ENV: undefined });
      expect(getClaudeModel("text-simple")).toBe("claude-haiku-5-5");
    });

    it("always returns claude-haiku-5-5 in development", () => {
      setEnv({ NODE_ENV: "development", VERCEL_ENV: undefined });
      expect(getClaudeModel("text-simple")).toBe("claude-haiku-5-5");
    });
  });

  it("throws on unknown type", () => {
    // @ts-expect-error test: passing invalid type should throw
    expect(() => getClaudeModel("audio")).toThrow("Unknown model type: audio");
  });

  describe("thinkingFor", () => {
    it("uses between_tools for Sonnet 5.5 (it 400s on disabled)", () => {
      setEnv({ NODE_ENV: "production", VERCEL_ENV: undefined });
      expect(thinkingFor("text")).toEqual({ type: "between_tools" });
    });

    it("uses disabled for Haiku 5.5", () => {
      setEnv({ NODE_ENV: "development", VERCEL_ENV: undefined });
      expect(thinkingFor("text")).toEqual({ type: "disabled" });
      expect(thinkingFor("text-simple")).toEqual({ type: "disabled" });
    });
  });
});
