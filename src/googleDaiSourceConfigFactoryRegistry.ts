import type { GoogleDaiSourceConfigFactory } from './googleDaiSourceConfigFactory';

const registrationTimeoutMs = 60_000;
const registrations = new Map<
  string,
  {
    factory: GoogleDaiSourceConfigFactory;
    expiration: ReturnType<typeof setTimeout>;
  }
>();

export function storeSourceConfigFactory(
  factoryId: string,
  factory: GoogleDaiSourceConfigFactory
): void {
  registrations.set(factoryId, {
    factory,
    expiration: setTimeout(
      () => deleteSourceConfigFactory(factoryId),
      registrationTimeoutMs
    ),
  });
}

export function takeSourceConfigFactory(
  factoryId: string
): GoogleDaiSourceConfigFactory | undefined {
  const factory = registrations.get(factoryId)?.factory;
  deleteSourceConfigFactory(factoryId);
  return factory;
}

export function deleteSourceConfigFactory(factoryId?: string): void {
  if (!factoryId) {
    return;
  }
  const registration = registrations.get(factoryId);
  if (!registration) {
    return;
  }
  clearTimeout(registration.expiration);
  registrations.delete(factoryId);
}
