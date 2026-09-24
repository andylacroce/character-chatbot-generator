// Manual Jest mock for @vercel/blob/head to prevent undici TCPWRAP handle leaks
module.exports = jest.fn(async () => undefined); // Always resolves to undefined (no blob found)
