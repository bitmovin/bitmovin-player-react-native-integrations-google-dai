import type { EventSubscription } from 'expo-modules-core';
import * as Crypto from 'expo-crypto';
import GoogleDaiModule, {
  addSourceConfigFactoryRequestListener,
  assertGoogleDaiModuleAvailable,
  type GoogleDaiSourceConfigFactoryRequest,
} from './modules/GoogleDaiModule';
import {
  type GoogleDaiSourceConfig,
  GoogleDaiSourceType,
} from './googleDaiSourceConfig';

export interface GoogleDaiApi {
  load(
    sourceConfig: GoogleDaiSourceConfig,
    sourceConfigFactory?: GoogleDaiSourceConfigFactory
  ): Promise<void>;
}

export interface GoogleDaiCapability {
  readonly googleDai: GoogleDaiApi;
}

/**
 * Builds the Player `SourceConfig` from the DAI-provided source context.
 * Native waits briefly for this callback and falls back to the default
 * source config when it throws, rejects, times out, or returns invalid data.
 */
export type GoogleDaiSourceConfigFactory = (
  context: GoogleDaiSourceConfigFactoryContext
) =>
  | GoogleDaiSourceConfigFactoryResult
  | Promise<GoogleDaiSourceConfigFactoryResult>;

export interface GoogleDaiSourceConfigFactoryContext {
  readonly url: string;
  readonly sourceType: GoogleDaiSourceType;
  readonly subtitleMetadata: ReadonlyArray<Record<string, string>>;
}

export type GoogleDaiSourceConfigFactoryResult =
  GoogleDaiSourceConfigFactorySourceConfig | null | undefined;

export interface GoogleDaiSourceConfigFactorySourceConfig {
  url?: string;
  type?: GoogleDaiSourceType;
  title?: string;
  description?: string;
  poster?: string;
  isPosterPersistent?: boolean;
  subtitleTracks?: unknown[];
  thumbnailTrack?: string;
  metadata?: Record<string, string>;
  options?: GoogleDaiSourceOptions;
}

export interface GoogleDaiSourceOptions {
  startOffset?: number;
  startOffsetTimelineReference?: 'start' | 'end';
}

const googleDaiInstanceSymbol: unique symbol = Symbol(
  'BitmovinPlayerReactNativeGoogleDai.instance'
);

const sourceConfigFactoryIdPrefix = 'source-config-factory';

type GoogleDaiPlayer = {
  readonly nativeId: string;
  readonly isInitialized: boolean;
  readonly isDestroyed: boolean;
};

type GoogleDaiDecoratedPlayer = GoogleDaiPlayer & {
  [googleDaiInstanceSymbol]?: NativeGoogleDai;
};

