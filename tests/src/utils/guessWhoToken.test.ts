import type { GuessWhoStatePayload } from "../../../src/utils/guessWhoToken";

const OLD_ENV = process.env;

function makePayload(overrides: Partial<GuessWhoStatePayload> = {}): GuessWhoStatePayload {
  return {
    runId: "run-1",
    hiddenName: "Irene Adler",
    personaPrompt: "You are Irene Adler, a brilliant opera singer and adventuress.",
    avatarUrl: "https://example.com/avatar.png",
    gender: "female",
    voiceConfig: { languageCodes: ["en-US"], name: "en-US-Studio-O", ssmlGender: 1 },
    usedNames: ["Sherlock Holmes"],
    streak: 2,
    wrongGuessCount: 0,
    environment: "development",
    issuedForUserId: null,
    issuedForGuestId: null,
    ...overrides,
  };
}

describe("guessWhoToken", () => {
  beforeEach(() => {
    jest.resetModules();
    process.env = { ...OLD_ENV };
    process.env.API_SECRET = "test-api-secret";
    delete process.env.GAME_TOKEN_SECRET;
    delete process.env.NEXTAUTH_SECRET;
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  it("round-trips sign -> verify and returns the exact original payload", async () => {
    const { signGuessWhoState, verifyGuessWhoState } =
      await import("../../../src/utils/guessWhoToken");
    const payload = makePayload();
    const token = signGuessWhoState(payload);
    expect(typeof token).toBe("string");
    expect(verifyGuessWhoState(token)).toEqual(payload);
  });

  it("round-trips a payload with canContinue set", async () => {
    const { signGuessWhoState, verifyGuessWhoState } =
      await import("../../../src/utils/guessWhoToken");
    const payload = makePayload({ canContinue: true, wrongGuessCount: 1 });
    const token = signGuessWhoState(payload);
    expect(verifyGuessWhoState(token)).toEqual(payload);
  });

  it("returns null for a tampered/flipped-byte token", async () => {
    const { signGuessWhoState, verifyGuessWhoState } =
      await import("../../../src/utils/guessWhoToken");
    const token = signGuessWhoState(makePayload());
    const raw = Buffer.from(token, "base64url");
    raw[raw.length - 1] = raw[raw.length - 1] ^ 0xff;
    expect(verifyGuessWhoState(raw.toString("base64url"))).toBeNull();
  });

  it("returns null for a garbage string", async () => {
    const { verifyGuessWhoState } = await import("../../../src/utils/guessWhoToken");
    expect(verifyGuessWhoState("not-a-real-token-!!!")).toBeNull();
  });

  it("returns null for an empty string", async () => {
    const { verifyGuessWhoState } = await import("../../../src/utils/guessWhoToken");
    expect(verifyGuessWhoState("")).toBeNull();
  });

  it("returns null for a token signed with a different secret", async () => {
    let token = "";
    await jest.isolateModulesAsync(async () => {
      process.env.API_SECRET = "secret-one";
      const { signGuessWhoState } = await import("../../../src/utils/guessWhoToken");
      token = signGuessWhoState(makePayload());
    });
    await jest.isolateModulesAsync(async () => {
      process.env.API_SECRET = "secret-two";
      const { verifyGuessWhoState } = await import("../../../src/utils/guessWhoToken");
      expect(verifyGuessWhoState(token)).toBeNull();
    });
  });

  it("returns null for a token with an unsupported version byte", async () => {
    const { signGuessWhoState, verifyGuessWhoState } =
      await import("../../../src/utils/guessWhoToken");
    const token = signGuessWhoState(makePayload());
    const raw = Buffer.from(token, "base64url");
    raw[0] = 99;
    expect(verifyGuessWhoState(raw.toString("base64url"))).toBeNull();
  });

  it("returns null for a syntactically valid but wrong-shaped decrypted payload (old clues/revealedCount shape)", async () => {
    const crypto = await import("crypto");
    const { verifyGuessWhoState } = await import("../../../src/utils/guessWhoToken");
    const key = crypto.createHash("sha256").update("test-api-secret").digest();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    // The pre-redesign shape: clues/revealedCount instead of personaPrompt/avatarUrl/gender/voiceConfig.
    const oldShapedPayload = {
      runId: "run-1",
      hiddenName: "Irene Adler",
      clues: ["1", "2", "3", "4", "5"],
      revealedCount: 2,
      usedNames: [],
      streak: 3,
      environment: "test",
      issuedForUserId: null,
      issuedForGuestId: null,
    };
    const encrypted = Buffer.concat([
      cipher.update(Buffer.from(JSON.stringify(oldShapedPayload), "utf8")),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();
    const versioned = Buffer.concat([Buffer.from([1]), iv, authTag, encrypted]);
    expect(verifyGuessWhoState(versioned.toString("base64url"))).toBeNull();
  });

  it("returns null for a payload missing required fields", async () => {
    const crypto = await import("crypto");
    const { verifyGuessWhoState } = await import("../../../src/utils/guessWhoToken");
    const key = crypto.createHash("sha256").update("test-api-secret").digest();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    const missingFieldsPayload = { foo: "bar" };
    const encrypted = Buffer.concat([
      cipher.update(Buffer.from(JSON.stringify(missingFieldsPayload), "utf8")),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();
    const versioned = Buffer.concat([Buffer.from([1]), iv, authTag, encrypted]);
    expect(verifyGuessWhoState(versioned.toString("base64url"))).toBeNull();
  });

  it("throws when no secret is configured to derive a key", async () => {
    await jest.isolateModulesAsync(async () => {
      delete process.env.API_SECRET;
      delete process.env.GAME_TOKEN_SECRET;
      delete process.env.NEXTAUTH_SECRET;
      const { signGuessWhoState } = await import("../../../src/utils/guessWhoToken");
      expect(() => signGuessWhoState(makePayload())).toThrow(
        "No secret configured to derive a token key",
      );
    });
  });

  it("falls back to NEXTAUTH_SECRET, then API_SECRET, matching guessWhoNextToken's chain", async () => {
    let token = "";
    await jest.isolateModulesAsync(async () => {
      delete process.env.GAME_TOKEN_SECRET;
      process.env.NEXTAUTH_SECRET = "nextauth-only-secret";
      process.env.API_SECRET = "api-secret";
      const { signGuessWhoState } = await import("../../../src/utils/guessWhoToken");
      token = signGuessWhoState(makePayload());
    });
    await jest.isolateModulesAsync(async () => {
      delete process.env.GAME_TOKEN_SECRET;
      process.env.NEXTAUTH_SECRET = "nextauth-only-secret";
      delete process.env.API_SECRET;
      const { verifyGuessWhoState } = await import("../../../src/utils/guessWhoToken");
      expect(verifyGuessWhoState(token)).toEqual(makePayload());
    });
  });
});
