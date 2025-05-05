import { useMemo } from "react";
import {
  VariableValueMap,
  CodebookVariable,
  CodeRelation,
  VariableType,
  VariableMap,
  ValidRelation,
  Code,
  CodeMap,
  AnnotationRelation,
} from "@/app/types";

export default function useVariableMap(
  variables?: CodebookVariable[],
  selectedVariable?: string,
): [CodebookVariable | null, VariableMap, VariableMap | null, VariableMap | null, VariableType | null] {
  const fullVariableMap: VariableMap = useMemo(() => {
    // creates fullVariableMap
    if (!variables || variables.length === 0) return null;

    const vm: any = {};
    for (let variable of variables) {
      let cm = variable.codeMap;
      cm = Object.keys(cm).reduce((obj: any, key) => {
        obj[key] = cm[key];
        return obj;
      }, {});

      vm[variable.name] = { ...variable, codeMap: cm };

      if (variable.type === "relation") {
        const [validFrom, validTo] = getValidRelationCodes(variable.relations, variable.codeMap);
        vm[variable.name].validFrom = validFrom;
        vm[variable.name].validTo = validTo;
      }
    }

    return vm;
  }, [variables]);

  const [variableMap, showValues, variableType]: [VariableMap | null, VariableMap | null, VariableType | null] =
    useMemo(() => {
      // creates the actually used variableMap from the fullVariableMap
      // this lets us select specific variables without recreating full map
      // Here we also add imported variables
      if (fullVariableMap === null) return [null, null, null];

      let vmap: VariableMap;
      if (selectedVariable == null) {
        vmap = fullVariableMap;
      } else {
        vmap = { [selectedVariable]: fullVariableMap[selectedVariable] };
      }

      // !! be carefull when changing to not break copying (otherwise fullVariableMap gets affected)
      vmap = { ...vmap };
      for (let variable of Object.keys(vmap)) {
        vmap[variable] = { ...vmap[variable] };
      }

      // we use a separate variableMap called showValues that tells Document what annotations
      // to show. These are the same for "span" variables, but for "relation"
      // variables we want to only show the annotations
      // that are valid options for the relation codes
      let showValues: VariableMap;
      let variableType: VariableType = "span";

      if (selectedVariable !== undefined && fullVariableMap[selectedVariable].type === "relation") {
        variableType = "relation";
        showValues = getRelationShowValues(vmap, fullVariableMap, selectedVariable);
      } else {
        showValues = vmap;
      }

      return [vmap, showValues, variableType];
    }, [fullVariableMap, selectedVariable]);

  if (!selectedVariable) return [null, fullVariableMap, null, null, variableType];
  return [variableMap?.[selectedVariable] || null, fullVariableMap, variableMap, showValues, variableType];
}

const getRelationShowValues = (vmap: VariableMap, fullVariableMap: VariableMap, selectedVariable: string) => {
  let showValues: VariableMap = { [selectedVariable]: vmap[selectedVariable] };
  let valuemap: VariableValueMap | null = {};

  const variable = fullVariableMap[selectedVariable];
  if (variable.type !== "relation") return showValues;

  for (let relation of variable.relations || []) {
    if (!relation.from || !relation.to) {
      // if any relation doesn't specify from or to, we need to show everything
      showValues = fullVariableMap;
      valuemap = null;
      break;
    }

    const relations: CodeRelation[] = [];
    if (relation.from) relations.push(relation.from);
    if (relation.to) relations.push(relation.to);

    for (let cr of relations) {
      if (!valuemap[cr.variable]) valuemap[cr.variable] = {};
      const values = cr.values || Object.keys(fullVariableMap[cr.variable].codeMap);
      for (let v of values) valuemap[cr.variable][v] = true;
    }

    for (let relationValue of relation.codes) {
      if (!valuemap[selectedVariable]) valuemap[selectedVariable] = {};
      valuemap[selectedVariable][relationValue.code] = true;
    }
  }

  if (valuemap) {
    for (let variable of Object.keys(valuemap)) {
      showValues[variable] = { ...fullVariableMap[variable], codeMap: {} };
      for (let value of Object.keys(valuemap[variable])) {
        showValues[variable].codeMap[value] = fullVariableMap[variable]?.codeMap[value];
      }
    }
  }

  return showValues;
};

/**
 * If variable of type relation, prepare efficient lookup for
 * valid from/to annotations
 */
function getValidRelationCodes(relations: AnnotationRelation[], codeMap: CodeMap) {
  if (!relations) return [null, null];
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
