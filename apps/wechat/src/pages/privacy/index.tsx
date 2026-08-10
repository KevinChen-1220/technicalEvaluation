import { Text, View } from '@tarojs/components';
import { CURRENT_PRIVACY_POLICY_VERSION } from '../../privacy/consent';

export default function PrivacyPage() {
  return (
    <View className='app-page'>
      <View className='page-header'>
        <Text className='page-title'>隐私政策</Text>
        <Text className='page-subtitle'>版本 {CURRENT_PRIVACY_POLICY_VERSION}，生效日期 2026-08-10。</Text>
      </View>
      <View className='policy-section'>
        <Text className='section-title'>我们收集的数据</Text>
        <Text className='policy-text'>微信 OpenID、测评主题、补充说明、生成的试题、作答记录、分数结果、隐私同意时间和投诉反馈内容。</Text>
      </View>
      <View className='policy-section'>
        <Text className='section-title'>我们不收集的数据</Text>
        <Text className='policy-text'>首个版本不申请头像、昵称、手机号、通讯录、位置、相册、相机、麦克风或剪贴板权限。</Text>
      </View>
      <View className='policy-section'>
        <Text className='section-title'>第三方与模型</Text>
        <Text className='policy-text'>测评生成由服务端调用已配置的模型服务完成，客户端不保存模型密钥或服务端点。正式发布前将在设置页披露实际模型、服务主体与备案信息。</Text>
      </View>
      <View className='policy-section'>
        <Text className='section-title'>用户权利</Text>
        <Text className='policy-text'>你可以通过设置页查看本政策，也可以在测评结果页提交投诉与反馈。删除、导出等运营请求将在正式服务主体配置后按公开联系方式处理。</Text>
      </View>
    </View>
  );
}
