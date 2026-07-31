import type { SourceConfig, SourceOptions } from 'bitmovin-player-react-native';
import { TimelineReferencePoint } from 'bitmovin-player-react-native';
import type { EventSubscription } from 'expo-modules-core';
import * as Crypto from 'expo-crypto';
import GoogleDaiModule, {
  addSourceConfigFactoryRequestListener,
  type GoogleDaiSourceConfigFactoryRequest,
} from './modules/GoogleDaiModule';
import { GoogleDaiSourceType } from './googleDaiSourceConfig';
import {
  assertRecord,
  optionalArray,
  optionalBoolean,
  optionalNonEmptyString,
  optionalNumber,
  optionalString,
  optionalStringRecord,
  requireNonEmptyString,
  requireSourceType,
  requireStringRecordArray,
} from './googleDaiValidation';

const sourceConfigFactoryIdPrefix = 'source-config-factory';
const sourceConfigFactoryRegistrationTimeoutMs = 60_000;

/**
 * Builds the Player `SourceConfig` from the DAI-provided source context.
 * The callback is synchronous because native waits briefly for its result.
 * Native falls back to the default source config when it throws, times out,
 * or returns invalid data.
 */
export type GoogleDaiSourceConfigFactory = (
  context: GoogleDaiSourceConfigFactoryContext
) => GoogleDaiSourceConfigFactoryResult;

export interface GoogleDaiSourceConfigFactoryContext {
  readonly url: string;
  readonly sourceType: GoogleDaiSourceType;
  readonly subtitleMetadata: ReadonlyArray<Record<string, string>>;
}

export type GoogleDaiSourceConfigFactoryResult =
  GoogleDaiSourceConfigFactorySourceConfig | null | undefined;

type GoogleDaiSourceConfigFactoryMutableSourceConfig = Pick<
  SourceConfig,
  | 'title'
  | 'description'
  | 'poster'
  | 'isPosterPersistent'
  | 'subtitleTracks'
  | 'thumbnailTrack'
  | 'metadata'
>;

export type GoogleDaiSourceConfigFactorySourceConfig =
  Partial<GoogleDaiSourceConfigFactoryMutableSourceConfig> & {
    url?: string;
    type?: GoogleDaiSourceType;
    options?: SourceOptions;
  };

type SourceConfigFactoryRegistration = {
  readonly googleDaiId: string;
  readonly factory: GoogleDaiSourceConfigFactory;
  readonly expiration: ReturnType<typeof setTimeout>;
};

export interface GoogleDaiSourceConfigFactoryNativeBridge {
  addRequestListener(
    listener: (request: GoogleDaiSourceConfigFactoryRequest) => void
  ): EventSubscription;
  setResult(
    requestId: number,
    sourceConfig: Record<string, unknown> | null
  ): Promise<void>;
}

export class GoogleDaiSourceConfigFactoryBridge {
  private readonly registrations = new Map<
    string,
    SourceConfigFactoryRegistration
  >();
  private subscription?: EventSubscription;

  constructor(
    private readonly nativeBridge: GoogleDaiSourceConfigFactoryNativeBridge,
    private readonly registrationTimeoutMs = sourceConfigFactoryRegistrationTimeoutMs
  ) {}

  register(
    googleDaiId: string,
    factory: GoogleDaiSourceConfigFactory | undefined
  ): string | undefined {
    const validatedFactory = validateSourceConfigFactory(factory);
    if (!validatedFactory) {
      return undefined;
    }

    this.ensureListener();
    const id = this.createFactoryId();
    const expiration = setTimeout(
      () => this.unregister(id),
      this.registrationTimeoutMs
    );
    this.registrations.set(id, {
      googleDaiId,
      factory: validatedFactory,
      expiration,
    });
    return id;
  }

  unregister(factoryId: string | undefined): void {
    if (!factoryId) {
      return;
    }
    const registration = this.registrations.get(factoryId);
    if (!registration) {
      return;
    }

    clearTimeout(registration.expiration);
    this.registrations.delete(factoryId);
    this.removeListenerWhenIdle();
  }

  private ensureListener(): void {
    if (this.subscription) {
      return;
    }
    this.subscription = this.nativeBridge.addRequestListener(
      this.handleRequest
    );
  }

  private readonly handleRequest = (
    request: GoogleDaiSourceConfigFactoryRequest
  ): void => {
    const registration = this.registrations.get(request.sourceConfigFactoryId);
    if (!registration || registration.googleDaiId !== request.googleDaiId) {
      this.complete(request.requestId, null);
      return;
    }

    this.unregister(request.sourceConfigFactoryId);
    try {
      const context = validateSourceConfigFactoryContext(request.context);
      const result = registration.factory(context);
      this.complete(
        request.requestId,
        validateSourceConfigFactoryResult(result, context)
      );
    } catch {
      this.complete(request.requestId, null);
    }
  };

  private complete(
    requestId: number,
    sourceConfig: Record<string, unknown> | null
  ): void {
    void this.nativeBridge.setResult(requestId, sourceConfig).catch(() => {
      // Native falls back after its bounded wait if the response cannot be sent.
    });
  }

  private removeListenerWhenIdle(): void {
    if (this.registrations.size !== 0) {
      return;
    }
    this.subscription?.remove();
    this.subscription = undefined;
  }

  private createFactoryId(): string {
    let id: string;
    do {
      id = `${sourceConfigFactoryIdPrefix}-${Crypto.randomUUID()}`;
    } while (this.registrations.has(id));
    return id;
  }
}

const sourceConfigFactoryBridge = new GoogleDaiSourceConfigFactoryBridge({
  addRequestListener: addSourceConfigFactoryRequestListener,
  setResult: (requestId, sourceConfig) =>
    GoogleDaiModule.setSourceConfigFactoryResult(requestId, sourceConfig),
});

export function registerSourceConfigFactory(
  googleDaiId: string,
  factory: GoogleDaiSourceConfigFactory | undefined
): string | undefined {
  return sourceConfigFactoryBridge.register(googleDaiId, factory);
}

export function unregisterSourceConfigFactory(
  factoryId: string | undefined
): void {
  sourceConfigFactoryBridge.unregister(factoryId);
}

function validateSourceConfigFactory(
  factory: unknown
): GoogleDaiSourceConfigFactory | undefined {
  if (factory == null) {
    return undefined;
  }
  if (typeof factory !== 'function') {
    throw new Error('GoogleDai sourceConfigFactory must be a function.');
  }
  return factory as GoogleDaiSourceConfigFactory;
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

function optionalSourceOptions(value: unknown): {
  options?: SourceOptions;
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

function optionalTimelineReference(
  value: unknown
): Pick<SourceOptions, 'startOffsetTimelineReference'> {
  if (value == null) {
    return {};
  }
  switch (value) {
    case TimelineReferencePoint.START:
      return { startOffsetTimelineReference: TimelineReferencePoint.START };
    case TimelineReferencePoint.END:
      return { startOffsetTimelineReference: TimelineReferencePoint.END };
    default:
      throw new Error(
        'GoogleDai source config startOffsetTimelineReference must be start or end.'
      );
  }
}
