export enum GoogleDaiSourceType {
  /**
   * @platform Android
   */
  DASH = 'dash',
  HLS = 'hls',
}

export type GoogleDaiSourceConfig = GoogleDaiLiveSourceConfig;

export interface GoogleDaiLiveSourceConfig {
  kind: 'live';
  assetKey: string;
  type: GoogleDaiSourceType;
  apiKey?: string;
  networkCode?: string;
  /** Forwarded to the Google IMA DAI stream request on iOS and Android. */
  adTagParameters?: Record<string, string>;
}
