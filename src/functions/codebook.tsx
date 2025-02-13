import { Codebook, CodebookVariable, ExtendedCodebook, ExtendedVariable } from "@/app/types";
import randomColor from "randomcolor";
import standardizeColor from "./standardizeColor";

export function importCodebook(codebook: Codebook | ExtendedCodebook): ExtendedCodebook {
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
