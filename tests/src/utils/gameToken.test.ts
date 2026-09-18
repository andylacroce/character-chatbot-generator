import type { GameStatePayload } from "../../../src/utils/gameToken";

const OLD_ENV = process.env;

function makePayload(overrides: Partial<GameStatePayload> = {}): GameStatePayload {
  return {
    currentCharacterName: "Sherlock Holmes",
    nextCharacterName: "Irene Adler",
    personaPrompt: "You are Sherlock Holmes, a brilliant detective.",
    avatarUrl: "https://example.com/avatar.png",
    voiceGender: "male",
    voiceConfig: { languageCodes: ["en-US"], name: "en-US-Studio-O", ssmlGender: 1 },
    usedNames: ["Sherlock Holmes"],
    streak: 2,
    wrongGuessCount: 0,
    environment: "development",
    issuedForUserId: null,
    ...overrides,
  };
}

describe("gameToken", () => {
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
    const { signGameState, verifyGameState } = await import("../../../src/utils/gameToken");
    const payload = makePayload();
    const token = signGameState(payload);
    expect(typeof token).toBe("string");
    const result = verifyGameState(token);
    expect(result).toEqual(payload);
  });

  it("returns null for a tampered/flipped-byte token", async () => {
    const { signGameState, verifyGameState } = await import("../../../src/utils/gameToken");
    const token = signGameState(makePayload());
    const raw = Buffer.from(token, "base64url");
    // Flip a byte well inside the ciphertext (past version/iv/authTag header).
    raw[raw.length - 1] = raw[raw.length - 1] ^ 0xff;
    const tampered = raw.toString("base64url");
    expect(verifyGameState(tampered)).toBeNull();
  });

  it("returns null for a garbage string", async () => {
    const { verifyGameState } = await import("../../../src/utils/gameToken");
    expect(verifyGameState("not-a-real-token-at-all-!!!")).toBeNull();
  });

  it("returns null for an empty string", async () => {
    const { verifyGameState } = await import("../../../src/utils/gameToken");
    expect(verifyGameState("")).toBeNull();
  });

  it("returns null for a token signed with a different secret", async () => {
    let token = "";
    await jest.isolateModulesAsync(async () => {
      process.env.API_SECRET = "secret-one";
      const { signGameState } = await import("../../../src/utils/gameToken");
      token = signGameState(makePayload());
    });

    await jest.isolateModulesAsync(async () => {
      process.env.API_SECRET = "secret-two";
      const { verifyGameState } = await import("../../../src/utils/gameToken");
      expect(verifyGameState(token)).toBeNull();
    });
  });

  it("returns null for a token with an unsupported version byte", async () => {
    const { signGameState, verifyGameState } = await import("../../../src/utils/gameToken");
    const token = signGameState(makePayload());
    const raw = Buffer.from(token, "base64url");
    raw[0] = 99;
    const badVersion = raw.toString("base64url");
    expect(verifyGameState(badVersion)).toBeNull();
  });

  it("returns null for a syntactically valid but wrong-shaped decrypted payload", async () => {
    const crypto = await import("crypto");
    const { verifyGameState } = await import("../../../src/utils/gameToken");
    const key = crypto.createHash("sha256").update("test-api-secret").digest();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    const wrongShaped = { foo: "bar" };
    const plaintext = Buffer.from(JSON.stringify(wrongShaped), "utf8");
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const authTag = cipher.getAuthTag();
    const versioned = Buffer.concat([Buffer.from([1]), iv, authTag, encrypted]);
    expect(verifyGameState(versioned.toString("base64url"))).toBeNull();
  });

  it("throws when no secret is configured to derive a key", async () => {
    await jest.isolateModulesAsync(async () => {
      delete process.env.API_SECRET;
      delete process.env.GAME_TOKEN_SECRET;
      delete process.env.NEXTAUTH_SECRET;
      const { signGameState } = await import("../../../src/utils/gameToken");
      expect(() => signGameState(makePayload())).toThrow(
        "No secret configured to derive the game token key",
      );
    });
  });

  it("prefers GAME_TOKEN_SECRET over NEXTAUTH_SECRET and API_SECRET", async () => {
    let tokenFromGameSecret = "";
    await jest.isolateModulesAsync(async () => {
      process.env.GAME_TOKEN_SECRET = "game-secret";
      process.env.NEXTAUTH_SECRET = "nextauth-secret";
      process.env.API_SECRET = "api-secret";
      const { signGameState } = await import("../../../src/utils/gameToken");
      tokenFromGameSecret = signGameState(makePayload());
    });

    // Verifying with only GAME_TOKEN_SECRET set (matching) should succeed.
    await jest.isolateModulesAsync(async () => {
      delete process.env.NEXTAUTH_SECRET;
      delete process.env.API_SECRET;
      process.env.GAME_TOKEN_SECRET = "game-secret";
      const { verifyGameState } = await import("../../../src/utils/gameToken");
      expect(verifyGameState(tokenFromGameSecret)).toEqual(makePayload());
    });

    // Verifying with NEXTAUTH_SECRET matching the *wrong* value (what would've been used
    // if precedence were reversed) should fail, proving GAME_TOKEN_SECRET actually won.
    await jest.isolateModulesAsync(async () => {
      delete process.env.GAME_TOKEN_SECRET;
      process.env.NEXTAUTH_SECRET = "nextauth-secret";
      process.env.API_SECRET = "api-secret";
      const { verifyGameState } = await import("../../../src/utils/gameToken");
      expect(verifyGameState(tokenFromGameSecret)).toBeNull();
    });
  });

  it("falls back to NEXTAUTH_SECRET when GAME_TOKEN_SECRET is unset", async () => {
    let token = "";
    await jest.isolateModulesAsync(async () => {
      delete process.env.GAME_TOKEN_SECRET;
      process.env.NEXTAUTH_SECRET = "nextauth-only-secret";
      process.env.API_SECRET = "api-secret";
      const { signGameState } = await import("../../../src/utils/gameToken");
      token = signGameState(makePayload());
    });

    await jest.isolateModulesAsync(async () => {
      delete process.env.GAME_TOKEN_SECRET;
      process.env.NEXTAUTH_SECRET = "nextauth-only-secret";
      delete process.env.API_SECRET;
      const { verifyGameState } = await import("../../../src/utils/gameToken");
      expect(verifyGameState(token)).toEqual(makePayload());
    });
  });

  it("falls back to API_SECRET when GAME_TOKEN_SECRET and NEXTAUTH_SECRET are unset", async () => {
    let token = "";
    await jest.isolateModulesAsync(async () => {
      delete process.env.GAME_TOKEN_SECRET;
      delete process.env.NEXTAUTH_SECRET;
      process.env.API_SECRET = "api-secret-only";
      const { signGameState } = await import("../../../src/utils/gameToken");
      token = signGameState(makePayload());
    });

    await jest.isolateModulesAsync(async () => {
      delete process.env.GAME_TOKEN_SECRET;
      delete process.env.NEXTAUTH_SECRET;
      process.env.API_SECRET = "api-secret-only";
      const { verifyGameState } = await import("../../../src/utils/gameToken");
      expect(verifyGameState(token)).toEqual(makePayload());
    });
  });
});
