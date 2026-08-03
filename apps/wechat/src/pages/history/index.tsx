import { Text, View } from '@tarojs/components';
import { FixedBottomNavigation } from '../../components/FixedBottomNavigation';
import { createMiniProgramShellState } from '../../shell/viewModel';

export default function HistoryPage() {
  const shell = createMiniProgramShellState();

  return (
    <View className='app-page'>
      <View className='page-header'>
        <Text className='page-title'>{shell.history.title}</Text>
        <Text className='page-subtitle'>查看已生成和完成的测评。</Text>
      </View>
      <View className='empty-state'>
        <Text>{shell.history.emptyMessage}</Text>
      </View>
      <FixedBottomNavigation activeTab='history' />
    </View>
  );
}
