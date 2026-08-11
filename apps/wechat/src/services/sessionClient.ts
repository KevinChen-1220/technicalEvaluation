import { publicError } from './edgeOneRuntime';

const SESSION_STORAGE_KEY = 'skill-scope:edgeone-session';

type StoredSession = { token: string; expiresAt: string };

type StoragePort = {
  get<T>(key: string): T | undefined;
  set<T>(key: string, value: T): void;
  remove(key: string): void;
};

type LoginPort = () => Promise<{ code?: string }>;
type ExchangePort = (code: string) => Promise<StoredSession>;

export type SessionClient = {
  ensureSession(): Promise<string>;
  refreshSession(): Promise<string>;
  clearSession(): void;
};

export function createSessionClient(input: {
  storage: StoragePort;
  login: LoginPort;
  exchange: ExchangePort;
  now?: () => Date;
}): SessionClient {
  const now = input.now ?? (() => new Date());
  let active: Promise<string> | undefined;

  function clearSession(): void {
    input.storage.remove(SESSION_STORAGE_KEY);
  }

  function validStoredSession(): StoredSession | undefined {
    const stored = input.storage.get<StoredSession>(SESSION_STORAGE_KEY);
    if (!isStoredSession(stored) || new Date(stored.expiresAt).getTime() <= now().getTime()) {
      if (stored !== undefined) clearSession();
      return undefined;
    }
    return stored;
  }

  async function establish(force: boolean): Promise<string> {
    if (!force) {
      const stored = validStoredSession();
      if (stored !== undefined) return stored.token;
    } else {
      clearSession();
    }
    if (active === undefined) {
      active = (async () => {
        try {
          const login = await input.login();
          if (!login.code) throw publicError('LOGIN_FAILED', 'WeChat login did not return a code.', undefined, true);
          const session = await input.exchange(login.code);
          if (!isStoredSession(session) || new Date(session.expiresAt).getTime() <= now().getTime()) {
            throw publicError('INVALID_RESPONSE', 'EdgeOne session response is invalid.', undefined, true);
          }
          input.storage.set(SESSION_STORAGE_KEY, session);
          return session.token;
        } catch (error) {
          clearSession();
          if (isTypedError(error)) throw error;
          throw publicError('LOGIN_FAILED', 'WeChat login failed.', undefined, true);
        } finally {
          active = undefined;
        }
      })();
    }
    return await active;
  }

  return {
    ensureSession: async () => await establish(false),
    refreshSession: async () => await establish(true),
    clearSession,
  };
}

function isStoredSession(value: unknown): value is StoredSession {
  return typeof value === 'object' && value !== null
    && typeof (value as StoredSession).token === 'string' && (value as StoredSession).token.length > 0
    && typeof (value as StoredSession).expiresAt === 'string'
    && Number.isFinite(new Date((value as StoredSession).expiresAt).getTime());
}

function isTypedError(value: unknown): value is Error & { errorCode: string } {
  return value instanceof Error && 'errorCode' in value;
}
