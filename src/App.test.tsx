import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import App from './App';

// Mock the Supabase client to avoid actual API calls during tests
jest.mock('./lib/supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: jest.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: jest.fn().mockReturnValue({ data: { subscription: { unsubscribe: jest.fn() } } }),
    },
  },
}));

// Mock the stores
jest.mock('./stores/authStore', () => ({
  useAuthStore: jest.fn().mockReturnValue({
    user: null,
    setUser: jest.fn(),
  }),
}));

jest.mock('./stores/pilotProgramStore', () => ({
  usePilotProgramStore: jest.fn().mockReturnValue({
    resetAll: jest.fn(),
  }),
}));

// Mock hooks
jest.mock('./hooks/useOnlineStatus', () => ({
  useOnlineStatus: jest.fn().mockReturnValue(true),
}));

jest.mock('./utils/syncManager', () => ({
  getPendingSubmissionsCount: jest.fn().mockResolvedValue(0),
  syncPendingSubmissions: jest.fn().mockResolvedValue({ success: true, pendingCount: 0 }),
  setupAutoSync: jest.fn().mockReturnValue(jest.fn()),
}));

test('renders login page when not authenticated', async () => {
  render(
    <BrowserRouter>
      <App />
    </BrowserRouter>
  );
  
  // Wait for the loading screen to disappear
  await new Promise((resolve) => setTimeout(resolve, 100));
  
  // Check if the login page is rendered
  expect(screen.getByText(/GRMTek Sporeless/i)).toBeInTheDocument();
});