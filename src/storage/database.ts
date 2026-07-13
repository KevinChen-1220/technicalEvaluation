export type DatabaseValue = string | number | null;

export type AppDatabase = {
  execAsync(source: string): Promise<void>;
  runAsync(source: string, ...params: DatabaseValue[]): Promise<unknown>;
  getAllAsync<T>(source: string, ...params: DatabaseValue[]): Promise<T[]>;
  getFirstAsync<T>(source: string, ...params: DatabaseValue[]): Promise<T | null>;
};

let databasePromise: Promise<AppDatabase> | null = null;

export function getAppDatabase(): Promise<AppDatabase> {
  databasePromise ??= openSQLiteDatabase();
  return databasePromise;
}

async function openSQLiteDatabase(): Promise<AppDatabase> {
  const sqlite = await import('expo-sqlite');
  return sqlite.openDatabaseAsync('skill_scope.db');
}
