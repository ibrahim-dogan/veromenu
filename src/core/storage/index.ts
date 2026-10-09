import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { env } from "@/core/env";

/**
 * Storage driver abstraction. Default: local disk (mount ./data as a Docker volume).
 * Add an S3-compatible driver (Hetzner Object Storage, MinIO, AWS) by implementing StorageDriver.
 */
export interface StorageDriver {
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<void>;
}

class LocalDriver implements StorageDriver {
  constructor(private root: string) {}
  private resolve(key: string) {
    const p = path.resolve(this.root, key);
    if (!p.startsWith(path.resolve(this.root) + path.sep)) throw new Error("invalid storage key");
    return p;
  }
  async put(key: string, data: Buffer) {
    const p = this.resolve(key);
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, data);
  }
  async get(key: string) {
    try {
      return await fs.readFile(this.resolve(key));
    } catch {
      return null;
    }
  }
  async delete(key: string) {
    await fs.rm(this.resolve(key), { force: true });
  }
}

let driver: StorageDriver | null = null;
export function storage(): StorageDriver {
  if (driver) return driver;
  const e = env();
  if (e.STORAGE_DRIVER === "s3") throw new Error("S3 storage driver not implemented yet – use STORAGE_DRIVER=local");
  driver = new LocalDriver(path.resolve(e.STORAGE_LOCAL_DIR));
  return driver;
}

/** Public URL for a storage key (served by app/media/[...key]/route.ts). */
export const mediaUrl = (key: string | null | undefined) => (key ? `/media/${key}` : null);
