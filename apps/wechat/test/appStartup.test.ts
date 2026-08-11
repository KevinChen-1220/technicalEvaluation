const initialize = jest.fn(async () => undefined);

jest.mock('../src/services/cloudRuntime', () => ({ cloudRuntime: { initialize } }));
jest.mock('../src/app.css', () => ({}));

describe('Mini Program app startup', () => {
  test('starts EdgeOne session initialization without blocking the app root', () => {
    jest.isolateModules(() => {
      require('../src/app');
    });

    expect(initialize).toHaveBeenCalledTimes(1);
  });
});
