import { render, screen, waitFor } from '@testing-library/react';
import CommissionReport from '../../modules/sales/CommissionReport';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import api from '../../services/api';

// Mocks
vi.mock('../../services/api');
vi.mock('../../context/ToastContext', () => ({
  useToast: () => ({ showToast: vi.fn() })
}));
vi.mock('../../context/WindowContext', () => ({
  useWindow: () => ({ openWindow: vi.fn() })
}));

describe('CommissionReport Module', () => {
  const mockSummary = [
    {
      salesperson_id: '1',
      salesperson_name: 'Vendedor 1',
      total_commission: 1000,
      paid_commission: 200,
      pending_commission: 800,
      document_count: 5
    }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the summary table after loading', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/entities/') return Promise.resolve([]);
      if (url === '/sales/commissions/summary') return Promise.resolve(mockSummary);
      return Promise.resolve([]);
    });

    render(<CommissionReport />);

    await waitFor(() => {
      expect(screen.getByText('Vendedor 1')).toBeInTheDocument();
    });

    // En es-AR, USD se formatea como US$
    // El monto aparece tanto en el SummaryCard como en la BentoCard del vendedor
    expect(screen.getAllByText(/US\$\s*1\.000,00/)).toHaveLength(2);
    expect(screen.getAllByText(/US\$\s*800,00/)).toHaveLength(2);
  });

  it('shows empty message when no data', async () => {
    api.get.mockResolvedValue([]);
    
    render(<CommissionReport />);
    
    await waitFor(() => {
      expect(screen.getByText(/Sin Comisionistas/i)).toBeInTheDocument();
    });
  });
});
