import { DependencyList, useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage } from './client';

export interface ApiData<T> {
  data: T | undefined;
  error: string | null;
  isLoading: boolean; // true while the first (or a dependency-triggered) load is running
  reload: () => Promise<void>;
  setData: (update: T | ((current: T | undefined) => T)) => void; // for optimistic / post-mutation updates
}

// Loads data for a page: re-runs when `deps` change, ignores responses that arrive after a newer request.
// Usage: const { data, error, isLoading, reload } = useApiData(() => employeesApi.list({ search }), [search]);
export function useApiData<T>(load: () => Promise<T>, deps: DependencyList): ApiData<T> {
  const [data, setDataState] = useState<T | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const requestId = useRef(0);
  const loadRef = useRef(load);
  loadRef.current = load;

  const run = useCallback(async () => {
    const id = ++requestId.current;
    setIsLoading(true);
    try {
      const result = await loadRef.current();
      if (id === requestId.current) {
        setDataState(result);
        setError(null);
      }
    } catch (err) {
      if (id === requestId.current) setError(errorMessage(err));
    } finally {
      if (id === requestId.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const setData = useCallback((update: T | ((current: T | undefined) => T)) => {
    setDataState(current => (typeof update === 'function' ? (update as (c: T | undefined) => T)(current) : update));
  }, []);

  return { data, error, isLoading, reload: run, setData };
}
