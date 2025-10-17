import storage from '../src/utils/storage';
import { runStartupMigrations } from '../app/index';

describe('startup migrations', () => {
  beforeEach(() => {
    // clear and setup
    localStorage.clear();
  });

  it('migrates legacy voiceConfig to versioned wrapper', () => {
    const key = 'voiceConfig-OldBot';
    const legacy = { voice: 'test-voice' };
    localStorage.setItem(key, JSON.stringify(legacy));

  // run migrations
  runStartupMigrations();

    const raw = localStorage.getItem(key);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw as string);
    expect(parsed.v).toBe(1);
    expect(parsed.payload).toEqual(legacy);
  });
});
