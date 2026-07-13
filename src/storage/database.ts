import { openDatabaseAsync } from 'expo-sqlite';

export type DatabaseValue = string | number | null;

export type AppDatabase = {
  execAsync(source: string): Promise<void>;
  runAsync(source: string, ...params: DatabaseValue[]): Promise<unknown>;
  getAllAsync<T>(source: string, ...params: DatabaseValue[]): Promise<T[]>;
  getFirstAsync<T>(source: string, ...params: DatabaseValue[]): Promise<T | null>;
};

let databasePromise: Promise<AppDatabase> | null = null;

export function getAppDatabase(): Promise<AppDatabase> {
  if (!databasePromise) {
    databasePromise = openDatabaseAsync('skill_scope.db');
  }

  return databasePromise;
}
