import { downloadTranscript } from '../src/utils/downloadTranscript';

// Mock browser APIs
const createObjectURL = jest.fn(() => 'blob:url');
const revokeObjectURL = jest.fn();
const open = jest.fn(() => ({} as Window));

global.URL.createObjectURL = createObjectURL;
global.URL.revokeObjectURL = revokeObjectURL;
global.window.open = open;

// Use correct type for fetch mock
const fetchMock = jest.fn();
global.fetch = fetchMock;

describe('downloadTranscript', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('throws if messages is not an array', async () => {
    await expect(downloadTranscript(null as any)).rejects.toThrow('Transcript must be an array');
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
    // Wait for the setTimeout to flush
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/transcript',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"messages":[{"sender":"User","text":"Hello"}]')
      })
    );
    const callArgs = fetchMock.mock.calls[0][1] as any;
    const body = JSON.parse(callArgs.body);
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
    fetchMock.mockResolvedValue({ ok: false });
    await expect(downloadTranscript([])).rejects.toThrow('Failed to fetch transcript');
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
    // @ts-ignore
    global.URL.createObjectURL = undefined;
    fetchMock.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('<html>test</html>'),
    });
    await expect(downloadTranscript([])).rejects.toThrow('window.URL.createObjectURL is not available');
    global.URL.createObjectURL = orig;
  });
});
