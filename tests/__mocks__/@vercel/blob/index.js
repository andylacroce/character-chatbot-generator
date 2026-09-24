// Manual Jest mock for @vercel/blob to prevent undici TCPWRAP handle leaks
module.exports = {
  __esModule: true,
  put: jest.fn(async () => ({})),
  head: jest.fn(async () => undefined),
};
