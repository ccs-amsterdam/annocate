import {
  CodebookNode,
  CodebookPhase,
  ExtendedCodebookPhase,
  ExtendedVariable,
  Layout,
  Phase,
  VariableSchema,
} from "@/app/types";
import standardizeColor from "./standardizeColor";
import randomColor from "randomcolor";

/*
  Here we break the codebook nodes into phases, and handle any inheritable
  properties (layout)
*/
export function getCodebookPhases(nodes: CodebookNode[]): ExtendedCodebookPhase[] {
  const phases: ExtendedCodebookPhase[] = [];

  // inheritables
  let layout: Layout | undefined = undefined;

  let phase = -1;
  for (let node of nodes) {
    if (node.parentId === null) {
      // if start of new phase, add it to phases and reset inheritables
      phase++;
      phases[phase] = {
        id: node.id,
        label: node.name.replaceAll("_", " "),
        type: node.phase,
        variables: [],
      };

      // reset inheritables
      layout = undefined;
    }

    // inheritables
    layout = "layout" in node.data ? node.data.layout : undefined;

    if ("variable" in node.data) {
      phases[phase].variables.push(prepareVariable(node.name, node.data.variable, layout));
    }
  }

  return phases;
}

function prepareVariable(name: string, variable: VariableSchema, layout?: Layout): ExtendedVariable {
  const fillMissingColor = variable.type === "annotinder";

  const eVariable: ExtendedVariable = {
    ...variable,
    name,
    layout,
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
}
