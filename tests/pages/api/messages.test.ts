import { createMocks } from 'node-mocks-http';

const mockGetSessionUserId = jest.fn();
jest.mock('../../../src/utils/getSessionUserId', () => ({
    getSessionUserId: (...args: unknown[]) => mockGetSessionUserId(...args),
}));

const mockBotWhere = jest.fn();
const mockMessagesLimit = jest.fn();
const mockMessagesOrderBy = jest.fn(() => ({ limit: mockMessagesLimit }));
const mockMessagesWhere = jest.fn(() => ({ orderBy: mockMessagesOrderBy }));

// select().from(botsTable).where(...) resolves directly (an array of rows);
// select().from(messagesTable).where(...).orderBy(...).limit(...) needs the extra chaining —
// distinguished by table identity, same approach as tests/pages/api/chat.test.ts.
import { messages as messagesSchemaTable } from '../../../src/db/schema';
const mockFrom = jest.fn((table: unknown) => {
    if (table === messagesSchemaTable) {
        return { where: mockMessagesWhere };
    }
    return { where: mockBotWhere };
});
const mockSelect = jest.fn(() => ({ from: mockFrom }));
const mockDb = { select: mockSelect };
jest.mock('../../../src/db/client', () => ({ getDb: () => mockDb }));

describe('messages API', () => {
    const OLD_ENV = process.env;

    beforeEach(() => {
        jest.clearAllMocks();
        process.env = { ...OLD_ENV, DATABASE_URL: 'postgres://user:pass@host/db' };
        mockBotWhere.mockResolvedValue([{ id: 'bot-1' }]);
        mockMessagesLimit.mockResolvedValue([]);
    });

    afterAll(() => {
        process.env = OLD_ENV;
    });

    it('returns 405 for non-GET methods', async () => {
        const handler = (await import('../../../pages/api/messages')).default;
        const { req, res } = createMocks({ method: 'POST' });
        await handler(req, res);
        expect(res._getStatusCode()).toBe(405);
    });

    it('returns an empty list for a guest (no session)', async () => {
        mockGetSessionUserId.mockResolvedValue(null);
        const handler = (await import('../../../pages/api/messages')).default;
        const { req, res } = createMocks({ method: 'GET', query: { botName: 'Ada' } });
        await handler(req, res);
        expect(res._getStatusCode()).toBe(200);
        expect(res._getJSONData()).toEqual({ messages: [] });
        expect(mockSelect).not.toHaveBeenCalled();
    });

    it('returns an empty list when botName is missing', async () => {
        mockGetSessionUserId.mockResolvedValue('user-1');
        const handler = (await import('../../../pages/api/messages')).default;
        const { req, res } = createMocks({ method: 'GET', query: {} });
        await handler(req, res);
        expect(res._getStatusCode()).toBe(200);
        expect(res._getJSONData()).toEqual({ messages: [] });
        expect(mockSelect).not.toHaveBeenCalled();
    });

    it('returns an empty list when signed in but DATABASE_URL is not configured', async () => {
        delete process.env.DATABASE_URL;
        mockGetSessionUserId.mockResolvedValue('user-1');
        const handler = (await import('../../../pages/api/messages')).default;
        const { req, res } = createMocks({ method: 'GET', query: { botName: 'Ada' } });
        await handler(req, res);
        expect(res._getStatusCode()).toBe(200);
        expect(res._getJSONData()).toEqual({ messages: [] });
    });

    it('returns an empty list when this user has no bot with that name', async () => {
        mockGetSessionUserId.mockResolvedValue('user-1');
        mockBotWhere.mockResolvedValue([]);
        const handler = (await import('../../../pages/api/messages')).default;
        const { req, res } = createMocks({ method: 'GET', query: { botName: 'Nobody' } });
        await handler(req, res);
        expect(res._getStatusCode()).toBe(200);
        expect(res._getJSONData()).toEqual({ messages: [] });
        expect(mockMessagesWhere).not.toHaveBeenCalled();
    });

    it('lists a matching bot\'s messages oldest-first', async () => {
        mockGetSessionUserId.mockResolvedValue('user-1');
        // The route selects DESC + limit, then reverses in JS to return oldest-first.
        mockMessagesLimit.mockResolvedValue([
            { id: 2, botId: 'bot-1', sender: 'Ada', text: 'hello', createdAt: new Date() },
            { id: 1, botId: 'bot-1', sender: 'User', text: 'hi', createdAt: new Date() },
        ]);
        const handler = (await import('../../../pages/api/messages')).default;
        const { req, res } = createMocks({ method: 'GET', query: { botName: 'Ada' } });
        await handler(req, res);
        expect(res._getStatusCode()).toBe(200);
        expect(res._getJSONData()).toEqual({
            messages: [
                { sender: 'User', text: 'hi' },
                { sender: 'Ada', text: 'hello' },
            ],
        });
        expect(mockMessagesLimit).toHaveBeenCalledWith(200);
    });

    it('returns 500 when the bot lookup fails', async () => {
        mockGetSessionUserId.mockResolvedValue('user-1');
        mockBotWhere.mockRejectedValue(new Error('db down'));
        const handler = (await import('../../../pages/api/messages')).default;
        const { req, res } = createMocks({ method: 'GET', query: { botName: 'Ada' } });
        await handler(req, res);
        expect(res._getStatusCode()).toBe(500);
    });

    it('returns 500 when the messages query fails', async () => {
        mockGetSessionUserId.mockResolvedValue('user-1');
        mockMessagesLimit.mockRejectedValue(new Error('db down'));
        const handler = (await import('../../../pages/api/messages')).default;
        const { req, res } = createMocks({ method: 'GET', query: { botName: 'Ada' } });
        await handler(req, res);
        expect(res._getStatusCode()).toBe(500);
    });
});
