import Taro from '@tarojs/taro';
import { Button, Text, View } from '@tarojs/components';
import { FixedBottomNavigation } from '../../components/FixedBottomNavigation';
import { releaseDisclosure } from '../../privacy/releaseDisclosure';
import { createMiniProgramShellState } from '../../shell/viewModel';

export default function SettingsPage() {
  const shell = createMiniProgramShellState();
  const disclosure = releaseDisclosure;

  return (
    <View className='app-page'>
      <View className='page-header'>
        <Text className='page-title'>{shell.settings.title}</Text>
        <Text className='page-subtitle'>了解测评内容的隐私处理方式。</Text>
      </View>
      <View className='disclosure'>
        <Text>{shell.settings.disclosure}</Text>
      </View>
      <View className='settings-list'>
        <View className='settings-row'>
          <Text>产品版本</Text>
          <Text>{disclosure.productVersion}</Text>
        </View>
        <View className='settings-row'>
          <Text>隐私政策版本</Text>
          <Text>{disclosure.privacyPolicyVersion}</Text>
        </View>
        <View className='settings-row'>
          <Text>服务主体</Text>
          <Text>{disclosure.serviceOperator}</Text>
        </View>
        <View className='settings-row'>
          <Text>模型披露</Text>
          <Text>{disclosure.modelDisclosure}</Text>
        </View>
        <View className='settings-row'>
          <Text>生成式 AI 备案</Text>
          <Text>{disclosure.generativeAiRegistration}</Text>
        </View>
        <View className='settings-row'>
          <Text>小程序备案</Text>
          <Text>{disclosure.miniProgramFiling}</Text>
        </View>
      </View>
      <Button className='inline-action' onClick={() => Taro.navigateTo({ url: disclosure.privacyRoute })}>隐私政策</Button>
      <Button className='inline-action' onClick={() => Taro.navigateTo({ url: disclosure.reportRoute })}>投诉与反馈</Button>
      <FixedBottomNavigation activeTab='settings' />
    </View>
  );
}
