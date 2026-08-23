import characterNames from '../../../src/data/characterNames';

describe('characterNames', () => {
    it('exports a large pool of names', () => {
        expect(Array.isArray(characterNames)).toBe(true);
        expect(characterNames.length).toBeGreaterThan(500);
    });

    it('contains no duplicates', () => {
        // The module dedupes on load; this pins that the export stays deduped as the
        // list grows, so /api/random-character does not repeat itself unnecessarily.
        expect(new Set(characterNames).size).toBe(characterNames.length);
    });

    it('contains no empty or untrimmed entries', () => {
        for (const name of characterNames) {
            expect(typeof name).toBe('string');
            expect(name).toBe(name.trim());
            expect(name.length).toBeGreaterThan(0);
        }
    });

    it('covers the public-domain categories the copyright guardrail relies on', () => {
        // Suggestions surfaced by CopyrightWarningModal come from this pool, so it has
        // to actually span mythology, pre-1928 literature and historical figures.
        expect(characterNames).toEqual(
            expect.arrayContaining(['Zeus', 'Sherlock Holmes', 'Cleopatra']),
        );
    });
});
