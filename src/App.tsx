import { QueryClientProvider } from '@tanstack/react-query';
import { AppRouter } from './routes';
import { queryClient } from './data/queries';

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppRouter />
    </QueryClientProvider>
  );
}
