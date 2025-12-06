import { downloadTranscript } from '../../src/utils/downloadTranscript';

// Mock browser APIs for testing download functionality
const createObjectURL = jest.fn(() => 'blob:url');
const revokeObjectURL = jest.fn();
const open = jest.fn(() => ({} as Window));

global.URL.createObjectURL = createObjectURL;
global.URL.revokeObjectURL = revokeObjectURL;
global.window.open = open;

// Use correct type annotation for the fetch mock
const fetchMock = jest.fn();
global.fetch = fetchMock;

describe('downloadTranscript', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('throws if messages is not an array', async () => {
  // Intentionally pass non-array value to exercise error handling
  const fn = downloadTranscript as unknown as (m: unknown) => Promise<void>;
  await expect(fn(null)).rejects.toThrow('Transcript must be an array');
  });

  it('calls fetch and opens transcript in new tab for valid messages', async () => {
    const htmlContent = '<html><head><title>Test Transcript</title></head><body>test</body></html>';
    fetchMock.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(htmlContent),
    });
    const messages = [{ sender: 'User', text: 'Hello' }];
    const bot = { name: 'TestBot', avatarUrl: '/test-avatar.jpg' };
    await downloadTranscript(messages, bot);
    // Allow setTimeout in test to complete
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/transcript',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"messages":[{"sender":"User","text":"Hello"}]')
      })
    );
  const callArgs = fetchMock.mock.calls[0][1] as unknown as Record<string, unknown>;
  const body = JSON.parse(callArgs.body as string);
    expect(body.bot).toEqual(bot);
    expect(typeof body.exportedAt).toBe('string');
    expect(createObjectURL).toHaveBeenCalledWith(new Blob([htmlContent], { type: 'text/html; charset=utf-8' }));
    expect(open).toHaveBeenCalledWith('blob:url', '_blank');
    expect(revokeObjectURL).toHaveBeenCalled();
  });

  it('throws if fetch fails', async () => {
    fetchMock.mockRejectedValue(new Error('Network error'));
    await expect(downloadTranscript([])).rejects.toThrow('Network error');
  });

  it('throws if response is not ok', async () => {
    fetchMock.mockResolvedValue({ 
      ok: false, 
      status: 500,
      text: () => Promise.resolve('Server error')
    });
    await expect(downloadTranscript([])).rejects.toThrow('API error (500): Server error');
  });

  it('throws if text conversion fails', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      text: () => { throw new Error('text error'); },
    });
    await expect(downloadTranscript([])).rejects.toThrow('text error');
  });

  it('throws if window.open fails (popup blocker)', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('<html>test</html>'),
    });
    global.window.open = jest.fn(() => null);
    await expect(downloadTranscript([])).rejects.toThrow('Failed to open new tab - popup blocker may be active');
    global.window.open = open;
  });

  it('throws if window.URL.createObjectURL is not available', async () => {
    const orig = global.URL.createObjectURL;
  // @ts-expect-error test-mock: simulate missing createObjectURL
  global.URL.createObjectURL = undefined;
    fetchMock.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('<html>test</html>'),
    });
    await expect(downloadTranscript([])).rejects.toThrow('Browser does not support required APIs for opening new tabs');
    global.URL.createObjectURL = orig;
  });
});
