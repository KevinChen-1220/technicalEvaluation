declare const defineAppConfig: undefined | (<T>(config: T) => T);

const defineConfig = typeof defineAppConfig === 'function'
  ? defineAppConfig
  : <T>(config: T) => config;

const appConfig = defineConfig({
  pages: [
    'pages/generate/index',
    'pages/answer/index',
    'pages/result/index',
    'pages/history/index',
    'pages/settings/index',
    'pages/privacy/index',
    'pages/report/index',
  ],
  window: {
    navigationBarBackgroundColor: '#F8FAFC',
    navigationBarTextStyle: 'black',
    navigationBarTitleText: '技能测评',
    backgroundColor: '#F8FAFC',
  },
});

export default appConfig;
