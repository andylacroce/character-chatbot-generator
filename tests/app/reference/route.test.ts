const mockApiReference = jest.fn((config: unknown) => {
    const handler = jest.fn();
    (handler as unknown as { __config: unknown }).__config = config;
    return handler;
});
jest.mock('@scalar/nextjs-api-reference', () => ({
    ApiReference: (config: unknown) => mockApiReference(config),
}));

describe('app/reference/route', () => {
    it('configures ApiReference to read /openapi.json', async () => {
        const { GET } = await import('../../../app/reference/route');

        expect(mockApiReference).toHaveBeenCalledWith(
            expect.objectContaining({ url: '/openapi.json' }),
        );
        expect(GET).toBe(mockApiReference.mock.results[0].value);
    });
});
