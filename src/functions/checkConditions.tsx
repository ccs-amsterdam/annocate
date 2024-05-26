import {
  RawUnit,
  ConditionReport,
  Annotation,
  Status,
  ConditionalAction,
  UnitType,
  UnitStatus,
  Conditional,
  AnnotationLibrary,
} from "@/app/types";

/**
 * If unit.conditionals exists, check whether an annotation satistfies the conditions.
 *
 * Note that for applications in which the conditionals should be secret (i.e. test unit)
 * this local version should (ideally) not be used, because it requires the conditionals
 * to be included in the unit, which users will be able to see (if they know how to).
 *
 * When using the python backend, the conditionals are checked server-side. The main reason
 * for including this client-side version is for demoing and testing with the R backend.
 */
export default function checkConditions(annotationLibrary: AnnotationLibrary): ConditionReport {
  const { type, status, conditionals } = annotationLibrary;
  const annotations = Object.values(annotationLibrary.annotations);

  const cr: ConditionReport = { evaluation: {}, damage: {} };
  if (type !== "train" && type !== "test") return cr;
  if (!conditionals) return cr;

  let damage = 0;

  // Default actions are determined by unit type
  let defaultSuccessAction: ConditionalAction = "applaud";
  let defaultFailAction: ConditionalAction = "retry";
  let defaultMessage = undefined;
  let defaultDamage = 0;

  if (type === "train") {
    defaultSuccessAction = "applaud";
    defaultFailAction = "retry";
    defaultMessage =
      "### Please retry.\n\nThis is a **training** unit, and the answer you gave was incorrect. \nPlease have another look, and select a different answer";
  }
  // if (type === "pre") {
  //   defaultFailAction = "block";
  //   defaultMessage =
  //     "### Thank you for participating.\n\nBased on your answer for this question we determined that you do not meet the qualifications for this coding job.\nWe sincerely thank you for your time.";
  // }
  if (type === "test") {
    defaultDamage = 10;
  }

  for (let conditional of conditionals) {
    // only check conditions for variables that have been coded
    // (if unit is done, all variables are assumed to have been coded)
    if (!cr.evaluation[conditional.variable])
      cr.evaluation[conditional.variable] = {
        action: conditional.onSuccess || defaultSuccessAction,
        message: conditional.message || defaultMessage,
      };
    let variableCoded = status === "DONE";
    let success = true;
    let submessages: string[] = [];

    // Next to whether all conditions are met, we need to check whether all annotations
    // match a condition. We only do this for variables for which conditions have been specified
    let validAnnotation: { [annotationI: number]: boolean } = {};

    conditionloop: for (let c of conditional.conditions) {
      for (let i = 0; i < annotations.length; i++) {
        const a = annotations[i];
        if (conditional.variable !== a.variable) continue;
        if (!validAnnotation[i]) validAnnotation[i] = false;
        variableCoded = true;

        const field = "field" in a ? a.field : undefined;
        const offset = "offset" in a ? a.offset : undefined;
        const length = "length" in a ? a.length : undefined;
        if ("field" in c && c.field != null && c.field !== field) continue;
        if ("offset" in c && c.offset != null && c.offset !== offset) continue;
        if ("length" in c && c.length != null && c.length !== length) continue;

        const op = c.operator || "==";

        let hasMatch = false;
        if (a.value) {
          if (op === "==" && a.value === c.value) hasMatch = true;
          if (op === "<=" && a.value <= c.value) hasMatch = true;
          if (op === "<" && a.value < c.value) hasMatch = true;
          if (op === ">=" && a.value >= c.value) hasMatch = true;
          if (op === ">" && a.value > c.value) hasMatch = true;
          if (op === "!=" && a.value !== c.value) hasMatch = true;
        }
        if (hasMatch) {
          validAnnotation[i] = true;
          continue conditionloop;
        }
      }
      if (!variableCoded) continue;

      // arriving here indicates that condition failed
      success = false;
      damage += c.damage ?? 0;
      if (c.submessage) submessages.push(c.submessage);
    }

    // This means that there were annotations that did not match a condition
    const validAnnotationI = Object.keys(validAnnotation).filter((i: string) => validAnnotation[Number(i)]);
    const invalidAnnotationI = Object.keys(validAnnotation).filter((i: string) => !validAnnotation[Number(i)]);
    if (invalidAnnotationI.length > 0) success = false;

    if (success) {
      cr.evaluation[conditional.variable].action = conditional.onSuccess || defaultSuccessAction;
    } else {
      cr.evaluation[conditional.variable].action = conditional.onFail || defaultFailAction;
      cr.evaluation[conditional.variable].message = conditional.message || defaultMessage;
      cr.evaluation[conditional.variable].submessages = submessages;

      // add correct and incorrect annotations
      cr.evaluation[conditional.variable].correct = validAnnotationI.map((i: string) => annotations[Number(i)]);
      cr.evaluation[conditional.variable].incorrect = invalidAnnotationI.map((i: string) => annotations[Number(i)]);

      damage += conditional.damage ?? defaultDamage;
    }
  }
  if (damage) {
    cr.damage.damage = damage;
    alert(
      `This answer gave you ${damage} damage!\n\nCoders won't see this message if the job is hosted on an AnnoTinder (Python) server.`,
    );
  }

  return cr;
}
