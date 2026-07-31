import * as Crypto from 'expo-crypto';
import GoogleDaiModule, {
  assertGoogleDaiModuleAvailable,
} from './modules/GoogleDaiModule';
import type { GoogleDaiSourceConfig } from './googleDaiSourceConfig';
import {
  registerSourceConfigFactory,
  unregisterSourceConfigFactory,
  type GoogleDaiSourceConfigFactory,
} from './googleDaiSourceConfigFactory';
import {
  assertRecord,
  optionalString,
  optionalStringRecord,
  requireNonEmptyString,
  requireSourceType,
} from './googleDaiValidation';

export type {
  GoogleDaiSourceConfigFactory,
  GoogleDaiSourceConfigFactoryContext,
  GoogleDaiSourceConfigFactoryResult,
  GoogleDaiSourceConfigFactorySourceConfig,
} from './googleDaiSourceConfigFactory';

export interface GoogleDaiApi {
  load(
    sourceConfig: GoogleDaiSourceConfig,
    sourceConfigFactory?: GoogleDaiSourceConfigFactory
  ): Promise<void>;
}

export interface GoogleDaiCapability {
  readonly googleDai: GoogleDaiApi;
}

const googleDaiInstanceSymbol: unique symbol = Symbol(
  'BitmovinPlayerReactNativeGoogleDai.instance'
);

type GoogleDaiPlayer = {
  readonly nativeId: string;
  readonly isInitialized: boolean;
  readonly isDestroyed: boolean;
};

type GoogleDaiDecoratedPlayer = GoogleDaiPlayer & {
  [googleDaiInstanceSymbol]?: NativeGoogleDai;
};

/**
 * Attaches a Google DAI capability to an existing Player instance.
 */
export function withGoogleDai<T extends GoogleDaiPlayer>(
  player: T
): T & GoogleDaiCapability {
  const decoratedPlayer = assertPlayer(player) as T &
    GoogleDaiCapability &
    GoogleDaiDecoratedPlayer;
  const existingGoogleDai = decoratedPlayer[googleDaiInstanceSymbol];

  if (existingGoogleDai) {
    assertExistingGoogleDaiProperty(decoratedPlayer, existingGoogleDai);
    return decoratedPlayer;
  }

  if (findPropertyDescriptor(decoratedPlayer, 'googleDai')) {
    throw new Error(
      'Cannot attach Google DAI because the player already defines a googleDai property.'
    );
  }
  if (!Object.isExtensible(decoratedPlayer)) {
    throw new Error('Cannot attach Google DAI to a non-extensible player.');
  }

  assertGoogleDaiModuleAvailable();
  const googleDai = new NativeGoogleDai(decoratedPlayer);

  Object.defineProperty(decoratedPlayer, googleDaiInstanceSymbol, {
    value: googleDai,
    enumerable: false,
    configurable: false,
    writable: false,
  });
  Object.defineProperty(decoratedPlayer, 'googleDai', {
    value: googleDai,
    enumerable: false,
    configurable: false,
    writable: false,
  });

  return decoratedPlayer;
}

/**
 * Native-backed Google IMA DAI implementation for an existing Bitmovin Player.
 */
class NativeGoogleDai implements GoogleDaiApi {
  private readonly nativeId: string;
  private readonly player: GoogleDaiPlayer;

  private isInitialized = false;
  private initializePromise?: Promise<void>;

  constructor(player: GoogleDaiPlayer) {
    this.player = assertPlayer(player);
    this.nativeId = createGoogleDaiNativeId();
  }

  load = async (
    sourceConfig: GoogleDaiSourceConfig,
    sourceConfigFactory?: GoogleDaiSourceConfigFactory
  ): Promise<void> => {
    const validatedConfig = validateSourceConfig(sourceConfig);
    const sourceConfigFactoryId = registerSourceConfigFactory(
      this.nativeId,
      sourceConfigFactory
    );
    try {
      await this.initializeNative();
      this.ensurePlayerInitialized();
      await GoogleDaiModule.load(
        this.nativeId,
        validatedConfig,
        sourceConfigFactoryId ?? null
      );
    } catch (error) {
      unregisterSourceConfigFactory(sourceConfigFactoryId);
      throw error;
    }
  };

  private initializeNative(): Promise<void> {
    try {
      this.ensurePlayerInitialized();
    } catch (error) {
      return Promise.reject(error);
    }
    if (this.isInitialized) {
      return Promise.resolve();
    }
    if (!this.initializePromise) {
      this.initializePromise = GoogleDaiModule.initialize(
        this.nativeId,
        this.player.nativeId
      )
        .then(async () => {
          try {
            this.ensurePlayerInitialized();
            this.isInitialized = true;
          } catch (error) {
            await GoogleDaiModule.destroy(this.nativeId).catch(() => undefined);
            throw error;
          }
        })
        .catch((error) => {
          this.initializePromise = undefined;
          throw error;
        });
    }
    return this.initializePromise;
  }

  private ensurePlayerInitialized() {
    if (this.player.isDestroyed) {
      throw new Error('GoogleDai requires a non-destroyed Player.');
    }
    if (!this.player.isInitialized) {
      throw new Error(
        'GoogleDai requires an initialized Player. Mount PlayerView and call load() from PlayerView.onPlayerViewReady.'
      );
    }
  }
}

function createGoogleDaiNativeId(): string {
  return `google-dai-${Crypto.randomUUID()}`;
}

function assertExistingGoogleDaiProperty(
  player: GoogleDaiPlayer,
  googleDai: NativeGoogleDai
) {
  const descriptor = findPropertyDescriptor(player, 'googleDai');
  if (!descriptor || descriptor.value !== googleDai) {
    throw new Error(
      'Cannot attach Google DAI because the player already defines a conflicting googleDai property.'
    );
  }
}

function findPropertyDescriptor(
  value: object,
  propertyName: PropertyKey
): PropertyDescriptor | undefined {
  let target: object | null = value;
  while (target) {
    const descriptor = Object.getOwnPropertyDescriptor(target, propertyName);
    if (descriptor) {
      return descriptor;
    }
    target = Object.getPrototypeOf(target);
  }
  return undefined;
}

function assertPlayer(player: GoogleDaiPlayer): GoogleDaiPlayer {
  const candidate = assertRecord(player, 'GoogleDai player');
  if (
    typeof candidate.nativeId !== 'string' ||
    candidate.nativeId.trim().length === 0
  ) {
    throw new Error(
      'GoogleDai player must expose a non-empty nativeId string.'
    );
  }
  if (typeof candidate.isInitialized !== 'boolean') {
    throw new Error('GoogleDai player must expose an isInitialized boolean.');
  }
  if (typeof candidate.isDestroyed !== 'boolean') {
    throw new Error('GoogleDai player must expose an isDestroyed boolean.');
  }
  return player;
}

function validateSourceConfig(
  sourceConfig: GoogleDaiSourceConfig
): GoogleDaiSourceConfig {
  const config = assertRecord(sourceConfig, 'GoogleDai source config');
  const kind = config.kind;
  if (kind !== 'live') {
    throw new Error(
      `Unsupported GoogleDai source config kind: ${String(kind)}`
    );
  }
  return {
    kind,
    assetKey: requireNonEmptyString(config.assetKey, 'assetKey'),
    type: requireSourceType(config.type),
    ...optionalString(config.apiKey, 'apiKey'),
    ...optionalString(config.networkCode, 'networkCode'),
    ...optionalStringRecord(config.adTagParameters, 'adTagParameters'),
  };
}
