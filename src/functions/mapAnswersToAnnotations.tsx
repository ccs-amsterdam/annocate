// There is a direct mapping between answers to questions and annotations.
// A question answer has the whole unit as a span (field, offset, length)
// The question name is the variable and the answer the value.
// For a simple question this is a single annotations. but there are some special cases:
// -- scale questions can have multiple items. In the annotations the variable names then become [question name].[item]
//    and in the question answers this is represented as an array of objects with items and values [{item, value}]
// -- questions where multiple codes can be selected correspond to multiple annotations as usual,
//    and in the question answers this is represented as an array of objects

import { Answer, AnswerItem, Question, Annotation, Unit, QuestionItem, AnnotationLibrary } from "@/app/types";
import { z } from "zod";
import { CodebookUnionTypeSchema } from "@/app/api/projects/[projectId]/codebooks/schemas";
import cuid from "cuid";
import AnnotationManager from "./AnnotationManager";
type Variable = z.infer<typeof CodebookUnionTypeSchema>;

export const getAnswersFromAnnotations = (unit: Unit, questions: Variable[]): Answer[] => {
  const answers = [];
  if (!unit.unit.annotations) unit.unit.annotations = [];
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    //const answer = createAnswer(tokens, questions[i]);
    const answer: Answer = { variable: q.name, items: null };

    if (q.fields) answer.field = q.fields.join("+");
    // if (q.annotation) {
    //   answer.field = q.annotation.field;
    //   answer.offset = q.annotation.offset;
    //   answer.length = q.annotation.length;
    // }

    answer.items = getAnswerValues(unit.unit.annotations, answer, q);
    answers.push(answer);
  }
  return answers;
};

const getAnswerValues = (annotations: Annotation[], answer: Answer, question: Variable): AnswerItem[] => {
  // loops over all annotations (in unit) to find the ones that match the question annotation
  // (i.e. that have the same variable, field, offset and length)
  // return an array of objects {item, values} that should match question.items (also see AnswerField.js)

  // if question doesn't have items, use an array of length one with an empty string.
  // this keeps things consistent. note that if name is empty, the answer will be mapped to
  // an annotation with just the variable. i.e. not [variable].[name]
  const items = "items" in question && question.items !== undefined ? question.items : [{ name: "" }];

  return items.map((item: QuestionItem) => {
    const itemname = typeof item === "string" ? item : item?.name; // item can be a string or {name, label}
    const values: (string | number)[] = [];
    for (let annotation of annotations || []) {
      if (annotation.code && isMatch(annotation, answer, itemname)) {
        values.push(annotation.code);
      }
    }
    return { item: itemname, optional: item.optional, values: values };
  });
};

const createVariable = (variable: string, item: string) => {
  return item === "" || item == null ? variable : variable + "." + item;
};

const isMatch = (annotation: Annotation, answer: Answer, item = "") => {
  if (annotation.type === "unit") return annotation.variable === createVariable(answer.variable, item);

  if (annotation.type === "field")
    return annotation.variable === createVariable(answer.variable, item) && annotation.field === answer.field;

  if (annotation.type === "span")
    return (
      annotation.variable === createVariable(answer.variable, item) &&
      annotation.field === answer.field &&
      annotation.offset === answer.offset &&
      annotation.length === answer.length
    );
};

export const addAnnotationsFromAnswer = (answer: Answer, annotations: Annotation[] | undefined): Annotation[] => {
  // transforms answers to annotations, and either replaces existing annotations or
  // creates new ones.
  if (!annotations) annotations = [];

  const valueMap = answer?.items?.reduce((obj: any, valueObj: AnswerItem) => {
    // create a map of answers[item][value]
    if (obj[valueObj.item] === undefined) obj[valueObj.item] = {};
    for (let value of valueObj.values) obj[valueObj.item][value] = { exists: false, valueObj };
    return obj;
  }, {});

  for (let item of Object.keys(valueMap)) {
    for (let annotation of annotations) {
      if (annotation.code && isMatch(annotation, answer, item)) {
        // if it is a match, three things can happen.
        // case 1: the annotation value does occur in the answer value, in which case we leave it alone
        // case 2: the annotation value does not occur in the answer values, in which case we delete it
        // case 3: an answer value does not have an annotation, in which case we add it
        if (valueMap[item][annotation.code] !== undefined) {
          // case 1
          valueMap[item][annotation.code].exists = true; // keeping track for case 3
        } else {
          // case 2
          annotation.code = undefined;
        }
      }
    }
  }

  for (let item of Object.keys(valueMap)) {
    for (let value of Object.keys(valueMap[item])) {
      if (valueMap[item][value].exists) continue;

      // case 3
      const variable = createVariable(answer.variable, item);

      let annotation: Annotation = {
        id: cuid(),
        created: new Date().toISOString(),
        type: "unit",
        variable,
        code: value,
        value: value,
      };
      if ("field" in answer && answer.field) {
        annotation = { ...annotation, type: "field", field: answer.field };
      }
      if ("offset" in answer && answer.offset && answer.field && answer.length) {
        annotation = { ...annotation, type: "span", field: answer.field, offset: answer.offset, length: answer.length };

        const valueObj = valueMap[item][value].valueObj;
        if (valueObj.questionTime) annotation.time_question = valueObj.questionTime;
        if (valueObj.answerTime) annotation.time_answer = valueObj.answerTime;
        annotations.push(annotation);
      }
    }
  }

  return annotations.filter((a) => a.code !== undefined);
};
