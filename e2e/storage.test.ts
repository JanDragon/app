import { afterEach, describe, expect as jestExpect, it, jest } from "@jest/globals";

type AsyncStorageMock = {
  getAllKeys: jest.MockedFunction<() => Promise<string[]>>;
  getItem: jest.MockedFunction<(key: string) => Promise<string | null>>;
  removeItem: jest.MockedFunction<(key: string) => Promise<void>>;
  removeMany: jest.MockedFunction<(keys: string[]) => Promise<void>>;
  setItem: jest.MockedFunction<(key: string, value: string) => Promise<void>>;
};

function createAsyncStorageMock(
  initialEntries: Record<string, string> = {},
): AsyncStorageMock {
  const store = new Map(Object.entries(initialEntries));

  return {
    getAllKeys: jest.fn(async () => [...store.keys()]),
    getItem: jest.fn(async (key: string) => store.get(key) ?? null),
    removeItem: jest.fn(async (key: string) => {
      store.delete(key);
    }),
    removeMany: jest.fn(async (keys: string[]) => {
      keys.forEach((key) => store.delete(key));
    }),
    setItem: jest.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
  };
}

async function loadStorageModule(storage: AsyncStorageMock) {
  jest.resetModules();
  jest.doMock("@react-native-async-storage/async-storage", () => ({
    __esModule: true,
    default: storage,
  }));

  return import("../utils/storage");
}

describe("storage migration checks", () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it("checks legacy keys only once for concurrent startup reads", async () => {
    const storage = createAsyncStorageMock({
      servers: JSON.stringify([{ url: "https://demo.evcc.io" }]),
      activeServer: JSON.stringify({ url: "https://demo.evcc.io" }),
    });
    const storageModule = await loadStorageModule(storage);

    const [servers, activeServer] = await Promise.all([
      storageModule.loadServers(),
      storageModule.loadActiveServer(),
    ]);

    jestExpect(storage.getAllKeys).toHaveBeenCalledTimes(1);
    jestExpect(storage.setItem).toHaveBeenCalledWith(
      "migrationChecked",
      "true",
    );
    jestExpect(servers).toEqual([{ url: "https://demo.evcc.io" }]);
    jestExpect(activeServer).toEqual({ url: "https://demo.evcc.io" });
  });

  it("skips the legacy scan after persisting the migration check", async () => {
    const storage = createAsyncStorageMock({
      migrationChecked: "true",
      servers: JSON.stringify([{ url: "https://demo.evcc.io" }]),
      activeServer: JSON.stringify({ url: "https://demo.evcc.io" }),
    });
    const storageModule = await loadStorageModule(storage);

    await storageModule.loadServers();
    await storageModule.loadActiveServer();

    jestExpect(storage.getAllKeys).not.toHaveBeenCalled();
  });
});
