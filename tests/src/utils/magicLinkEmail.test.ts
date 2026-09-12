const mockSendMail = jest.fn();
const mockCreateTransport = jest.fn().mockReturnValue({ sendMail: mockSendMail });

jest.mock("nodemailer", () => ({
  createTransport: (...args: unknown[]) => mockCreateTransport(...args),
}));

import { sendVerificationRequest } from "../../../src/utils/magicLinkEmail";

describe("magicLinkEmail.sendVerificationRequest", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const baseParams = {
    identifier: "user@example.com",
    url: "https://portrayal.example.com/api/auth/callback/email?token=abc",
    expires: new Date(),
    provider: { server: "smtps://user:pass@smtp.example.com:465", from: "noreply@example.com" },
    token: "abc",
    theme: {},
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;

  it("creates a transport from the provider's server config and sends a branded email", async () => {
    mockSendMail.mockResolvedValue({ rejected: [], pending: [] });

    await sendVerificationRequest(baseParams);

    expect(mockCreateTransport).toHaveBeenCalledWith(baseParams.provider.server);
    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "user@example.com",
        from: "noreply@example.com",
        subject: "Sign in to Portrayal",
        html: expect.stringContaining(baseParams.url),
        text: expect.stringContaining(baseParams.url),
      }),
    );
  });

  it("throws when the transport reports rejected recipients", async () => {
    mockSendMail.mockResolvedValue({ rejected: ["user@example.com"], pending: [] });

    await expect(sendVerificationRequest(baseParams)).rejects.toThrow(
      "Email (user@example.com) could not be sent",
    );
  });

  it("throws when the transport reports pending recipients", async () => {
    mockSendMail.mockResolvedValue({ rejected: [], pending: ["user@example.com"] });

    await expect(sendVerificationRequest(baseParams)).rejects.toThrow(
      "Email (user@example.com) could not be sent",
    );
  });

  it("does not throw when rejected/pending are absent from the result", async () => {
    mockSendMail.mockResolvedValue({});

    await expect(sendVerificationRequest(baseParams)).resolves.toBeUndefined();
  });
});
