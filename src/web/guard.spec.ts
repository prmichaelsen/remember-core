import { assertServerSide } from './guard';

describe('assertServerSide()', () => {
  const originalWindow = globalThis.window;

  afterEach(() => {
    if (originalWindow === undefined) {
      delete (globalThis as any).window;
    } else {
      (globalThis as any).window = originalWindow;
    }
  });

  it('does not throw when window is undefined', () => {
    delete (globalThis as any).window;
    expect(() => assertServerSide()).not.toThrow();
  });

  it('throws when window is defined', () => {
    (globalThis as any).window = {};
    expect(() => assertServerSide()).toThrow('server-side only');
  });

  it('error message mentions credentials', () => {
    (globalThis as any).window = {};
    expect(() => assertServerSide()).toThrow('credentials');
  });
});
