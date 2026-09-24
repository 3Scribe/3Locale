import { zipSync, strToU8 } from "fflate";
import type { ArchiveProvider } from "../domain/model";
export const zipArchive: ArchiveProvider = {
  async pack(files) {
    return zipSync(
      Object.fromEntries(files.map((file) => [file.name, strToU8(file.text)])),
      { level: 1 },
    );
  },
};
