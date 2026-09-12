import { isFetchAborted } from './isFetchAborted';

describe('isFetchAborted', () => {
  it('true, коли signal.aborted === true, незалежно від типу/імені помилки (реальний iOS-кейс)', () => {
    const controller = new AbortController();
    controller.abort();
    const nativeIosError = new Error(
      'fetch failed: FetchRequestCanceledException: Fetch request has been canceled (at Expo/NativeResponse.swift:63)',
    );
    expect(isFetchAborted(nativeIosError, controller.signal)).toBe(true);
  });

  it('true для стандартного AbortError навіть без переданого signal', () => {
    const abortError = Object.assign(new Error('Aborted'), { name: 'AbortError' });
    expect(isFetchAborted(abortError)).toBe(true);
  });

  it('false для звичайної мережевої помилки з неаборченим (або відсутнім) signal', () => {
    const controller = new AbortController();
    expect(isFetchAborted(new Error('network error'), controller.signal)).toBe(false);
    expect(isFetchAborted(new Error('network error'))).toBe(false);
  });

  it('false для не-Error значення без signal', () => {
    expect(isFetchAborted('щось не Error')).toBe(false);
  });
});
