import { GoogleDaiSourceType } from './googleDaiSourceConfig';

export function assertRecord(
  value: unknown,
  name: string
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${name} must be an object.`);
  }
  return value as Record<string, unknown>;
}

export function requireNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`GoogleDai source config requires a non-empty ${field}.`);
  }
  return value;
}

export function requireSourceType(value: unknown): GoogleDaiSourceType {
  if (value === GoogleDaiSourceType.DASH || value === GoogleDaiSourceType.HLS) {
    return value;
  }
  throw new Error('GoogleDai source config type must be either dash or hls.');
}

export function optionalString<T extends string>(
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

export function optionalNonEmptyString<T extends string>(
  value: unknown,
  field: T
): Partial<Record<T, string>> {
  if (value == null) {
    return {};
  }
  return { [field]: requireNonEmptyString(value, field) } as Record<T, string>;
}

export function optionalBoolean<T extends string>(
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

export function optionalArray<T extends string>(
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

export function optionalStringRecord<T extends string>(
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

export function requireStringRecord(
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

export function requireStringRecordArray(
  value: unknown,
  field: string
): Record<string, string>[] {
  if (!Array.isArray(value)) {
    throw new Error(`GoogleDai ${field} must be an array.`);
  }
  return value.map((entry) => requireStringRecord(entry, field));
}

export function optionalNumber<T extends string>(
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
