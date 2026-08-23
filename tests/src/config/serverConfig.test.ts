const mockCreate = jest.fn();
jest.mock('../../../src/utils/anthropicClient', () => ({
    __esModule: true,
    default: { messages: { create: (...args: unknown[]) => mockCreate(...args) } },
}));
jest.mock('../../../src/utils/claudeModelSelector', () => ({
    getClaudeModel: jest.fn(() => 'claude-haiku-4-5-20251001'),
}));

import { AVATAR_TIMEOUT_MS, RESPONSE_CONSTRAINTS, generatePersonalityPrompt } from '../../../src/config/serverConfig';
import { getClaudeModel } from '../../../src/utils/claudeModelSelector';

const fullConfig = {
    speakingStyle: 'formal and articulate',
    personalityTraits: 'confident, analytical',
    knowledgeDomains: 'deduction, chemistry',
    behavioralGuidelines: 'Show impatience with the obvious.',
    quirks: 'Plays violin while thinking.',
};

function claudeReturns(text: string) {
    mockCreate.mockResolvedValueOnce({ content: [{ type: 'text', text }] });
}

describe('serverConfig', () => {
    beforeEach(() => jest.clearAllMocks());

    it('exposes a sane avatar timeout', () => {
        expect(AVATAR_TIMEOUT_MS).toBe(60_000);
    });

    describe('generatePersonalityPrompt', () => {
        it('builds a prompt from the structured JSON Claude returns', async () => {
            claudeReturns(JSON.stringify(fullConfig));

            const prompt = await generatePersonalityPrompt('Sherlock Holmes');

            expect(prompt).toContain('You are Sherlock Holmes.');
            expect(prompt).toContain('SPEAKING STYLE: formal and articulate');
            expect(prompt).toContain('PERSONALITY: confident, analytical');
            expect(prompt).toContain('KNOWLEDGE: deduction, chemistry');
            expect(prompt).toContain('BEHAVIOR: Show impatience with the obvious.');
            expect(prompt).toContain('QUIRKS: Plays violin while thinking.');
            expect(prompt).toContain(RESPONSE_CONSTRAINTS);
        });

        it('uses the cheap text-simple tier for this one-shot JSON task', async () => {
            claudeReturns(JSON.stringify(fullConfig));

            await generatePersonalityPrompt('Sherlock Holmes');

            expect(getClaudeModel).toHaveBeenCalledWith('text-simple');
            expect(mockCreate).toHaveBeenCalledWith(
                expect.objectContaining({ model: 'claude-haiku-4-5-20251001' }),
            );
        });

        it('substitutes defaults for fields Claude omits', async () => {
            claudeReturns(JSON.stringify({ speakingStyle: 'terse' }));

            const prompt = await generatePersonalityPrompt('Ada Lovelace');

            expect(prompt).toContain('SPEAKING STYLE: terse');
            expect(prompt).toContain('PERSONALITY: Stay true to character');
            expect(prompt).toContain('KNOWLEDGE: Use your internal knowledge');
            expect(prompt).toContain('BEHAVIOR: Respond naturally in character');
            expect(prompt).toContain('QUIRKS: Express character-specific mannerisms');
        });

        it('extracts JSON that Claude wrapped in prose or fences', async () => {
            claudeReturns('Here you go:\n```json\n' + JSON.stringify(fullConfig) + '\n```');

            const prompt = await generatePersonalityPrompt('Sherlock Holmes');

            expect(prompt).toContain('SPEAKING STYLE: formal and articulate');
        });

        it('falls back to the simple template when Claude returns unparseable JSON', async () => {
            claudeReturns('not json at all');

            const prompt = await generatePersonalityPrompt('Ada Lovelace');

            expect(prompt).toContain('You are Ada Lovelace. Stay in character');
            expect(prompt).toContain(RESPONSE_CONSTRAINTS);
        });

        it('falls back to the simple template when the API call fails', async () => {
            mockCreate.mockRejectedValueOnce(new Error('network down'));

            const prompt = await generatePersonalityPrompt('Ada Lovelace');

            expect(prompt).toContain('You are Ada Lovelace. Stay in character');
        });

        it('builds an all-defaults prompt when the response has no text block', async () => {
            // A non-text block is read as `{}`, which parses cleanly, so this takes the
            // structured path with every field defaulted rather than the error fallback.
            mockCreate.mockResolvedValueOnce({ content: [{ type: 'image' }] });

            const prompt = await generatePersonalityPrompt('Ada Lovelace');

            expect(prompt).toContain('SPEAKING STYLE: Natural and authentic to character');
            expect(prompt).toContain('QUIRKS: Express character-specific mannerisms');
        });
    });
});
