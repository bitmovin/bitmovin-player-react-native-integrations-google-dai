import { TimelineReferencePoint } from 'bitmovin-player-react-native';
import {
  GoogleDaiSourceConfigFactoryBridge,
  type GoogleDaiSourceConfigFactory,
} from '../src/googleDaiSourceConfigFactory';
import { GoogleDaiSourceType } from '../src/googleDaiSourceConfig';
import type { GoogleDaiSourceConfigFactoryRequest } from '../src/modules/GoogleDaiModule';

jest.mock('bitmovin-player-react-native', () => ({
  TimelineReferencePoint: {
    START: 'start',
    END: 'end',
  },
}));

jest.mock('expo-crypto', () => {
  let nextId = 0;
  return {
    randomUUID: () => `uuid-${++nextId}`,
  };
});

jest.mock('../src/modules/GoogleDaiModule', () => ({
  __esModule: true,
  default: {
    setSourceConfigFactoryResult: jest.fn(),
  },
  addSourceConfigFactoryRequestListener: jest.fn(),
}));

const defaultContext = {
  url: 'https://example.com/live.m3u8',
  sourceType: GoogleDaiSourceType.HLS,
  subtitleMetadata: [],
};

function createNativeBridge() {
  let listener:
    ((request: GoogleDaiSourceConfigFactoryRequest) => void) | undefined;
  const remove = jest.fn();
  const addRequestListener = jest.fn(
    (nextListener: (request: GoogleDaiSourceConfigFactoryRequest) => void) => {
      listener = nextListener;
      return { remove };
    }
  );
  const setResult = jest.fn().mockResolvedValue(undefined);

  return {
    nativeBridge: { addRequestListener, setResult },
    addRequestListener,
    setResult,
    remove,
    emit(request: GoogleDaiSourceConfigFactoryRequest) {
      listener?.(request);
    },
  };
}

function request(
  googleDaiId: string,
  sourceConfigFactoryId: string,
  overrides: Partial<GoogleDaiSourceConfigFactoryRequest> = {}
): GoogleDaiSourceConfigFactoryRequest {
  return {
    requestId: 1,
    googleDaiId,
    sourceConfigFactoryId,
    context: defaultContext,
    ...overrides,
  };
}

describe('GoogleDaiSourceConfigFactoryBridge', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('does not install a listener when no factory is provided', () => {
    const native = createNativeBridge();
    const bridge = new GoogleDaiSourceConfigFactoryBridge(native.nativeBridge);

    expect(bridge.register('google-dai-1', undefined)).toBeUndefined();
    expect(native.addRequestListener).not.toHaveBeenCalled();
  });

  it('routes a request and applies DAI defaults to the result', () => {
    const native = createNativeBridge();
    const bridge = new GoogleDaiSourceConfigFactoryBridge(native.nativeBridge);
    const factory = jest.fn(() => ({
      title: 'Live channel',
      options: {
        startOffset: -10,
        startOffsetTimelineReference: TimelineReferencePoint.END,
      },
    }));
    const factoryId = bridge.register('google-dai-1', factory)!;

    native.emit(request('google-dai-1', factoryId));

    expect(factory).toHaveBeenCalledWith(defaultContext);
    expect(native.setResult).toHaveBeenCalledWith(1, {
      url: defaultContext.url,
      type: GoogleDaiSourceType.HLS,
      title: 'Live channel',
      options: {
        startOffset: -10,
        startOffsetTimelineReference: TimelineReferencePoint.END,
      },
    });
    expect(native.remove).toHaveBeenCalledTimes(1);
  });

  it('keeps overlapping registrations independent', () => {
    const native = createNativeBridge();
    const bridge = new GoogleDaiSourceConfigFactoryBridge(native.nativeBridge);
    const firstId = bridge.register('google-dai-1', () => ({ title: 'one' }))!;
    const secondId = bridge.register('google-dai-1', () => ({ title: 'two' }))!;

    native.emit(request('google-dai-1', secondId, { requestId: 2 }));
    expect(native.remove).not.toHaveBeenCalled();

    native.emit(request('google-dai-1', firstId, { requestId: 3 }));

    expect(native.setResult).toHaveBeenNthCalledWith(1, 2, {
      url: defaultContext.url,
      type: GoogleDaiSourceType.HLS,
      title: 'two',
    });
    expect(native.setResult).toHaveBeenNthCalledWith(2, 3, {
      url: defaultContext.url,
      type: GoogleDaiSourceType.HLS,
      title: 'one',
    });
    expect(native.remove).toHaveBeenCalledTimes(1);
  });

  it('rejects a request for the wrong player without consuming the factory', () => {
    const native = createNativeBridge();
    const bridge = new GoogleDaiSourceConfigFactoryBridge(native.nativeBridge);
    const factory = jest.fn(() => ({ title: 'Live channel' }));
    const factoryId = bridge.register('google-dai-1', factory)!;

    native.emit(request('google-dai-2', factoryId));
    expect(native.setResult).toHaveBeenLastCalledWith(1, null);
    expect(factory).not.toHaveBeenCalled();

    native.emit(request('google-dai-1', factoryId, { requestId: 2 }));
    expect(factory).toHaveBeenCalledTimes(1);
    expect(native.setResult).toHaveBeenLastCalledWith(2, {
      url: defaultContext.url,
      type: GoogleDaiSourceType.HLS,
      title: 'Live channel',
    });
  });

  it.each([
    [
      'a factory error',
      () => {
        throw new Error('factory failed');
      },
    ],
    ['an invalid result', () => ({ title: 42 })],
  ])('falls back for %s', (_, resultFactory) => {
    const native = createNativeBridge();
    const bridge = new GoogleDaiSourceConfigFactoryBridge(native.nativeBridge);
    const factoryId = bridge.register(
      'google-dai-1',
      resultFactory as unknown as GoogleDaiSourceConfigFactory
    )!;

    native.emit(request('google-dai-1', factoryId));

    expect(native.setResult).toHaveBeenCalledWith(1, null);
  });

  it('falls back for an invalid native context', () => {
    const native = createNativeBridge();
    const bridge = new GoogleDaiSourceConfigFactoryBridge(native.nativeBridge);
    const factory = jest.fn(() => ({ title: 'Live channel' }));
    const factoryId = bridge.register('google-dai-1', factory)!;

    native.emit(
      request('google-dai-1', factoryId, {
        context: { ...defaultContext, url: '' },
      })
    );

    expect(factory).not.toHaveBeenCalled();
    expect(native.setResult).toHaveBeenCalledWith(1, null);
  });

  it('unregisters a factory when loading fails before native requests it', () => {
    const native = createNativeBridge();
    const bridge = new GoogleDaiSourceConfigFactoryBridge(native.nativeBridge);
    const factoryId = bridge.register('google-dai-1', () => ({
      title: 'Live channel',
    }));

    bridge.unregister(factoryId);

    expect(native.remove).toHaveBeenCalledTimes(1);
  });

  it('expires a registration when native never requests it', () => {
    jest.useFakeTimers();
    const native = createNativeBridge();
    const bridge = new GoogleDaiSourceConfigFactoryBridge(
      native.nativeBridge,
      1_000
    );

    bridge.register('google-dai-1', () => ({ title: 'Live channel' }));
    jest.advanceTimersByTime(1_000);

    expect(native.remove).toHaveBeenCalledTimes(1);
  });
});
