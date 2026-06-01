import type { Storage } from "./storage";

export class DiscardingStorage implements Storage {
  async save(
    key: string,
    _data: Uint8Array,
    _contentType: string,
  ): Promise<string> {
    void _data;
    void _contentType;
    return `discarded:${key}`;
  }

  async load(ref: string): Promise<Uint8Array> {
    throw new Error(`Audio was not retained: ${ref}`);
  }
}
