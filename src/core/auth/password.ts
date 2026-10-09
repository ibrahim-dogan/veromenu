import "server-only";
import { hash, verify } from "@node-rs/argon2";

export const hashPassword = (password: string) =>
  hash(password, { memoryCost: 19456, timeCost: 2, parallelism: 1 });

export const verifyPassword = async (hashStr: string, password: string) => {
  try {
    return await verify(hashStr, password);
  } catch {
    return false;
  }
};

export const passwordPolicy = (pw: string) => pw.length >= 8;
