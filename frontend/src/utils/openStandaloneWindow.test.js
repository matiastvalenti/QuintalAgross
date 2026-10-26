import { afterEach, describe, expect, it, vi } from 'vitest';
import { openEntitiesManager } from './openStandaloneWindow';

afterEach(() => {
  window.history.replaceState({}, '', '/');
  vi.restoreAllMocks();
});

describe('Entidades integrado al ERP', () => {
  it('navega en la misma pestaña sin crear un popup de Chrome', () => {
    const popup = vi.spyOn(window, 'open').mockImplementation(() => null);
    vi.spyOn(window, 'focus').mockImplementation(() => {});
    const navigation = vi.fn();
    window.addEventListener('popstate', navigation);
    try {
      openEntitiesManager();
      expect(window.location.pathname).toBe('/configuracion/entidades');
      expect(navigation).toHaveBeenCalled();
      expect(popup).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('popstate', navigation);
    }
  });
});
