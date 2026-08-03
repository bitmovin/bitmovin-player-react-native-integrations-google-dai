import {
  type EventSubscription,
  type NativeModule,
  requireOptionalNativeModule,
} from 'expo-modules-core';
import type {
  GoogleDaiSourceConfig,
  GoogleDaiSourceType,
} from '../googleDaiSourceConfig';

const moduleName = 'GoogleDaiModule';
const sourceConfigFactoryEventName = 'onSourceConfigFactoryRequest';

export interface GoogleDaiSourceConfigFactoryRequestContext {
  url: string;
  sourceType: GoogleDaiSourceType;
  subtitleMetadata: Record<string, string>[];
}

export interface GoogleDaiSourceConfigFactoryRequest {
  requestId: number;
  sourceConfigFactoryId: string;
  context: GoogleDaiSourceConfigFactoryRequestContext;
}

type GoogleDaiModuleEvents = {
  [sourceConfigFactoryEventName]: (
    request: GoogleDaiSourceConfigFactoryRequest
  ) => void;
};

declare class GoogleDaiModule extends NativeModule<GoogleDaiModuleEvents> {
  initialize(googleDaiId: string, playerId: string): Promise<void>;
  load(
    googleDaiId: string,
    sourceConfig: GoogleDaiSourceConfig,
    sourceConfigFactoryId: string | null
  ): Promise<void>;
  setSourceConfigFactoryResult(
    requestId: number,
    sourceConfig: Record<string, unknown> | null
  ): Promise<void>;
  destroy(googleDaiId: string): Promise<void>;
}

const nativeModule = requireOptionalNativeModule<GoogleDaiModule>(moduleName);

export function assertGoogleDaiModuleAvailable(): GoogleDaiModule {
  if (!nativeModule) {
    throw new Error(
      `Cannot find native module '${moduleName}'. Install @bitmovin/player-react-native-google-dai and rebuild the native application before calling withGoogleDai().`
    );
  }
  return nativeModule;
}

export function addSourceConfigFactoryRequestListener(
  listener: (request: GoogleDaiSourceConfigFactoryRequest) => void
): EventSubscription {
  return assertGoogleDaiModuleAvailable().addListener(
    sourceConfigFactoryEventName,
    listener
  );
}

const GoogleDaiModuleProxy: GoogleDaiModule = {
  initialize: (googleDaiId: string, playerId: string) =>
    assertGoogleDaiModuleAvailable().initialize(googleDaiId, playerId),
  load: (
    googleDaiId: string,
    sourceConfig: GoogleDaiSourceConfig,
    sourceConfigFactoryId: string | null
  ) =>
    assertGoogleDaiModuleAvailable().load(
      googleDaiId,
      sourceConfig,
      sourceConfigFactoryId
    ),
  setSourceConfigFactoryResult: (
    requestId: number,
    sourceConfig: Record<string, unknown> | null
  ) =>
    assertGoogleDaiModuleAvailable().setSourceConfigFactoryResult(
      requestId,
      sourceConfig
    ),
  destroy: (googleDaiId: string) =>
    assertGoogleDaiModuleAvailable().destroy(googleDaiId),
} as GoogleDaiModule;

export default GoogleDaiModuleProxy;
