import { downloadTranscript } from '../../src/utils/downloadTranscript';

// Mock browser APIs for testing download functionality
const createObjectURL = jest.fn(() => 'blob:url');
const revokeObjectURL = jest.fn();

global.URL.createObjectURL = createObjectURL;
global.URL.revokeObjectURL = revokeObjectURL;

const fetchMock = jest.fn();
global.fetch = fetchMock;

describe('downloadTranscript', () => {
  let mockAnchor: { href: string; download: string; click: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    // Re-assert globals in case a prior test left them undefined
    global.URL.createObjectURL = createObjectURL;
    global.URL.revokeObjectURL = revokeObjectURL;
    mockAnchor = { href: '', download: '', click: jest.fn() };
    jest.spyOn(document, 'createElement').mockReturnValue(mockAnchor as unknown as HTMLElement);
    jest.spyOn(document.body, 'appendChild').mockReturnValue(mockAnchor as unknown as ChildNode);
    jest.spyOn(document.body, 'removeChild').mockReturnValue(mockAnchor as unknown as ChildNode);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('throws if messages is not an array', async () => {
    const fn = downloadTranscript as unknown as (m: unknown) => Promise<void>;
    await expect(fn(null)).rejects.toThrow('Transcript must be an array');
  });

  it('calls fetch and downloads transcript as HTML file for valid messages', async () => {
    const htmlContent = '<html><head><title>Test Transcript</title></head><body>test</body></html>';
    fetchMock.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(htmlContent),
    });
    const messages = [{ sender: 'User', text: 'Hello' }];
    const bot = { name: 'TestBot', avatarUrl: '/test-avatar.jpg' };
    await downloadTranscript(messages, bot);
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
    expect(document.createElement).toHaveBeenCalledWith('a');
    expect(mockAnchor.href).toBe('blob:url');
    expect(mockAnchor.download).toMatch(/^testbot-transcript-\d{4}-\d{2}-\d{2}-\d{6}\.html$/);
    expect(mockAnchor.click).toHaveBeenCalled();
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

  it('uses "Unknown error" fallback when response.text() rejects on non-ok response', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 503,
      text: () => Promise.reject(new Error('read failed')),
    });
    await expect(downloadTranscript([])).rejects.toThrow('API error (503): Unknown error');
  });

  it('throws if window.URL.createObjectURL is not available', async () => {
    const orig = global.URL.createObjectURL;
    // @ts-expect-error test-mock: simulate missing createObjectURL
    global.URL.createObjectURL = undefined;
    fetchMock.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('<html>test</html>'),
    });
    await expect(downloadTranscript([])).rejects.toThrow('Browser does not support required APIs for downloading transcripts');
    global.URL.createObjectURL = orig;
  });

  it('wraps non-Error network rejections in message string (cond-expr branch)', async () => {
    fetchMock.mockRejectedValue('plain string error');
    await expect(downloadTranscript([])).rejects.toThrow('Network error: plain string error');
  });

  it('wraps non-Error response.text() rejections in message string (cond-expr branch)', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      text: () => { throw 'text read failure string'; },
    });
    await expect(downloadTranscript([])).rejects.toThrow('Failed to read response: text read failure string');
  });

  it('skips revokeObjectURL in setTimeout when URL.revokeObjectURL is unavailable', async () => {
    const origRevoke = global.URL.revokeObjectURL;
    // @ts-expect-error test-mock: simulate missing revokeObjectURL
    global.URL.revokeObjectURL = undefined;
    fetchMock.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('<html>test</html>'),
    });
    await expect(downloadTranscript([])).resolves.toBeUndefined();
    await new Promise((resolve) => setTimeout(resolve, 10));
    global.URL.revokeObjectURL = origRevoke;
  });
});
