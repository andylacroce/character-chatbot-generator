// Manual Jest mock for @vercel/blob/fetch to prevent undici TCPWRAP handle leaks
module.exports = {
  __esModule: true,
  default: jest.fn(() => Promise.resolve({ ok: true, status: 200, json: async () => ({}) })),
};
