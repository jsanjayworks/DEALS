/**
 * Load data when a screen gains focus, and again whenever the fetcher changes.
 *
 * Re-reading on focus is what keeps screens honest without a cache layer: claim
 * a deal, go back, and the capacity on the detail page is already the new one.
 *
 * Pass a fetcher wrapped in useCallback; its identity is the dependency list.
 * Only the latest request may write state, so a fast radius change cannot be
 * overwritten by a slower earlier response, and nothing lands after blur.
 *
 * Results are applied as a transition. Rendering a fresh feed is the most
 * expensive thing Home does, and as a transition React renders it in slices
 * and lets the browser paint in between, so an animation started by the same
 * tap (the distance thumb, the rolling counts) keeps moving while it lands.
 */

import { startTransition, useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { clearLoadError, onRetry, reportLoadError } from './loadErrors';

let nextQueryId = 0;

export interface QueryState<T> {
  data: T | undefined;
  /** True only until the first result arrives, so refocusing does not flash skeletons. */
  loading: boolean;
  error: Error | null;
  reload: () => void;
}

export function useQuery<T>(fetcher: () => Promise<T>): QueryState<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<Error | null>(null);
  const latest = useRef(0);
  const [queryId] = useState(() => ++nextQueryId);
  const failed = useRef(false);

  const run = useCallback(() => {
    const id = ++latest.current;
    fetcher()
      .then((d) => {
        if (id !== latest.current) return;
        failed.current = false;
        clearLoadError(queryId);
        startTransition(() => {
          setData(d);
          setError(null);
        });
      })
      .catch((e: unknown) => {
        if (id !== latest.current) return;
        failed.current = true;
        reportLoadError(queryId);
        setError(e instanceof Error ? e : new Error(String(e)));
      });
    return () => {
      // Blur, unmount or a new fetcher: whatever is in flight is now stale.
      if (id === latest.current) latest.current++;
    };
  }, [fetcher, queryId]);

  useFocusEffect(run);

  // The app-wide Retry (and coming back online) re-runs only what failed.
  useEffect(() => {
    const off = onRetry(() => {
      if (failed.current) run();
    });
    return () => {
      off();
      clearLoadError(queryId);
    };
  }, [run, queryId]);

  const reload = useCallback(() => {
    run();
  }, [run]);

  return { data, loading: data === undefined && error === null, error, reload };
}
