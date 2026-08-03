import Taro from '@tarojs/taro';
import { Text, View } from '@tarojs/components';
import { createMiniProgramShellState, type MiniProgramTabId } from '../shell/viewModel';

const tabPaths: Record<MiniProgramTabId, string> = {
  generate: '/pages/generate/index',
  history: '/pages/history/index',
  settings: '/pages/settings/index',
};

type FixedBottomNavigationProps = {
  activeTab: MiniProgramTabId;
};

export function FixedBottomNavigation({ activeTab }: FixedBottomNavigationProps) {
  const { tabs } = createMiniProgramShellState();

  return (
    <View className='fixed-navigation'>
      <View className='fixed-navigation__tabs'>
        {tabs.map((tab) => (
          <View
            key={tab.id}
            className={`fixed-navigation__tab ${tab.id === activeTab ? 'fixed-navigation__tab--active' : ''}`}
            hoverClass='fixed-navigation__tab--pressed'
            onClick={() => Taro.navigateTo({ url: tabPaths[tab.id] })}
          >
            <Text>{tab.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
