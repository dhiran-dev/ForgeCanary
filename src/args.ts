export function readArg(name: string, fallback?: string): string {
  const index = process.argv.indexOf(`--${name}`);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (value !== undefined) return value;
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing --${name}`);
}

export function readIntegerArg(name: string, fallback: number): number {
  const value = Number.parseInt(readArg(name, String(fallback)), 10);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`Invalid --${name}`);
  return value;
}

