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
  /**
   * @platform Android
   */
  adTagParameters?: Record<string, string>;
}