type ActiveSourceConfigFactory = {
  readonly id: string;
  readonly factory: GoogleDaiSourceConfigFactory;
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
  private sourceConfigFactorySubscription?: EventSubscription;
  private activeSourceConfigFactory?: ActiveSourceConfigFactory;

  constructor(player: GoogleDaiPlayer) {
    this.player = assertPlayer(player);
    this.nativeId = createGoogleDaiNativeId();
  }

  load = async (
    sourceConfig: GoogleDaiSourceConfig,
    sourceConfigFactory?: GoogleDaiSourceConfigFactory
  ): Promise<void> => {
    const validatedConfig = validateSourceConfig(sourceConfig);
    const sourceConfigFactoryId =
      this.prepareSourceConfigFactory(sourceConfigFactory);
    try {
      await this.initializeNative();
      this.ensurePlayerInitialized();
      await GoogleDaiModule.load(
        this.nativeId,
        validatedConfig,
        sourceConfigFactoryId ?? null
      );
    } catch (error) {
      this.clearSourceConfigFactory(sourceConfigFactoryId);
      throw error;
    }
  };

  private prepareSourceConfigFactory(
    sourceConfigFactory: GoogleDaiSourceConfigFactory | undefined
  ): string | undefined {
    const validatedFactory = validateSourceConfigFactory(sourceConfigFactory);
    if (!validatedFactory) {
      this.clearSourceConfigFactory();
      return undefined;
    }
    this.ensureSourceConfigFactoryListener();
    const id = createSourceConfigFactoryId();
    this.activeSourceConfigFactory = { id, factory: validatedFactory };
    return id;
  }

  private ensureSourceConfigFactoryListener() {
    if (this.sourceConfigFactorySubscription) {
      return;
    }
    this.sourceConfigFactorySubscription =
      addSourceConfigFactoryRequestListener(
        this.handleSourceConfigFactoryRequest
      );
  }

  private handleSourceConfigFactoryRequest = (
    request: GoogleDaiSourceConfigFactoryRequest
  ) => {
    if (request.googleDaiId !== this.nativeId) {
      return;
    }
    const activeFactory = this.activeSourceConfigFactory;
    if (!activeFactory || request.sourceConfigFactoryId !== activeFactory.id) {
      this.completeSourceConfigFactoryRequest(request.requestId, null);
      return;
    }
    void this.resolveSourceConfigFactoryRequest(request, activeFactory);
  };

  private async resolveSourceConfigFactoryRequest(
    request: GoogleDaiSourceConfigFactoryRequest,
    activeFactory: ActiveSourceConfigFactory
  ) {
    try {
      const context = validateSourceConfigFactoryContext(request.context);
      const result = await activeFactory.factory(context);
      this.completeSourceConfigFactoryRequest(
        request.requestId,
        validateSourceConfigFactoryResult(result, context)
      );
    } catch {
      this.completeSourceConfigFactoryRequest(request.requestId, null);
    } finally {
      this.clearSourceConfigFactory(activeFactory.id);
    }
  }

  private clearSourceConfigFactory(factoryId?: string) {
    if (factoryId && this.activeSourceConfigFactory?.id !== factoryId) {
      return;
    }
    this.activeSourceConfigFactory = undefined;
    this.sourceConfigFactorySubscription?.remove();
    this.sourceConfigFactorySubscription = undefined;
  }

  private completeSourceConfigFactoryRequest(
    requestId: number,
    sourceConfig: Record<string, unknown> | null
  ) {
    void GoogleDaiModule.setSourceConfigFactoryResult(
      requestId,
      sourceConfig
    ).catch(() => undefined);
  }

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

function createSourceConfigFactoryId(): string {
  return `${sourceConfigFactoryIdPrefix}-${Crypto.randomUUID()}`;
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

function validateSourceConfigFactory(
  sourceConfigFactory: unknown
): GoogleDaiSourceConfigFactory | undefined {
  if (sourceConfigFactory == null) {
    return undefined;
  }
  if (typeof sourceConfigFactory !== 'function') {
    throw new Error('GoogleDai sourceConfigFactory must be a function.');
  }
  return sourceConfigFactory as GoogleDaiSourceConfigFactory;
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

function validateSourceConfigFactoryContext(
  value: unknown
): GoogleDaiSourceConfigFactoryContext {
  const context = assertRecord(
    value,
    'GoogleDai source config factory context'
  );
  return {
    url: requireNonEmptyString(context.url, 'url'),
    sourceType: requireSourceType(context.sourceType),
    subtitleMetadata: requireStringRecordArray(
      context.subtitleMetadata,
      'subtitleMetadata'
    ),
  };
}

function validateSourceConfigFactoryResult(
  result: GoogleDaiSourceConfigFactoryResult,
  context: GoogleDaiSourceConfigFactoryContext
): Record<string, unknown> {
  if (result == null) {
    return defaultFactorySourceConfig(context);
  }
  const config = assertRecord(result, 'GoogleDai source config factory result');
  return {
    ...defaultFactorySourceConfig(context),
    ...optionalNonEmptyString(config.url, 'url'),
    type:
      config.type == null ? context.sourceType : requireSourceType(config.type),
    ...optionalString(config.title, 'title'),
    ...optionalString(config.description, 'description'),
    ...optionalString(config.poster, 'poster'),
    ...optionalBoolean(config.isPosterPersistent, 'isPosterPersistent'),
    ...optionalArray(config.subtitleTracks, 'subtitleTracks'),
    ...optionalString(config.thumbnailTrack, 'thumbnailTrack'),
    ...optionalStringRecord(config.metadata, 'metadata'),
    ...optionalSourceOptions(config.options),
  };
}

function defaultFactorySourceConfig(
  context: GoogleDaiSourceConfigFactoryContext
): Record<string, unknown> {
  return {
    url: context.url,
    type: context.sourceType,
  };
}

function assertRecord(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${name} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function requireNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`GoogleDai source config requires a non-empty ${field}.`);
  }
  return value;
}

function requireSourceType(value: unknown): GoogleDaiSourceType {
  if (value === GoogleDaiSourceType.DASH || value === GoogleDaiSourceType.HLS) {
    return value;
  }
  throw new Error('GoogleDai source config type must be either dash or hls.');
}

function optionalString<T extends string>(
  value: unknown,
  field: T
): Partial<Record<T, string>> {
  if (value == null) {
    return {};
  }
  if (typeof value !== 'string') {
    throw new Error(`GoogleDai source config ${field} must be a string.`);
  }
  return { [field]: value } as Record<T, string>;
}

function optionalNonEmptyString<T extends string>(
  value: unknown,
  field: T
): Partial<Record<T, string>> {
  if (value == null) {
    return {};
  }
  return { [field]: requireNonEmptyString(value, field) } as Record<T, string>;
}

function optionalBoolean<T extends string>(
  value: unknown,
  field: T
): Partial<Record<T, boolean>> {
  if (value == null) {
    return {};
  }
  if (typeof value !== 'boolean') {
    throw new Error(`GoogleDai source config ${field} must be a boolean.`);
  }
  return { [field]: value } as Record<T, boolean>;
}

function optionalArray<T extends string>(
  value: unknown,
  field: T
): Partial<Record<T, unknown[]>> {
  if (value == null) {
    return {};
  }
  if (!Array.isArray(value)) {
    throw new Error(`GoogleDai source config ${field} must be an array.`);
  }
  return { [field]: value } as Record<T, unknown[]>;
}

function optionalStringRecord<T extends string>(
  value: unknown,
  field: T
): Partial<Record<T, Record<string, string>>> {
  if (value == null) {
    return {};
  }
  return { [field]: requireStringRecord(value, field) } as Record<
    T,
    Record<string, string>
  >;
}

function requireStringRecord(
  value: unknown,
  field: string
): Record<string, string> {
  const parameters = assertRecord(value, `GoogleDai ${field}`);
  const entries = Object.entries(parameters).map(([key, parameterValue]) => {
    if (typeof parameterValue !== 'string') {
      throw new Error(`GoogleDai ${field} keys and values must be strings.`);
    }
    return [key, parameterValue];
  });
  return Object.fromEntries(entries);
}

function requireStringRecordArray(
  value: unknown,
  field: string
): Record<string, string>[] {
  if (!Array.isArray(value)) {
    throw new Error(`GoogleDai ${field} must be an array.`);
  }
  return value.map((entry) => requireStringRecord(entry, field));
}

function optionalSourceOptions(value: unknown): {
  options?: GoogleDaiSourceOptions;
} {
  if (value == null) {
    return {};
  }
  const options = assertRecord(value, 'GoogleDai source config options');
  return {
    options: {
      ...optionalNumber(options.startOffset, 'startOffset'),
      ...optionalTimelineReference(options.startOffsetTimelineReference),
    },
  };
}

function optionalNumber<T extends string>(
  value: unknown,
  field: T
): Partial<Record<T, number>> {
  if (value == null) {
    return {};
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(
      `GoogleDai source config ${field} must be a finite number.`
    );
  }
  return { [field]: value } as Record<T, number>;
}

function optionalTimelineReference(value: unknown): {
  startOffsetTimelineReference?: 'start' | 'end';
} {
  if (value == null) {
    return {};
  }
  if (value === 'start' || value === 'end') {
    return { startOffsetTimelineReference: value };
  }
  throw new Error(
    'GoogleDai source config startOffsetTimelineReference must be start or end.'
  );
}
