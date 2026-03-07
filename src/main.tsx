import React from 'react';
import ReactDOM from 'react-dom/client';
import {
  QueryClient,
  QueryClientProvider,
  dehydrate,
  hydrate,
  type DehydratedState,
  type QueryKey,
} from '@tanstack/react-query';
import App from './App';
import './index.css';

const QUERY_CACHE_STORAGE_KEY = 'nuestrohogar:react-query-cache:v2';
const QUERY_CACHE_TTL_MS = 1000 * 60 * 30; // 30 minutos

interface PersistedQueryCache {
  timestamp: number;
  state: DehydratedState;
}

const cacheableQueryRoots = new Set([
  'community-dashboard',
  'community-tasks',
  'task-categories',
  'my-recent-task-logs',
]);

function getQueryRoot(queryKey: QueryKey): string {
  return Array.isArray(queryKey) && typeof queryKey[0] === 'string' ? queryKey[0] : '';
}

function readPersistedQueryCache(): DehydratedState | null {
  try {
    const raw = window.localStorage.getItem(QUERY_CACHE_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as PersistedQueryCache;
    if (!parsed?.timestamp || !parsed?.state) {
      window.localStorage.removeItem(QUERY_CACHE_STORAGE_KEY);
      return null;
    }

    const isExpired = Date.now() - parsed.timestamp > QUERY_CACHE_TTL_MS;
    if (isExpired) {
      window.localStorage.removeItem(QUERY_CACHE_STORAGE_KEY);
      return null;
    }

    return parsed.state;
  } catch {
    window.localStorage.removeItem(QUERY_CACHE_STORAGE_KEY);
    return null;
  }
}

function persistQueryCache(queryClient: QueryClient): void {
  try {
    const dehydratedState = dehydrate(queryClient, {
      shouldDehydrateQuery: (query) => {
        const queryRoot = getQueryRoot(query.queryKey);
        return query.state.status === 'success' && cacheableQueryRoots.has(queryRoot);
      },
    });

    const payload: PersistedQueryCache = {
      timestamp: Date.now(),
      state: dehydratedState,
    };

    window.localStorage.setItem(QUERY_CACHE_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignora fallos de persistencia (modo privado/cuota).
  }
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      gcTime: 1000 * 60 * 60 * 24,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const persistedCacheState = readPersistedQueryCache();
if (persistedCacheState) {
  hydrate(queryClient, persistedCacheState);
}

let persistTimer: number | undefined;
queryClient.getQueryCache().subscribe(() => {
  window.clearTimeout(persistTimer);
  persistTimer = window.setTimeout(() => {
    persistQueryCache(queryClient);
  }, 400);
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
);
