import { fetch as expoFetch } from 'expo/fetch';
import { File } from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';

export const API_ORIGIN = 'https://omssimulation.alexsl3p.chatgpt.site';
const KEY_NAME = 'oms_simulation_api_key';

export type ApiTicket = {
  id: number;
  title: string;
  description: string;
  department: string;
  process: string;
  priority: string;
  status: string;
  reporter: string;
  createdAt: string;
  details: Record<string, string>;
};

export async function loadApiKey() {
  return SecureStore.getItemAsync(KEY_NAME);
}

export async function saveApiKey(key: string) {
  await SecureStore.setItemAsync(KEY_NAME, key.trim());
}

export async function clearApiKey() {
  await SecureStore.deleteItemAsync(KEY_NAME);
}

async function apiRequest(path: string, key: string, init: RequestInit = {}) {
  const response = await expoFetch(`${API_ORIGIN}/api/v1${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${key}`, ...init.headers },
  });
  if (!response.ok) {
    if (response.status === 401) throw new Error('API võti ei kehti. Kontrolli võtit seadetes.');
    if (response.status === 403) throw new Error('Saidi ligipääs blokeerib mobiilirakenduse.');
    const payload = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(payload.error || `API viga (${response.status}).`);
  }
  return response;
}

export async function listApiTickets(key: string) {
  const response = await apiRequest('/tickets?limit=100', key);
  const data = await response.json() as { items: ApiTicket[] };
  return data.items;
}

export async function createApiTicket(key: string, input: Record<string, string>, photo: string | null) {
  let attachment: Record<string, string> = {};
  if (photo) {
    const file = new File(photo);
    if (!file.exists || !file.size || file.size > 10 * 1024 * 1024) {
      throw new Error('Pilt peab olema kuni 10 MB.');
    }
    const data = new FormData();
    data.append('file', file);
    const upload = await apiRequest('/files', key, { method: 'POST', body: data });
    attachment = await upload.json() as { attachmentKey: string; attachmentName: string };
  }
  const response = await apiRequest('/tickets', key, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...input, ...attachment }),
  });
  return response.json() as Promise<{ id: number; reference: string; createdAt: string }>;
}
