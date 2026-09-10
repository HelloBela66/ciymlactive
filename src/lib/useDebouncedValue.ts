import { useEffect, useState } from 'react';

/** Дебаунсить значення (наприклад, текст пошуку), щоб не бити SQLite на кожне натискання. */
export function useDebouncedValue<T>(value: T, delayMs = 250): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
