import { render, screen, fireEvent } from '@testing-library/react';
import Button from '../../components/ui/Button';
import { describe, it, expect, vi } from 'vitest';

describe('Button Component', () => {
  it('renders children correctly', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByText('Click me')).toBeInTheDocument();
  });

  it('handles click events', () => {
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>Click me</Button>);
    
    fireEvent.click(screen.getByText('Click me'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('applies basic styles', () => {
    const { container } = render(<Button>Styled</Button>);
    // Con CSS Modules, la clase es algo como _btn_8ea813
    expect(container.firstChild.className).toMatch(/btn/);
  });
});
