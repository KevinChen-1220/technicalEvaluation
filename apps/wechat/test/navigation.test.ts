import { getTabNavigationDecision } from '../src/components/navigation';

describe('getTabNavigationDecision', () => {
  it('does not navigate when the selected tab is already active', () => {
    expect(getTabNavigationDecision('history', 'history')).toBeNull();
  });

  it('replaces the current page when selecting another tab', () => {
    expect(getTabNavigationDecision('generate', 'settings')).toEqual({
      method: 'redirectTo',
      url: '/pages/settings/index',
    });
  });
});
