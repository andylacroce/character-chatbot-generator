import { downloadTranscript } from '../src/utils/downloadTranscript';

// Mock browser APIs
const createObjectURL = jest.fn(() => 'blob:url');
const revokeObjectURL = jest.fn();
const click = jest.fn();
const appendChild = jest.fn();
const remove = jest.fn();

global.URL.createObjectURL = createObjectURL;
global.URL.revokeObjectURL = revokeObjectURL;

global.document.createElement = jest.fn(() => {
  // Minimal mock of HTMLAnchorElement
  return {
    href: '',
    download: '',
    click,
    remove,
    style: {},
    setAttribute: jest.fn(),
    getAttribute: jest.fn(),
    // Add any other properties/methods your code under test uses
  } as unknown as HTMLAnchorElement;
});
global.document.body.appendChild = appendChild;

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

  it('calls fetch and triggers download for valid messages', async () => {
    const blob = new Blob(['test'], { type: 'text/plain' });
    fetchMock.mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(blob),
    });
    const messages = [{ sender: 'User', text: 'Hello' }];
    await downloadTranscript(messages);
    // Wait for the setTimeout to flush
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/transcript',
      expect.objectContaining({ method: 'POST' })
    );
    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(appendChild).toHaveBeenCalled();
    expect(click).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalled();
    expect(remove).toHaveBeenCalled();
  });

  it('throws if fetch fails', async () => {
    fetchMock.mockRejectedValue(new Error('Network error'));
    await expect(downloadTranscript([])).rejects.toThrow('Network error');
  });

  it('throws if response is not ok', async () => {
    fetchMock.mockResolvedValue({ ok: false });
    await expect(downloadTranscript([])).rejects.toThrow('Failed to fetch transcript');
  });

  it('throws if blob conversion fails', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      blob: () => { throw new Error('blob error'); },
    });
    await expect(downloadTranscript([])).rejects.toThrow('blob error');
  });

  it('throws if window.URL.createObjectURL is not available', async () => {
    const orig = global.URL.createObjectURL;
    // @ts-ignore
    global.URL.createObjectURL = undefined;
    fetchMock.mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(new Blob(['test'])),
    });
    await expect(downloadTranscript([])).rejects.toThrow('window.URL.createObjectURL is not available');
    global.URL.createObjectURL = orig;
  });
});
