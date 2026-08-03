import type { MiniProgramTabId } from '../shell/viewModel';

const tabPaths: Record<MiniProgramTabId, string> = {
  generate: '/pages/generate/index',
  history: '/pages/history/index',
  settings: '/pages/settings/index',
};

export type TabNavigationDecision = {
  method: 'redirectTo';
  url: string;
};

export function getTabNavigationDecision(
  activeTab: MiniProgramTabId,
  selectedTab: MiniProgramTabId,
): TabNavigationDecision | null {
  return activeTab === selectedTab ? null : { method: 'redirectTo', url: tabPaths[selectedTab] };
}
