import { defineConfig } from '@tarojs/cli';
import path from 'node:path';
import { loadSelectedReleaseDisclosure } from './releaseDisclosure';

const releaseDisclosure = loadSelectedReleaseDisclosure();

export default defineConfig({
  projectName: 'dynamic-assessment-wechat',
  date: '2026-08-03',
  env: {
    TARO_APP_CLOUDBASE_ENV_ID: JSON.stringify(
      process.env.TARO_APP_CLOUDBASE_ENV_ID?.trim() ?? '',
    ),
    TARO_APP_RELEASE_DISCLOSURE_JSON: JSON.stringify(JSON.stringify(releaseDisclosure)),
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
