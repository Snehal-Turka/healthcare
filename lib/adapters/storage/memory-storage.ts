import type { Storage } from "./storage";

export class MemoryStorage implements Storage {
  private readonly store = new Map<string, Uint8Array>();

  async save(key: string, data: Uint8Array, _contentType: string): Promise<string> {
    void _contentType;
    this.store.set(key, data);
    return `mem:${key}`;
  }

  async load(ref: string): Promise<Uint8Array> {
    const key = ref.startsWith("mem:") ? ref.slice("mem:".length) : ref;
    const data = this.store.get(key);
    if (!data) throw new Error(`Not found: ${ref}`);
    return data;
  }
}
