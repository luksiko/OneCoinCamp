import { AsyncLocalStorage } from 'node:async_hooks';

export class ProviderBudgetExceeded extends Error {
  constructor() {
    super('Provider request budget exhausted');
    this.name = 'ProviderBudgetExceeded';
  }
}

export interface ProviderRequestScope {
  limit: number;
  used: number;
  byHost: Record<string, number>;
  memo: Map<string, Promise<unknown>>;
}

const scopes = new AsyncLocalStorage<ProviderRequestScope>();

export function runWithProviderBudget<T>(limit: number, task: (scope: ProviderRequestScope) => Promise<T>): Promise<T> {
  const scope: ProviderRequestScope = { limit, used: 0, byHost: {}, memo: new Map() };
  return scopes.run(scope, () => task(scope));
}

export function currentProviderScope(): ProviderRequestScope | undefined {
  return scopes.getStore();
}

export function consumeProviderRequest(url: string): void {
  const scope = currentProviderScope();
  if (!scope) return;
  if (scope.used >= scope.limit) throw new ProviderBudgetExceeded();
  scope.used++;
  const host = new URL(url).hostname.toLowerCase();
  scope.byHost[host] = (scope.byHost[host] || 0) + 1;
}
