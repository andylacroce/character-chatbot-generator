import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ChatHeader from '@/app/components/ChatHeader';
import { Bot } from '@/app/components/BotCreator';

const mockOnDownloadTranscript = jest.fn();
const mockOnShowPrompt = jest.fn();
const mockOnHeaderLinkClick = jest.fn();
const mockOnBackToCharacterCreation = jest.fn();
const mockOnAvatarClick = jest.fn();

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
  onAvatarClick: mockOnAvatarClick,
};

describe('ChatHeader', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders bot name and avatar', async () => {
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

  it('hides the Download Transcript button for a character created past an overridden copyright warning', () => {
    render(<ChatHeader {...defaultProps} bot={{ ...defaultProps.bot, skipPersistence: true }} />);
    fireEvent.click(screen.getByLabelText(/open menu/i));
    expect(screen.queryByLabelText(/download chat transcript/i)).not.toBeInTheDocument();
  });

  it('links to the public character wall from the menu, even for a skipPersistence character', () => {
    render(<ChatHeader {...defaultProps} bot={{ ...defaultProps.bot, skipPersistence: true }} />);
    fireEvent.click(screen.getByLabelText(/open menu/i));
    const link = screen.getByLabelText(/view the character wall/i);
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/chars');
  });

  it('calls onAvatarClick when the avatar is clicked', () => {
    // ChatHeader no longer owns the portrait modal itself — ChatPage does, since
    // per-message avatars in ChatMessage open the same shared modal instance.
    render(<ChatHeader {...defaultProps} />);
    fireEvent.click(screen.getByLabelText(/view character portrait/i));
    expect(mockOnAvatarClick).toHaveBeenCalledTimes(1);
  });

  it('calls onHeaderLinkClick when Mastodon or website links are clicked', () => {
    render(<ChatHeader {...defaultProps} />);
    fireEvent.click(screen.getByLabelText(/open menu/i));
    fireEvent.click(screen.getByLabelText(/visit andy lacroce's website/i));
    expect(mockOnHeaderLinkClick).toHaveBeenCalledTimes(1);
  });

  it('renders nothing if bot is not provided', () => {
    const { container } = render(
    <ChatHeader {...defaultProps} bot={undefined as unknown as Bot} />
    );
    expect(container.firstChild).toBeNull();
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
