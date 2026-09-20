// The bundled message structures the engine tests run on.
import ORU_R01_2_1 from "../../src/profiles/v2.1/events/ORU_R01.json";
import PPP_PCB_2_3_1 from "../../src/profiles/v2.3.1/events/PPP_PCB.json";
import ADT_A01_2_5 from "../../src/profiles/v2.5/events/ADT_A01.json";
import CSU_C09_2_5 from "../../src/profiles/v2.5/events/CSU_C09.json";
import MFN_M01_2_5 from "../../src/profiles/v2.5/events/MFN_M01.json";
import ORM_O01_2_5 from "../../src/profiles/v2.5/events/ORM_O01.json";
import ORU_R01_2_5 from "../../src/profiles/v2.5/events/ORU_R01.json";
import type { MessageStructure } from "../../src/structure/types";

export const ORU_R01_V2_5 = ORU_R01_2_5 as MessageStructure;
export const ADT_A01_V2_5 = ADT_A01_2_5 as MessageStructure;
export const ORM_O01_V2_5 = ORM_O01_2_5 as MessageStructure;
export const CSU_C09_V2_5 = CSU_C09_2_5 as MessageStructure;
export const MFN_M01_V2_5 = MFN_M01_2_5 as MessageStructure;
export const ORU_R01_V2_1 = ORU_R01_2_1 as MessageStructure;
export const PPP_PCB_V2_3_1 = PPP_PCB_2_3_1 as MessageStructure;
