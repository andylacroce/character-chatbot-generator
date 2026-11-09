import fs from "fs";
import os from "os";
import path from "path";
import { escapesRoot, getOriginalTextForAudio } from "../../src/utils/chat/audioFiles";

describe("escapesRoot", () => {
  const root = path.join(os.tmpdir(), "audio-root-test");

  it("treats an empty path as not an escape", () => {
    expect(escapesRoot("", root)).toBe(false);
  });

  it("accepts the root itself and anything beneath it", () => {
    expect(escapesRoot(root, root)).toBe(false);
    expect(escapesRoot(path.join(root, "a.mp3"), root)).toBe(false);
    expect(escapesRoot(path.join(root, "nested", "a.mp3"), root)).toBe(false);
  });

  it("rejects a sibling directory that merely shares the root's name as a prefix", () => {
    expect(escapesRoot(root + "-evil/a.mp3", root)).toBe(true);
  });

  it("rejects a path outside the root", () => {
    expect(escapesRoot(path.join(path.dirname(root), "elsewhere", "a.mp3"), root)).toBe(true);
  });

  it("compares against the real path when the root is a symlink", () => {
    const real = fs.mkdtempSync(path.join(os.tmpdir(), "audio-real-"));
    const link = real + "-link";
    try {
      fs.symlinkSync(real, link, "dir");
    } catch {
      fs.rmSync(real, { recursive: true });
      return; // symlinks unavailable without privileges on some Windows setups
    }
    try {
      expect(escapesRoot(path.join(fs.realpathSync(link), "a.mp3"), link)).toBe(false);
    } finally {
      fs.rmSync(link, { force: true });
      fs.rmSync(real, { recursive: true });
    }
  });
});

describe("getOriginalTextForAudio", () => {
  const name = `audio-files-test-${process.pid}.mp3`;
  const sidecar = path.join(os.tmpdir(), name.replace(/\.mp3$/, ".txt"));

  afterEach(() => fs.rmSync(sidecar, { force: true }));

  it("reads the text sidecar written next to the audio file", () => {
    fs.writeFileSync(sidecar, "Greetings, traveller.");
    expect(getOriginalTextForAudio(name)).toBe("Greetings, traveller.");
  });

  it("returns null when there is no sidecar", () => {
    expect(getOriginalTextForAudio(`missing-${process.pid}.mp3`)).toBeNull();
  });
});
