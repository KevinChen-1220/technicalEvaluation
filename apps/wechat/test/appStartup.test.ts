const initialize = jest.fn();

jest.mock('../src/services/cloudRuntime', () => ({ cloudRuntime: { initialize } }));
jest.mock('../src/app.css', () => ({}));

describe('Mini Program app startup', () => {
  test('initializes CloudBase while loading the app root', () => {
    jest.isolateModules(() => {
      require('../src/app');
    });

    expect(initialize).toHaveBeenCalledTimes(1);
  });
});
