import type { SourceConfig, SourceOptions } from 'bitmovin-player-react-native';
import { TimelineReferencePoint } from 'bitmovin-player-react-native';
import * as Crypto from 'expo-crypto';
import GoogleDaiModule, {
  addSourceConfigFactoryRequestListener,
  type GoogleDaiSourceConfigFactoryRequest,
} from './modules/GoogleDaiModule';
import { GoogleDaiSourceType } from './googleDaiSourceConfig';
import {
  deleteSourceConfigFactory,
  storeSourceConfigFactory,
  takeSourceConfigFactory,
} from './googleDaiSourceConfigFactoryRegistry';
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
let isListenerInstalled = false;

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

export function registerSourceConfigFactory(
  factory: GoogleDaiSourceConfigFactory | undefined
): string | undefined {
  const validatedFactory = validateSourceConfigFactory(factory);
  if (!validatedFactory) {
    return undefined;
  }

  installListener();
  const factoryId = `${sourceConfigFactoryIdPrefix}-${Crypto.randomUUID()}`;
  storeSourceConfigFactory(factoryId, validatedFactory);
  return factoryId;
}

export function unregisterSourceConfigFactory(factoryId?: string): void {
  deleteSourceConfigFactory(factoryId);
}

function installListener(): void {
  if (isListenerInstalled) {
    return;
  }
  addSourceConfigFactoryRequestListener(handleRequest);
  isListenerInstalled = true;
}

function handleRequest(request: GoogleDaiSourceConfigFactoryRequest): void {
  const factory = takeSourceConfigFactory(request.sourceConfigFactoryId);
  if (!factory) {
    completeRequest(request.requestId, null);
    return;
  }

  try {
    const context = validateSourceConfigFactoryContext(request.context);
    const result = factory(context);
    completeRequest(
      request.requestId,
      validateSourceConfigFactoryResult(result, context)
    );
  } catch {
    completeRequest(request.requestId, null);
  }
}

function completeRequest(
  requestId: number,
  sourceConfig: Record<string, unknown> | null
): void {
  void GoogleDaiModule.setSourceConfigFactoryResult(
    requestId,
    sourceConfig
  ).catch(() => {
    // Native falls back after its bounded wait if the response cannot be sent.
  });
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
