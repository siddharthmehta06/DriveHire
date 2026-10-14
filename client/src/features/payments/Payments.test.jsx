import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../App';
import { AuthProvider } from '../../context/AuthContext';

function session(role = 'USER', userId = 'passenger-1', name = 'Test Passenger') {
  window.localStorage.setItem(
    'drivehire-session',
    JSON.stringify({
      token: 'test-token',
      user: {
        id: userId,
        name,
        email: `${userId}@example.com`,
        role,
      },
    })
  );
}

function jsonResponse(data, meta) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ success: true, data, ...(meta ? { meta } : {}) }),
  };
}

const mockPayment = {
  id: 'pay-1',
  bookingId: 'booking-1',
  payerId: 'passenger-1',
  payeeId: 'driver-1',
  status: 'PENDING',
  method: 'ONLINE',
  baseAmount: '600.00',
  discountAmount: '0.00',
  amount: '600.00',
  commissionRatePct: '10.00',
  commissionAmount: '60.00',
  payeeAmount: '540.00',
  promoCode: null,
};

const mockReceipt = {
  id: 'pay-1',
  receiptNumber: 'DH-20261014-000001',
  bookingId: 'booking-1',
  bookingType: 'RIDE',
  method: 'ONLINE',
  status: 'SUCCEEDED',
  baseAmount: '600.00',
  discountAmount: '100.00',
  amount: '500.00',
  commissionRatePct: '10.00',
  commissionAmount: '50.00',
  payeeAmount: '450.00',
  paidAt: '2026-10-14T02:00:00.000Z',
  createdAt: '2026-10-14T01:50:00.000Z',
  payer: { id: 'passenger-1', name: 'Test Passenger', email: 'passenger-1@example.com' },
  payee: { id: 'driver-1', name: 'Test Driver', email: 'driver-1@example.com' },
  promoCode: { code: 'SAVE100', discountType: 'FLAT', value: '100.00' },
};

afterEach(() => {
  cleanup();
  window.history.pushState({}, '', '/');
  window.localStorage.clear();
  vi.unstubAllGlobals();
});

