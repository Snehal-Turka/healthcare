export interface Storage {
  save(key: string, data: Uint8Array, contentType: string): Promise<string>;
  load(ref: string): Promise<Uint8Array>;
}
