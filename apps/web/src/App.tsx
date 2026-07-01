import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <div style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
        <h1>CrestFlow Platform</h1>
        <p>AI-native financial intelligence on Algorand.</p>
        <p style={{ color: '#888' }}>Dashboard coming in Plan 08+</p>
      </div>
    </QueryClientProvider>
  );
}
