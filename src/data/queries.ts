import { QueryClient, useQuery } from '@tanstack/react-query';
import type { FlightsFile, Manifest, NgtFile, ProgressFile } from '@/domain/types';
import { fetchDataFile, type Fetched } from './client';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchInterval: 5 * 60_000, // snapshots change at most hourly; cheap static GETs
      refetchOnWindowFocus: true,
      retry: 2,
    },
  },
});

export function useFlightsFile() {
  return useQuery<Fetched<FlightsFile>>({
    queryKey: ['flights'],
    queryFn: () => fetchDataFile<FlightsFile>('flights.json'),
  });
}

export function useProgressFile() {
  return useQuery<Fetched<ProgressFile>>({
    queryKey: ['progress'],
    queryFn: () => fetchDataFile<ProgressFile>('progress.json'),
  });
}

export function useNgtFile() {
  return useQuery<Fetched<NgtFile>>({
    queryKey: ['ngt'],
    queryFn: () => fetchDataFile<NgtFile>('ngt.json'),
  });
}

export function useManifest() {
  return useQuery<Fetched<Manifest>>({
    queryKey: ['manifest'],
    queryFn: () => fetchDataFile<Manifest>('manifest.json'),
  });
}

/** Convenience: the flight list (empty while loading). */
export function useFlights() {
  const q = useFlightsFile();
  return { ...q, flights: q.data?.data.flights ?? [] };
}

export function useStudents() {
  const q = useProgressFile();
  return {
    ...q,
    students: q.data?.data.students ?? [],
    curriculum: q.data?.data.curriculum ?? [],
  };
}
