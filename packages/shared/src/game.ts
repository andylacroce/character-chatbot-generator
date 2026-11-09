/**
 * The guessing-game engine's platform-agnostic core, shared by the web app, the mobile
 * app, and the server routes. "Guess Who" and "Guess Who's Next" are one game with two
 * `GameDefinition`s: everything that differs between them (whether the chat partner is
 * the mystery itself, the wire name of the round token, the storage keys, the copy) is a
 * field on the definition, and everything else (state transitions, response parsing,
 * the request transport) lives here once. Plain data in, plain data out, so the rules
 * for interpreting a server response can't drift between platforms or between games.
 */

export * from "./gameDefinitions";
export * from "./gameState";
export * from "./gameTransport";
