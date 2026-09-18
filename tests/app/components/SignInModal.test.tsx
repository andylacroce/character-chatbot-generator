import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import SignInModal from "@/app/components/SignInModal";

const mockSignIn = jest.fn();

jest.mock("next-auth/react", () => ({
  signIn: (...args: unknown[]) => mockSignIn(...args),
}));

describe("SignInModal", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders nothing when show is false", () => {
    const { container } = render(
      <SignInModal show={false} onClose={jest.fn()} providerIds={["google"]} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders the lightbox with a Continue with Google button when show is true", () => {
    render(<SignInModal show={true} onClose={jest.fn()} providerIds={["google"]} />);
    expect(screen.getByTestId("sign-in-modal-backdrop")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /continue with google/i })).toBeInTheDocument();
  });

  it('calls signIn("google") when the Google button is clicked', () => {
    render(<SignInModal show={true} onClose={jest.fn()} providerIds={["google"]} />);
    fireEvent.click(screen.getByRole("button", { name: /continue with google/i }));
    expect(mockSignIn).toHaveBeenCalledWith("google", { callbackUrl: "/" });
  });

  it("calls onClose when the backdrop is clicked", () => {
    const onClose = jest.fn();
    render(<SignInModal show={true} onClose={onClose} providerIds={["google"]} />);
    fireEvent.click(screen.getByTestId("sign-in-modal-backdrop"));
    expect(onClose).toHaveBeenCalled();
  });

  it("does not call onClose when the modal content itself is clicked", () => {
    const onClose = jest.fn();
    render(<SignInModal show={true} onClose={onClose} providerIds={["google"]} />);
    fireEvent.click(screen.getByText("Sign in"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("calls onClose when the close button is clicked", () => {
    const onClose = jest.fn();
    render(<SignInModal show={true} onClose={onClose} providerIds={["google"]} />);
    fireEvent.click(screen.getByLabelText("Close sign in"));
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose when Escape is pressed while shown", () => {
    const onClose = jest.fn();
    render(<SignInModal show={true} onClose={onClose} providerIds={["google"]} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("does not listen for Escape when not shown", () => {
    const onClose = jest.fn();
    render(<SignInModal show={false} onClose={onClose} providerIds={["google"]} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("does not render a magic-link form when the email provider isn't configured", () => {
    render(<SignInModal show={true} onClose={jest.fn()} providerIds={["google"]} />);
    expect(screen.queryByLabelText("Email address")).not.toBeInTheDocument();
  });

  it("does not render a magic-link form when providerIds is null", () => {
    render(<SignInModal show={true} onClose={jest.fn()} providerIds={null} />);
    expect(screen.queryByLabelText("Email address")).not.toBeInTheDocument();
  });

  it("renders a magic-link form when the email provider is configured", () => {
    render(<SignInModal show={true} onClose={jest.fn()} providerIds={["google", "email"]} />);
    expect(screen.getByLabelText("Email address")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /send magic link/i })).toBeInTheDocument();
  });

  it("sends a magic link and shows a confirmation on success", async () => {
    mockSignIn.mockResolvedValue({ error: null });
    render(<SignInModal show={true} onClose={jest.fn()} providerIds={["google", "email"]} />);

    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "user@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send magic link/i }));

    expect(mockSignIn).toHaveBeenCalledWith("email", {
      email: "user@example.com",
      redirect: false,
      callbackUrl: "/",
    });
    await waitFor(() => expect(screen.getByTestId("magic-link-sent")).toBeInTheDocument());
    expect(screen.getByTestId("magic-link-sent")).toHaveTextContent("user@example.com");
  });

  it("shows an error message when sending the magic link fails", async () => {
    mockSignIn.mockResolvedValue({ error: "EmailSignInError" });
    render(<SignInModal show={true} onClose={jest.fn()} providerIds={["google", "email"]} />);

    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "user@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send magic link/i }));

    await waitFor(() => expect(screen.getByText(/couldn't send that link/i)).toBeInTheDocument());
    expect(screen.queryByTestId("magic-link-sent")).not.toBeInTheDocument();
  });

  it("does not submit when the email field is empty", () => {
    render(<SignInModal show={true} onClose={jest.fn()} providerIds={["google", "email"]} />);
    fireEvent.click(screen.getByRole("button", { name: /send magic link/i }));
    expect(mockSignIn).not.toHaveBeenCalled();
  });
});
