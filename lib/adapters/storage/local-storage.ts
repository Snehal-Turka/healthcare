import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Storage } from "./storage";

export class LocalStorage implements Storage {
  constructor(private readonly baseDir: string) {}

  async save(
    key: string,
    data: Uint8Array,
    _contentType: string,
  ): Promise<string> {
    const filePath = join(this.baseDir, key);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, data);
    return `local:${filePath}`;
  }

  async load(ref: string): Promise<Uint8Array> {
    const filePath = ref.startsWith("local:")
      ? ref.slice("local:".length)
      : ref;
    return new Uint8Array(await readFile(filePath));
  }
}
