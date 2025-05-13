import {
  AnnotationRelation,
  Code,
  CodebookNode,
  CodebookVariable,
  CodeMap,
  JobManagerState,
  UpdateTrigger,
  ValidRelation,
  VariableMap,
} from "@/app/types";
import standardizeColor from "../standardizeColor";

export function createVariableMap(variables: CodebookVariable[]) {
  const vm: VariableMap = {};
  for (let variable of variables) {
    let cm = variable.codeMap;
    cm = Object.keys(cm).reduce((obj: any, key) => {
      obj[key] = cm[key];
      return obj;
    }, {});

    vm[variable.id] = { ...variable, codeMap: cm };

    if (variable.type === "relation") {
      const [validFrom, validTo] = getValidRelationCodes(variable.relations, variable.codeMap);
      vm[variable.id].validFrom = validFrom;
      vm[variable.id].validTo = validTo;
    }
  }

  return vm;
}

/**
 * If variable of type relation, prepare efficient lookup for
 * valid from/to annotations
 */
function getValidRelationCodes(relations: AnnotationRelation[], codeMap: CodeMap) {
  if (!relations) return [undefined, undefined];
  const validFrom: ValidRelation = {};
  const validTo: ValidRelation = {};

  function addValidRelation(
    valid: ValidRelation,
    relationId: number,
    codes: Code[],
    variable?: string,
    values?: string[],
  ) {
    if (!variable) {
      if (!valid["*"]) valid["*"] = { "*": {} };
      valid["*"]["*"][relationId] = codes;
      return;
    }
    if (!valid[variable]) valid[variable] = {};
    // if we include a code_id, which is just the relation index, we can use that
    // to connect the from/to values

    if (values) {
      for (let value of values) {
        if (!valid[variable][value]) valid[variable][value] = {};
        valid[variable][value][relationId] = codes;
      }
    } else {
      if (!valid[variable]["*"]) valid[variable]["*"] = {};
      valid[variable]["*"][relationId] = codes;
    }
  }

  for (let i = 0; i < relations.length; i++) {
    const relation = relations[i];
    if (!relation.codes) relation.codes = Object.keys(codeMap).map((code) => ({ code }));
    const codes: Code[] = [];
    for (let code of relation.codes) if (codeMap[code.code]) codes.push(codeMap[code.code]);
    addValidRelation(validFrom, i, codes, relation?.from?.variable, relation?.from?.values);
    addValidRelation(validTo, i, codes, relation?.to?.variable, relation?.to?.values);
  }

  return [validFrom, validTo];
}

export async function createVariable(node: CodebookNode, layoutId?: number): Promise<CodebookVariable> {
  if (!("variable" in node.data)) throw new Error("CodebookNode does not contain variable data");

  const variable = node.data.variable;

  const v: CodebookVariable = {
    ...variable,
    name: node.name,
    id: node.id,
    codeMap: {},
    layoutId,
  };

  if ("codes" in v) {
    for (let i = 0; i < v.codes.length; i++) {
      if (v.codes[i].color) v.codes[i].color = standardizeColor(v.codes[i].color);

      v.codeMap[v.codes[i].code] = v.codes[i];
    }
  }

  return v;
}

function updateVariableMap(state: JobManagerState): { variableMap: VariableMap; updateTriggers: UpdateTrigger[] } {
  const variableMap = state.variableMap;
  return { variableMap, updateTriggers: [] };
}
