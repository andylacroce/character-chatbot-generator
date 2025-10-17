import { runStartupMigrations } from '../app/index';

describe('startup migrations', () => {
  beforeEach(() => {
    jest.resetModules();
    // Ensure localStorage exists for the test
    (global as any).localStorage = {
      __store: {},
      getItem(key: string) { return this.__store[key] ?? null; },
      setItem(key: string, value: string) { this.__store[key] = value; },
      removeItem(key: string) { delete this.__store[key]; },
      clear() { this.__store = {}; }
    };
  });

  it('runs without throwing when storage contains migratable keys', () => {
    // Seed a matching key
    localStorage.setItem('chatbot-history-test', JSON.stringify([{ text: 'hi' }]));
    expect(() => runStartupMigrations()).not.toThrow();
  });
});
