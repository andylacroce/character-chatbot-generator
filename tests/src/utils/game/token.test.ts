import crypto from "crypto";
import type { GameState } from "../../../../src/utils/game/token";

const OLD_ENV = process.env;

function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    game: "guessWhoNext",
    runId: "run-1",
    speakerName: "Sherlock Holmes",
    targetName: "Irene Adler",
    personaPrompt: "You are Sherlock Holmes, a brilliant detective.",
    avatarUrl: "https://example.com/avatar.png",
    gender: "male",
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

/** Encrypts an arbitrary JSON payload the way tokenCrypto does, to forge old or wrong-shaped tokens. */
function encryptRaw(payload: unknown, secret = "test-api-secret"): string {
  const key = crypto.createHash("sha256").update(secret).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
  return Buffer.concat([Buffer.from([1]), iv, cipher.getAuthTag(), encrypted]).toString(
    "base64url",
  );
}

describe("game token", () => {
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

  const load = () => import("../../../../src/utils/game/token");

  describe.each([["guessWho"], ["guessWhoNext"]] as const)("round trip (%s)", (game) => {
    it("returns the exact original state, including canContinue", async () => {
      const { signGameState, verifyGameState } = await load();
      const state = makeState({ game, canContinue: true, wrongGuessCount: 1 });
      expect(verifyGameState(signGameState(state), game)).toEqual(state);
    });
  });

  it("never verifies a token against the other game's routes", async () => {
    const { signGameState, verifyGameState } = await load();
    const token = signGameState(makeState({ game: "guessWho" }));
    expect(verifyGameState(token, "guessWhoNext")).toBeNull();
    expect(verifyGameState(token, "guessWho")).not.toBeNull();
  });

  describe("untagged (pre-unification) tokens", () => {
    const common = {
      personaPrompt: "p",
      avatarUrl: "a",
      gender: "female",
      voiceConfig: {},
      usedNames: ["Irene Adler"],
      streak: 1,
      wrongGuessCount: 0,
      environment: "development",
      issuedForUserId: "u1",
    };

    it("rejects a token with no game discriminator", async () => {
      const { verifyGameState } = await load();
      const untagged = encryptRaw({ ...common, runId: "r", hiddenName: "Irene Adler" });
      expect(verifyGameState(untagged, "guessWho")).toBeNull();
    });
  });

  describe("fails closed", () => {
    it("returns null for a tampered/flipped-byte token", async () => {
      const { signGameState, verifyGameState } = await load();
      const raw = Buffer.from(signGameState(makeState()), "base64url");
      raw[raw.length - 1] = raw[raw.length - 1] ^ 0xff;
      expect(verifyGameState(raw.toString("base64url"), "guessWhoNext")).toBeNull();
    });

    it("returns null for a token with an unsupported version byte", async () => {
      const { signGameState, verifyGameState } = await load();
      const raw = Buffer.from(signGameState(makeState()), "base64url");
      raw[0] = 99;
      expect(verifyGameState(raw.toString("base64url"), "guessWhoNext")).toBeNull();
    });

    it("returns null for garbage, an empty string, and a non-string", async () => {
      const { verifyGameState } = await load();
      expect(verifyGameState("not-a-real-token-at-all-!!!", "guessWhoNext")).toBeNull();
      expect(verifyGameState("", "guessWhoNext")).toBeNull();
      expect(verifyGameState(undefined, "guessWhoNext")).toBeNull();
    });

    it("returns null for a validly encrypted but wrong-shaped payload", async () => {
      const { verifyGameState } = await load();
      expect(verifyGameState(encryptRaw({ foo: "bar" }), "guessWhoNext")).toBeNull();
    });

    it("returns null for a token signed with a different secret", async () => {
      let token = "";
      await jest.isolateModulesAsync(async () => {
        process.env.API_SECRET = "secret-one";
        const { signGameState } = await load();
        token = signGameState(makeState());
      });
      await jest.isolateModulesAsync(async () => {
        process.env.API_SECRET = "secret-two";
        const { verifyGameState } = await load();
        expect(verifyGameState(token, "guessWhoNext")).toBeNull();
      });
    });
  });

  describe("key derivation", () => {
    it("throws when no secret is configured to derive a key", async () => {
      await jest.isolateModulesAsync(async () => {
        delete process.env.API_SECRET;
        const { signGameState } = await load();
        expect(() => signGameState(makeState())).toThrow(
          "No secret configured to derive a token key",
        );
      });
    });

    /** Signs under one secret set, then reports whether a second set can still verify it. */
    async function verifiesAcross(
      signEnv: Record<string, string>,
      verifyEnv: Record<string, string>,
    ) {
      let token = "";
      const apply = (env: Record<string, string>) => {
        for (const name of ["GAME_TOKEN_SECRET", "NEXTAUTH_SECRET", "API_SECRET"]) {
          delete process.env[name];
        }
        Object.assign(process.env, env);
      };
      await jest.isolateModulesAsync(async () => {
        apply(signEnv);
        token = (await load()).signGameState(makeState());
      });
      let result: GameState | null = null;
      await jest.isolateModulesAsync(async () => {
        apply(verifyEnv);
        result = (await load()).verifyGameState(token, "guessWhoNext");
      });
      return result;
    }

    it("prefers GAME_TOKEN_SECRET over NEXTAUTH_SECRET and API_SECRET", async () => {
      const all = {
        GAME_TOKEN_SECRET: "game-secret",
        NEXTAUTH_SECRET: "nextauth-secret",
        API_SECRET: "api-secret",
      };
      expect(await verifiesAcross(all, { GAME_TOKEN_SECRET: "game-secret" })).toEqual(makeState());
      // The lower-precedence secrets alone must NOT verify it, proving GAME_TOKEN_SECRET won.
      expect(
        await verifiesAcross(all, { NEXTAUTH_SECRET: "nextauth-secret", API_SECRET: "api-secret" }),
      ).toBeNull();
    });

    it("falls back to NEXTAUTH_SECRET, then API_SECRET", async () => {
      expect(
        await verifiesAcross({ NEXTAUTH_SECRET: "n", API_SECRET: "a" }, { NEXTAUTH_SECRET: "n" }),
      ).toEqual(makeState());
      expect(await verifiesAcross({ API_SECRET: "a" }, { API_SECRET: "a" })).toEqual(makeState());
    });
  });
});