describe('F06 Payments Frontend Flows', () => {
  it('renders PaymentPage, applies promo code, and completes mock checkout', async () => {
    let applied = false;
    let completed = false;

    const fetchMock = vi.fn((url, options) => {
      if (url === '/api/payments/pay-1' && (!options?.method || options.method === 'GET')) {
        return jsonResponse(applied ? {
          ...mockPayment,
          discountAmount: '60.00',
          amount: '540.00',
          promoCode: { code: 'DISC10', discountType: 'PERCENT', value: '10' },
        } : mockPayment);
      }
      if (url === '/api/payments/pay-1/promo' && options?.method === 'POST') {
        applied = true;
        return jsonResponse({
          ...mockPayment,
          discountAmount: '60.00',
          amount: '540.00',
          promoCode: { code: 'DISC10', discountType: 'PERCENT', value: '10' },
        });
      }
      if (url === '/api/payments/pay-1/pay-online' && options?.method === 'POST') {
        return jsonResponse({
          orderId: 'order_mock_123',
          keyId: 'mock_key_id',
          amount: '540.00',
          currency: 'INR',
          paymentId: 'pay-1',
          status: 'PROCESSING',
        });
      }
      if (url === '/api/payments/pay-1/mock/complete' && options?.method === 'POST') {
        completed = true;
        return jsonResponse({
          ...mockPayment,
          status: 'SUCCEEDED',
          amount: '540.00',
          receiptNumber: 'DH-20261014-000001',
        });
      }
      return jsonResponse([], { unreadCount: 0 });
    });
    vi.stubGlobal('fetch', fetchMock);

    session('USER', 'passenger-1');
    window.history.pushState({}, '', '/payments/pay-1');

    render(
      <AuthProvider>
        <App />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Trip Payment')).toBeInTheDocument();
      expect(screen.getByText('Base Ride Fare')).toBeInTheDocument();
      expect(screen.getByText('Net Payable Amount')).toBeInTheDocument();
    });

    // Apply promo code
    const promoInput = screen.getByPlaceholderText('e.g. DRIVE20');
    fireEvent.change(promoInput, { target: { value: 'DISC10' } });
    fireEvent.click(screen.getByText('Apply'));

    await waitFor(() => {
      expect(screen.getByText(/Promo code DISC10 applied successfully/i)).toBeInTheDocument();
    });

    // Initiate payment
    const payBtn = screen.getByText(/Pay ₹540.00 Online/i);
    fireEvent.click(payBtn);

    // Mock modal appears
    await waitFor(() => {
      expect(screen.getByText('DriveHire Mock Payment Gateway')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Simulate Success (Pay)'));

    await waitFor(() => {
      expect(screen.getByText(/Mock payment successful/i)).toBeInTheDocument();
      expect(screen.getByText('View Digital Receipt')).toBeInTheDocument();
    });
    expect(completed).toBe(true);
  });

  it('renders ReceiptPage with receipt number, breakdown and PDF download button', async () => {
    let pdfDownloaded = false;
    const fetchMock = vi.fn((url) => {
      if (url === '/api/payments/pay-1/receipt') {
        return jsonResponse(mockReceipt);
      }
      if (url === '/api/payments/pay-1/receipt.pdf') {
        pdfDownloaded = true;
        return {
          ok: true,
          status: 200,
          blob: async () => new Blob(['%PDF-1.4 test'], { type: 'application/pdf' }),
        };
      }
      return jsonResponse([], { unreadCount: 0 });
    });
    vi.stubGlobal('fetch', fetchMock);
    window.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
    window.URL.revokeObjectURL = vi.fn();

    session('USER', 'passenger-1');
    window.history.pushState({}, '', '/receipts/pay-1');

    render(
      <AuthProvider>
        <App />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('DIGITAL TAX INVOICE & RECEIPT')).toBeInTheDocument();
      expect(screen.getByText('DH-20261014-000001')).toBeInTheDocument();
      expect(screen.getAllByText('Test Passenger').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Test Driver')).toBeInTheDocument();
      expect(screen.getByText('Download PDF Receipt')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Download PDF Receipt'));
    await waitFor(() => {
      expect(pdfDownloaded).toBe(true);
    });
  });

  it('renders DriverRideManagePage with "Confirm cash received" and processes confirmation', async () => {
    let cashConfirmed = false;
    const mockRide = {
      id: 'ride-1',
      driverId: 'driver-1',
      vehicleId: 'vehicle-1',
      originText: 'Pune Station',
      destText: 'Mumbai Airport',
      departureTime: new Date(Date.now() + 3600000).toISOString(),
      totalSeats: 3,
      availableSeats: 2,
      costPerSeat: '600.00',
      status: 'OPEN',
    };
    const mockBooking = {
      id: 'booking-1',
      userId: 'passenger-1',
      status: 'ACCEPTED',
      rideBooking: { seatsBooked: 1, pickupNote: 'Gate 2' },
      user: { name: 'Passenger One', email: 'p1@example.com', phone: '9999999999' },
    };
    const mockCashPayment = {
      id: 'pay-cash-1',
      bookingId: 'booking-1',
      method: 'CASH',
      status: 'PENDING',
      amount: '600.00',
    };

    const fetchMock = vi.fn((url, options) => {
      if (url === '/api/rides/ride-1') return jsonResponse(mockRide);
      if (url === '/api/rides/ride-1/bookings') return jsonResponse([mockBooking]);
      if (url === '/api/payments/booking/booking-1') return jsonResponse(mockCashPayment);
      if (url === '/api/payments/pay-cash-1/confirm-cash' && options?.method === 'POST') {
        cashConfirmed = true;
        return jsonResponse({ ...mockCashPayment, status: 'SUCCEEDED' });
      }
      return jsonResponse([], { unreadCount: 0 });
    });
    vi.stubGlobal('fetch', fetchMock);

    session('DRIVER', 'driver-1', 'Test Driver');
    window.history.pushState({}, '', '/driver/rides/ride-1');

    render(
      <AuthProvider>
        <App />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Confirm cash received')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Confirm cash received'));

    await waitFor(() => {
      expect(cashConfirmed).toBe(true);
      expect(screen.getByText(/Cash payment of ₹600.00 confirmed/i)).toBeInTheDocument();
    });
  });

  it('renders AdminCommissionPage and allows updating the commission rate', async () => {
    let updatedRate = null;
    const fetchMock = vi.fn((url, options) => {
      if (url === '/api/admin/pricing/commission' && (!options?.method || options.method === 'GET')) {
        return jsonResponse({
          id: 1,
          commissionRatePct: '10.00',
          updatedAt: new Date().toISOString(),
          updatedById: 'admin-1',
        });
      }
      if (url === '/api/admin/pricing/commission' && options?.method === 'PUT') {
        const body = JSON.parse(options.body);
        updatedRate = body.commissionRatePct;
        return jsonResponse({
          id: 1,
          commissionRatePct: '15.00',
          updatedAt: new Date().toISOString(),
          updatedById: 'admin-1',
        });
      }
      return jsonResponse([], { unreadCount: 0 });
    });
    vi.stubGlobal('fetch', fetchMock);

    session('ADMIN', 'admin-1', 'Administrator');
    window.history.pushState({}, '', '/admin/pricing');

    render(
      <AuthProvider>
        <App />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Commission & Pricing')).toBeInTheDocument();
      expect(screen.getByDisplayValue('10.00')).toBeInTheDocument();
    });

    const input = screen.getByLabelText(/Commission Rate/i);
    fireEvent.change(input, { target: { value: '15' } });
    fireEvent.click(screen.getByText('Save Commission Rate'));

    await waitFor(() => {
      expect(screen.getByText(/successfully updated to 15.00%/i)).toBeInTheDocument();
    });
    expect(updatedRate).toBe(15);
  });

  it('renders AdminPromoCodesPage and lists promo codes', async () => {
    const mockPromos = [
      {
        id: 'promo-1',
        code: 'WELCOME50',
        discountType: 'PERCENT',
        value: '50.00',
        minAmount: '200.00',
        maxDiscount: '100.00',
        usageLimit: 50,
        usedCount: 5,
        validFrom: new Date().toISOString(),
        validUntil: new Date(Date.now() + 86400000).toISOString(),
        active: true,
      },
    ];

    const fetchMock = vi.fn((url) => {
      if (url.includes('/api/admin/promo-codes')) {
        return jsonResponse(mockPromos);
      }
      return jsonResponse([], { unreadCount: 0 });
    });
    vi.stubGlobal('fetch', fetchMock);

    session('ADMIN', 'admin-1', 'Administrator');
    window.history.pushState({}, '', '/admin/promo-codes');

    render(
      <AuthProvider>
        <App />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Promo Codes Management')).toBeInTheDocument();
      expect(screen.getByText('WELCOME50')).toBeInTheDocument();
      expect(screen.getByText('50.00%')).toBeInTheDocument();
    });
  });

  it('initiates Razorpay checkout and verifies signature on backend when Razorpay provider is active', async () => {
    let verified = false;
    let rzpOptionsPassed = null;

    const mockRzpInstance = {
      open: vi.fn(),
    };
    const RazorpayMock = vi.fn((opts) => {
      rzpOptionsPassed = opts;
      return mockRzpInstance;
    });
    window.Razorpay = RazorpayMock;

    const fetchMock = vi.fn((url, options) => {
      if (url === '/api/payments/pay-1' && (!options?.method || options.method === 'GET')) {
        return jsonResponse(mockPayment);
      }
      if (url === '/api/payments/pay-1/pay-online' && options?.method === 'POST') {
        return jsonResponse({
          orderId: 'order_rzp_123',
          keyId: 'rzp_test_mockkey123',
          amount: '600.00',
          currency: 'INR',
          paymentId: 'pay-1',
          status: 'PROCESSING',
          provider: 'razorpay',
        });
      }
      if (url === '/api/payments/pay-1/verify' && options?.method === 'POST') {
        const body = JSON.parse(options.body);
        if (body.gatewayPaymentId && body.signature) {
          verified = true;
          return jsonResponse({
            ...mockPayment,
            status: 'SUCCEEDED',
            receiptNumber: 'DH-20261014-000002',
          });
        }
      }
      return jsonResponse([], { unreadCount: 0 });
    });
    vi.stubGlobal('fetch', fetchMock);

    session('USER', 'passenger-1');
    window.history.pushState({}, '', '/payments/pay-1');

    render(
      <AuthProvider>
        <App />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Trip Payment')).toBeInTheDocument();
      expect(screen.getByText(/Pay ₹600.00 Online/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/Pay ₹600.00 Online/i));

    await waitFor(() => {
      expect(RazorpayMock).toHaveBeenCalled();
      expect(mockRzpInstance.open).toHaveBeenCalled();
    });

    expect(rzpOptionsPassed.key).toBe('rzp_test_mockkey123');
    expect(rzpOptionsPassed.order_id).toBe('order_rzp_123');

    // Simulate Razorpay handler callback upon successful payment in popup
    await rzpOptionsPassed.handler({
      razorpay_payment_id: 'pay_rzp_test_999',
      razorpay_order_id: 'order_rzp_123',
      razorpay_signature: 'test_valid_signature_hash',
    });

    await waitFor(() => {
      expect(verified).toBe(true);
      expect(screen.getByText(/Payment verified and completed successfully!/i)).toBeInTheDocument();
      expect(screen.getByText('View Digital Receipt')).toBeInTheDocument();
    });
  });
});
