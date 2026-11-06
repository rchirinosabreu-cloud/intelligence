import { useCallback, useMemo } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { readFinancialNavigation, writeFinancialNavigation } from '../lib/financialNavigation.js';

export function useFinancialNavigation() {
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const navigation = useMemo(() => readFinancialNavigation(params), [params]);
  const update = useCallback(patch => setParams(current => {
    const changes = typeof patch === 'function' ? patch(readFinancialNavigation(current)) : patch;
    return writeFinancialNavigation(current, changes);
  }, { replace: true, state: location.state }), [setParams, location.state]);
  const setActiveTab = useCallback(activeTab => update({ activeTab }), [update]);
  const setSelectedYear = useCallback(selectedYear => update({ selectedYear }), [update]);
  const setFilters = useCallback(value => update(current => ({ filters: typeof value === 'function' ? value(current.filters) : value })), [update]);
  return { ...navigation, setActiveTab, setSelectedYear, setFilters };
}
