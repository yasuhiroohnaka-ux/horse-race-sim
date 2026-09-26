import fs from "node:fs/promises";
import path from "node:path";

/** @param {string} filePath @param {"utf8"} [encoding] */
export const readDataFile = (filePath, encoding = "utf8") => fs.readFile(filePath, encoding);
export async function writeDataFile(filePath, data, encoding = "utf8") {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, data, encoding);
}
export async function appendDataFile(filePath, data, encoding = "utf8") {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.appendFile(filePath, data, encoding);
}
export const dataStorageKind = String("file");
