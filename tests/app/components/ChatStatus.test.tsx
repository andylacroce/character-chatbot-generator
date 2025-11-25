import React from 'react';
import { render, screen } from '@testing-library/react';
import ChatStatus from '../../../app/components/ChatStatus';

describe('ChatStatus', () => {
  it('shows nothing significant when no error and not retrying', () => {
    const { container } = render(<ChatStatus error="" retrying={false} />);
    expect(container.querySelector('div')).toBeInTheDocument();
  });

  it('shows error message when error provided', () => {
    render(<ChatStatus error="Something went wrong" retrying={false} />);
    expect(screen.getByText(/Something went wrong/i)).toBeInTheDocument();
  });

  it('shows retrying message', () => {
    render(<ChatStatus error="" retrying={true} />);
    expect(screen.getByText(/Retrying/i)).toBeInTheDocument();
  });

  it('shows both error and retrying status', () => {
    render(<ChatStatus error="Failed" retrying={true} />);
    expect(screen.getByText(/Failed/i)).toBeInTheDocument();
    expect(screen.getByText(/Retrying/i)).toBeInTheDocument();
  });
});
