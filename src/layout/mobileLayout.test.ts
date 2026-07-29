import { getKeyboardBehavior, getScreenPadding } from './mobileLayout';

describe('mobile layout helpers', () => {
  it('adds the top and tab safe-area spacing for tab screens', () => {
    expect(getScreenPadding({ top: 47, bottom: 34 }, true)).toEqual({
      paddingTop: 71,
      paddingBottom: 140,
    });
  });

  it('uses padding behavior for iOS keyboards', () => {
    expect(getKeyboardBehavior('ios')).toBe('padding');
  });

  it('uses height behavior for Android keyboards', () => {
    expect(getKeyboardBehavior('android')).toBe('height');
  });
});
