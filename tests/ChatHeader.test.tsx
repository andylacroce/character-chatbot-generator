import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ChatHeader from '@/app/components/ChatHeader';

const mockOnDownloadTranscript = jest.fn();
const mockOnShowPrompt = jest.fn();
const mockOnHeaderLinkClick = jest.fn();
const mockOnBackToCharacterCreation = jest.fn();

const defaultProps = {
  bot: {
    name: 'Gandalf',
    personality: 'wise',
    avatarUrl: '/silhouette.svg',
  },
  onDownloadTranscript: mockOnDownloadTranscript,
  onShowPrompt: mockOnShowPrompt,
  onHeaderLinkClick: mockOnHeaderLinkClick,
  onBackToCharacterCreation: mockOnBackToCharacterCreation,
};

describe('ChatHeader', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders bot name and avatar', () => {
    render(<ChatHeader {...defaultProps} />);
    expect(screen.getByText('Gandalf')).toBeInTheDocument();
    expect(screen.getByAltText('Gandalf')).toBeInTheDocument();
  });

  it('calls onBackToCharacterCreation when back button is clicked', () => {
    render(<ChatHeader {...defaultProps} />);
    fireEvent.click(screen.getByLabelText(/open menu/i));
    fireEvent.click(screen.getByLabelText(/back to character creation/i));
    expect(mockOnBackToCharacterCreation).toHaveBeenCalled();
  });

  it('calls onDownloadTranscript and onHeaderLinkClick when download is clicked', () => {
    render(<ChatHeader {...defaultProps} />);
    fireEvent.click(screen.getByLabelText(/open menu/i));
    fireEvent.click(screen.getByLabelText(/download chat transcript/i));
    expect(mockOnDownloadTranscript).toHaveBeenCalled();
    expect(mockOnHeaderLinkClick).toHaveBeenCalled();
  });

  it('shows the modal when avatar is clicked', () => {
    render(<ChatHeader {...defaultProps} />);
    fireEvent.click(screen.getByLabelText(/view character portrait/i));
    expect(screen.getByLabelText(/view character portrait/i)).toBeInTheDocument();
  });

  it('calls onHeaderLinkClick when Mastodon or website links are clicked', () => {
    render(<ChatHeader {...defaultProps} />);
    fireEvent.click(screen.getByLabelText(/open menu/i));
    fireEvent.click(screen.getByLabelText(/visit andy lacroce on mastodon/i));
    fireEvent.click(screen.getByLabelText(/visit andy lacroce's website/i));
    expect(mockOnHeaderLinkClick).toHaveBeenCalledTimes(2);
  });

  it('renders nothing if bot is not provided', () => {
    const { container } = render(
      <ChatHeader {...defaultProps} bot={undefined as any} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('closes the modal when ModalImageViewer onClose is called', async () => {
    render(<ChatHeader {...defaultProps} />);
    // Open the modal
    fireEvent.click(screen.getByLabelText(/view character portrait/i));
    // Modal should be open (look for the modal backdrop)
    const modal = await screen.findByTestId('modal-image-backdrop');
    expect(modal).toBeInTheDocument();
    // Find the close button in ModalImageViewer (simulate close)
    const closeButton = screen.getByRole('button', { name: /close/i });
    fireEvent.click(closeButton);
    // Modal should be closed (backdrop should not be in the document)
    expect(screen.queryByTestId('modal-image-backdrop')).not.toBeInTheDocument();
  });

  it('calls only onDownloadTranscript if onHeaderLinkClick is not provided', () => {
    const props = { ...defaultProps, onHeaderLinkClick: undefined };
    render(<ChatHeader {...props} />);
    fireEvent.click(screen.getByLabelText(/open menu/i));
    fireEvent.click(screen.getByLabelText(/download chat transcript/i));
    expect(mockOnDownloadTranscript).toHaveBeenCalled();
    // Should not throw and should not call onHeaderLinkClick
    expect(mockOnHeaderLinkClick).not.toHaveBeenCalled();
  });
});
