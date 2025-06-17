import { getPersonDescription } from '../src/utils/getPersonDescription';

describe('getPersonDescription', () => {
    beforeEach(() => {
        jest.restoreAllMocks();
    });

    it('returns a summary for a well-known person', async () => {
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ extract: 'Dennis Rodman is a basketball player. He is known for his rebounding.' })
        }) as any;
        const desc = await getPersonDescription('Dennis Rodman');
        expect(typeof desc).toBe('string');
        expect(desc?.toLowerCase()).toContain('basketball');
    });

    it('returns null for a likely unknown name', async () => {
        global.fetch = jest.fn().mockResolvedValue({ ok: false } as any);
        const desc = await getPersonDescription('Xyzzy Plugh');
        expect(desc === null || desc === undefined || desc === '').toBeTruthy();
    });

    it('handles network errors gracefully', async () => {
        global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));
        const desc = await getPersonDescription('Dennis Rodman');
        expect(desc).toBeNull();
    });

    it('returns null if data is not an object', async () => {
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => 'not-an-object'
        }) as any;
        const desc = await getPersonDescription('Dennis Rodman');
        expect(desc).toBeNull();
    });

    it('returns null if extract is not a string', async () => {
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ extract: 12345 })
        }) as any;
        const desc = await getPersonDescription('Dennis Rodman');
        expect(desc).toBeNull();
    });

    it('returns null if extract is missing', async () => {
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => ({})
        }) as any;
        const desc = await getPersonDescription('Dennis Rodman');
        expect(desc).toBeNull();
    });

    it('returns a period if extract is an empty string', async () => {
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ extract: '' })
        }) as any;
        const desc = await getPersonDescription('Dennis Rodman');
        expect(desc).toBe('.');
    });
});
