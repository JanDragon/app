type AsyncStorageMock = {
  getAllKeys: jest.Mock<Promise<string[]>, []>;
  getItem: jest.Mock<Promise<string | null>, [string]>;
  removeItem: jest.Mock<Promise<void>, [string]>;
  removeMany: jest.Mock<Promise<void>, [string[]]>;
  setItem: jest.Mock<Promise<void>, [string, string]>;
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

  return import("./utils/storage");
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

    expect(storage.getAllKeys).toHaveBeenCalledTimes(1);
    expect(storage.setItem).toHaveBeenCalledWith("migrationChecked", "true");
    expect(servers).toEqual([{ url: "https://demo.evcc.io" }]);
    expect(activeServer).toEqual({ url: "https://demo.evcc.io" });
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

    expect(storage.getAllKeys).not.toHaveBeenCalled();
  });
});
