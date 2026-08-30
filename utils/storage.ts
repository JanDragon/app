import AsyncStorage from "@react-native-async-storage/async-storage";
import { BasicAuth, type Server } from "types";

export enum StorageKeys {
  SERVER_URL = "serverUrl", // legacy
  BASIC_AUTH = "basicAuth", // legacy
  SERVERS = "servers",
  ACTIVE_SERVER = "activeServer",
  MIGRATION_CHECKED = "migrationChecked",
}

async function loadLegacyStorage(): Promise<Server> {
  const url = (await AsyncStorage.getItem(StorageKeys.SERVER_URL)) || "";
  const basicAuthJson = await AsyncStorage.getItem(StorageKeys.BASIC_AUTH);

  const basicAuth = basicAuthJson
    ? (JSON.parse(basicAuthJson) as BasicAuth)
    : { required: false };

  return { url, basicAuth };
}

let migrationPromise: Promise<void> | undefined;

async function migrate() {
  const migrationChecked = await AsyncStorage.getItem(
    StorageKeys.MIGRATION_CHECKED,
  );
  if (migrationChecked) return;

  const keys = await AsyncStorage.getAllKeys();
  if (!keys.includes(StorageKeys.SERVER_URL)) {
    await AsyncStorage.setItem(StorageKeys.MIGRATION_CHECKED, "true");
    return;
  }
  if (keys.includes(StorageKeys.SERVERS)) {
    // stale legacy leftovers next to an existing config: current config wins
    await AsyncStorage.removeMany([
      StorageKeys.SERVER_URL,
      StorageKeys.BASIC_AUTH,
    ]);
  } else {
    await migrateStorage();
  }

  await AsyncStorage.setItem(StorageKeys.MIGRATION_CHECKED, "true");
}

async function ensureMigrated() {
  if (!migrationPromise) {
    migrationPromise = migrate().catch((error) => {
      migrationPromise = undefined;
      throw error;
    });
  }

  await migrationPromise;
}

async function migrateStorage() {
  const server = await loadLegacyStorage();
  await storeActiveServer(server);
  await storeServers([server]);
  await AsyncStorage.removeMany([
    StorageKeys.SERVER_URL,
    StorageKeys.BASIC_AUTH,
  ]);
}

export async function loadActiveServer(): Promise<Server | undefined> {
  await ensureMigrated();
  const activeServerJson = await AsyncStorage.getItem(
    StorageKeys.ACTIVE_SERVER,
  );
  return activeServerJson ? JSON.parse(activeServerJson) : undefined;
}

export async function loadServers(): Promise<Server[]> {
  await ensureMigrated();
  const serversJson = await AsyncStorage.getItem(StorageKeys.SERVERS);
  return serversJson ? JSON.parse(serversJson) : [];
}

export async function storeActiveServer(server?: Server) {
  if (server !== undefined) {
    await AsyncStorage.setItem(
      StorageKeys.ACTIVE_SERVER,
      JSON.stringify(server),
    );
  } else {
    await AsyncStorage.removeItem(StorageKeys.ACTIVE_SERVER);
  }
}

async function storeServers(servers: Server[]) {
  await AsyncStorage.setItem(StorageKeys.SERVERS, JSON.stringify(servers));
}

export async function addServer(server: Server): Promise<Server[]> {
  const servers = await loadServers();
  servers.push(server);
  await storeServers(servers);
  return servers;
}

export async function updateServer(
  server: Server,
  index: number,
): Promise<Server[]> {
  const servers = await loadServers();
  servers[index] = server;
  await storeServers(servers);
  return servers;
}

export async function removeServer(
  index: number,
): Promise<{ removedServer: Server; remainingServers: Server[] }> {
  const servers = await loadServers();
  const removedServer = servers.splice(index, 1)[0];
  await storeServers(servers);
  return { removedServer, remainingServers: servers };
}
