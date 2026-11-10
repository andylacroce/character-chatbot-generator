import { fireEvent, render } from "@testing-library/react-native";
import ReportModal from "../../src/components/ReportModal";
import { ThemeProvider } from "../../src/ThemeContext";

const mockSubmit = jest.fn();
jest.mock("../../src/api", () => ({
  submitReport: (...args: unknown[]) => mockSubmit(...args),
}));

const target = { targetType: "message", characterName: "Ada", messageText: "hello" } as const;

function renderModal(onClose = jest.fn()) {
  return render(
    <ThemeProvider>
      <ReportModal target={target} onClose={onClose} />
    </ThemeProvider>,
  );
}

describe("ReportModal", () => {
  beforeEach(() => jest.clearAllMocks());

  it("renders nothing without a target", async () => {
    const { queryByText } = await render(
      <ThemeProvider>
        <ReportModal target={null} onClose={jest.fn()} />
      </ThemeProvider>,
    );
    expect(queryByText("Report a problem")).toBeNull();
  });

  it("sends the chosen reason and confirms", async () => {
    mockSubmit.mockResolvedValue({});
    const { findByText } = await renderModal();
    fireEvent.press(await findByText("Offensive or inappropriate"));
    fireEvent.press(await findByText("Send report"));
    expect(await findByText("Thanks, we'll take a look.")).toBeTruthy();
    expect(mockSubmit).toHaveBeenCalledWith({ ...target, reason: "offensive", details: undefined });
  });

  it("shows an error when the request fails", async () => {
    mockSubmit.mockRejectedValue(new Error("x"));
    const { findByText } = await renderModal();
    fireEvent.press(await findByText("Something else"));
    fireEvent.press(await findByText("Send report"));
    expect(await findByText("Couldn't send your report. Please try again.")).toBeTruthy();
  });
});
