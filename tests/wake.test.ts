import { expect, it } from 'vitest';
import { debounce } from '../src/main/wake';

it('merges triggers inside the window and allows later ones', () => {
  let t = 0;
  let calls = 0;
  const trigger = debounce(
    () => calls++,
    3000,
    () => t,
  );
  trigger();
  t = 1000;
  trigger();
  t = 4000;
  trigger();
  expect(calls).toBe(2);
});
