import { expect, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import * as matchers from '@testing-library/jest-dom/matchers';

// Extiende los matchers de Jest DOM para vitest
expect.extend(matchers);

// Limpiar el DOM después de cada prueba
afterEach(() => {
  cleanup();
});
