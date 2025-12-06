import { runStartupMigrations } from '../../app/index';

describe('startup migrations', () => {
  beforeEach(() => {
    // Clear storage and setup fresh state
    localStorage.clear();
  });

  it('migrates legacy voiceConfig to versioned wrapper', () => {
    const key = 'voiceConfig-OldBot';
    const legacy = { voice: 'test-voice' };
    localStorage.setItem(key, JSON.stringify(legacy));

  // Execute all registered startup migrations
  runStartupMigrations();

    const raw = localStorage.getItem(key);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw as string);
    expect(parsed.v).toBe(1);
    expect(parsed.payload).toEqual(legacy);
  });
});
