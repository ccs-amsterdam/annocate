import { CodebookPhase, CodebookVariable, ExtendedCodebook, ExtendedVariable } from "@/app/types";
import randomColor from "randomcolor";
import standardizeColor from "./standardizeColor";

export function importCodebook(codebook: CodebookPhase): ExtendedCodebook {
  return {
    ...codebook,
    variables: importVariables(codebook.variables),
  };
}

const importVariables = (variables: CodebookVariable[]): ExtendedVariable[] => {
  // checks and preparation of variables
  return variables.map((variable) => {
    const fillMissingColor = ["annotinder"].includes(variable.type);

    const eVariable: ExtendedVariable = {
      ...variable,
      codeMap: {},
    };

    if ("codes" in eVariable) {
      for (let i = 0; i < eVariable.codes.length; i++) {
        if (!eVariable.codes[i].color && fillMissingColor)
          eVariable.codes[i].color = randomColor({ seed: eVariable.codes[i].code, luminosity: "light" });

        if (eVariable.codes[i].color) eVariable.codes[i].color = standardizeColor(eVariable.codes[i].color);

        eVariable.codeMap[eVariable.codes[i].code] = eVariable.codes[i];
      }
    }

    return eVariable;
  });
};

// function preparePhaseCodebooks(phase: number, blocks: JobBlocksResponse[]) {
//   const phaseBlocks: JobBlocksResponse[] = [];
//   let phaseStarted = false;
//   let type: BlockType | null = null;

//   for (let block of blocks) {
//     if (block.parentId === null) {
//       // if root block
//       if (phaseStarted) break;
//       if (block.position === phase) {
//         phaseStarted = true;
//         type = block.type;
//       }
//     }

//     if (phaseStarted) phaseBlocks.push(block);
//   }

//   if (!type) throw new Error("Phase not found");

//   const codebook: CodebookPhase = { type, variables: [] };
//   let layout: Layout | undefined = undefined;

//   for (let block of phaseBlocks) {
//     if ("layout" in block.content) layout = block.content.layout;
//     if (block.type === "annotationQuestion" || block.type === "surveyQuestion") {
//       codebook.variables.push({ name: block.name, layout, ...block.content });
//     }
//   }

//   return codebook;
// }
