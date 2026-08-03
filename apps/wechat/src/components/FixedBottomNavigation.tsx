import Taro from '@tarojs/taro';
import { Text, View } from '@tarojs/components';
import { createMiniProgramShellState, type MiniProgramTabId } from '../shell/viewModel';
import { getTabNavigationDecision } from './navigation';

type FixedBottomNavigationProps = {
  activeTab: MiniProgramTabId;
};

export function FixedBottomNavigation({ activeTab }: FixedBottomNavigationProps) {
  const { tabs } = createMiniProgramShellState();

  function selectTab(selectedTab: MiniProgramTabId): void {
    const decision = getTabNavigationDecision(activeTab, selectedTab);
    if (decision) Taro.redirectTo({ url: decision.url });
  }

  return (
    <View className='fixed-navigation'>
      <View className='fixed-navigation__tabs'>
        {tabs.map((tab) => (
          <View
            key={tab.id}
            className={`fixed-navigation__tab ${tab.id === activeTab ? 'fixed-navigation__tab--active' : ''}`}
            hoverClass='fixed-navigation__tab--pressed'
            onClick={() => selectTab(tab.id)}
          >
            <Text>{tab.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
