// The bundled message structures the engine tests run on.
import { loadMessageStructures } from "../../src/loaders/message-structures";
import type { MessageStructure } from "../../src/structure/types";

const bundled = async (
  version: string,
  id: string
): Promise<MessageStructure> => {
  const structures = await loadMessageStructures(version);
  const structure = structures?.get(id);
  if (!structure) {
    throw new Error(`v${version} bundles no ${id}`);
  }
  return structure;
};

export const ORU_R01_V2_5 = await bundled("2.5", "ORU_R01");
export const ADT_A01_V2_5 = await bundled("2.5", "ADT_A01");
export const ORM_O01_V2_5 = await bundled("2.5", "ORM_O01");
export const CSU_C09_V2_5 = await bundled("2.5", "CSU_C09");
export const MFN_M01_V2_5 = await bundled("2.5", "MFN_M01");
export const ORU_R01_V2_1 = await bundled("2.1", "ORU_R01");
export const PPP_PCB_V2_3_1 = await bundled("2.3.1", "PPP_PCB");
