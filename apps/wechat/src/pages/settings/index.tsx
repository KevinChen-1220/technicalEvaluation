import { Text, View } from '@tarojs/components';
import { FixedBottomNavigation } from '../../components/FixedBottomNavigation';
import { createMiniProgramShellState } from '../../shell/viewModel';

export default function SettingsPage() {
  const shell = createMiniProgramShellState();

  return (
    <View className='app-page'>
      <View className='page-header'>
        <Text className='page-title'>{shell.settings.title}</Text>
        <Text className='page-subtitle'>了解测评内容的隐私处理方式。</Text>
      </View>
      <View className='disclosure'>
        <Text>{shell.settings.disclosure}</Text>
      </View>
      <FixedBottomNavigation activeTab='settings' />
    </View>
  );
}
