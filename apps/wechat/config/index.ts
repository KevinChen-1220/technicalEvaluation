import { defineConfig } from '@tarojs/cli';
import path from 'node:path';
import { loadSelectedReleaseDisclosure } from './releaseDisclosure';

const releaseDisclosure = loadSelectedReleaseDisclosure();
const releaseProfile = process.env.TARO_APP_RELEASE_PROFILE?.trim() || 'development';
const releaseFixtureMode = process.env.TARO_APP_RELEASE_FIXTURE_MODE === 'enabled'
  ? 'enabled'
  : 'disabled';
const publicCloudBaseEnvId = process.env.TARO_APP_CLOUDBASE_ENV_ID?.trim() ?? '';

if (releaseProfile === 'formal' && releaseFixtureMode === 'enabled') {
  throw new Error('Release fixture mode is forbidden in the formal profile.');
}

if (releaseProfile === 'formal' && publicCloudBaseEnvId.length === 0) {
  throw new Error('CloudBase environment id is required for the formal profile.');
}

export default defineConfig({
  projectName: 'dynamic-assessment-wechat',
  date: '2026-08-03',
  env: {
    TARO_APP_CLOUDBASE_ENV_ID: JSON.stringify(publicCloudBaseEnvId),
    TARO_APP_RELEASE_DISCLOSURE_JSON: JSON.stringify(JSON.stringify(releaseDisclosure)),
    TARO_APP_RELEASE_FIXTURE_MODE: JSON.stringify(releaseFixtureMode),
    TARO_APP_RELEASE_PROFILE: JSON.stringify(releaseProfile),
  },
  designWidth: 375,
  deviceRatio: {
    375: 1,
    640: 2.34,
    750: 1,
    828: 1.81,
  },
  sourceRoot: 'src',
  outputRoot: 'dist',
  framework: 'react',
  compiler: 'webpack5',
  plugins: ['@tarojs/plugin-framework-react'],
  mini: {
    compile: {
      include: [path.resolve(__dirname, '../../../packages/assessment-core')],
    },
  },
});
