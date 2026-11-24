import { useRef, type ComponentProps, type ReactNode } from "react";
import type { RelationType, VariableValue } from "@annotinder/contracts";
import { RelationAnnotationProvider } from "../../context/RelationAnnotationContext";
import { SpanAnnotationProvider } from "../../context/SpanAnnotationContext";
import type { StudyManagerSnapshot } from "../../studyManager/types";
import { DockedAnswerPane } from "../DockedAnswerPane";
import { RelationArrows } from "../RelationArrows";
import { SwipeCard, SwipeSurface } from "../SwipeCard";
import { UnitFields } from "../UnitFields";
import { SwipeArea } from "./SwipeArea";
import type { CurrentQuestion } from "./useCurrentQuestion";
import type { useUnitSlide } from "./useUnitSlide";

interface UnitQuestionLayoutProps {
  question: CurrentQuestion;
  unit: NonNullable<CurrentQuestion["unit"]>;
  snapshot: StudyManagerSnapshot;
  /** The slide the unit comes in with (`useUnitSlide`). */
  unitSlide: ReturnType<typeof useUnitSlide>;
  /** The slide the question comes in with. */
  slideClass: string;
  onAnswer: (value: VariableValue) => void;
  /** The question with its answer field. */
  children: ReactNode;
}

/**
 * A question of a unit loop: the unit scrolls above and the question is
 * docked below it, near the thumbs (`DockedAnswerPane`). Around both: the
 * spans and relations the coder marks in the unit, and the swipe.
 */
export function UnitQuestionLayout({
  question,
  unit,
  snapshot,
  unitSlide,
  slideClass,
  onAnswer,
  children,
}: UnitQuestionLayoutProps) {
  return (
    <UnitAnnotations question={question} snapshot={snapshot}>
      <SwipeArea question={question} onAnswer={onAnswer}>
        {/* On a tall desktop screen the unit and its answers have a max height and are centred, so the answers stay near the unit. */}
        <div className="flex min-h-0 flex-1 flex-col @5xl:p-6">
          {/* A size container: the answer pane's max height is a share of this area (cqh). */}
          <SwipeSurface className="[container-type:size] relative flex w-full flex-1 flex-col overflow-hidden @5xl:mx-auto @5xl:my-auto @5xl:max-h-[56rem] @5xl:max-w-3xl @5xl:rounded-2xl @5xl:border @5xl:border-border @5xl:bg-card @5xl:shadow-sm">
            <ScrollingUnit question={question} unit={unit} unitSlide={unitSlide} />
            <DockedAnswerPane>
              <div key={question.key} className={slideClass}>
                {children}
              </div>
            </DockedAnswerPane>
          </SwipeSurface>
        </div>
      </SwipeArea>
    </UnitAnnotations>
  );
}

/** The spans and relations marked in the unit: the state of a span and of a relation question, around the unit and the answer pane. */
function UnitAnnotations({
  question,
  snapshot,
  children,
}: Pick<UnitQuestionLayoutProps, "question" | "snapshot" | "children">) {
  const { item, spanVariable, relationVariable } = question;
  const unitId = snapshot.currentUnit!.id;
  const answer = snapshot.currentUnitVariables?.[item.name];
  return (
    <SpanAnnotationProvider
      key={`unit-${unitId}`}
      fields={spanVariable?.fields ?? []}
      options={spanVariable?.options ?? []}
      defaultSelectionMode={spanVariable?.selectionMode ?? "word"}
      allowGaps={spanVariable?.gaps ?? false}
      initialSpans={spanVariable ? answer?.spans : undefined}
      variableName={item.name}
      allowComments={Boolean(spanVariable && item.comments)}
    >
      <MaybeRelations
        key={`relations-${unitId}-${item.name}`}
        variable={relationVariable}
        loopVariables={snapshot.currentLoopVariables}
        unitVariables={snapshot.currentUnitVariables ?? undefined}
        initialRelations={relationVariable ? answer?.relations : undefined}
      >
        {children}
      </MaybeRelations>
    </SpanAnnotationProvider>
  );
}

/** The relation question's state, while one is on screen. */
function MaybeRelations({
  variable,
  children,
  ...props
}: Omit<ComponentProps<typeof RelationAnnotationProvider>, "variable"> & { variable: RelationType | null }) {
  if (!variable) return <>{children}</>;
  return (
    <RelationAnnotationProvider variable={variable} {...props}>
      {children}
    </RelationAnnotationProvider>
  );
}

/** The unit, scrolling; with a relation question's arrows over it. */
function ScrollingUnit({
  question,
  unit,
  unitSlide,
}: Pick<UnitQuestionLayoutProps, "question" | "unit" | "unitSlide">) {
  const { relationVariable } = question;
  /** The unit's content: relation arrows are positioned against it. */
  const content = useRef<HTMLDivElement>(null);
  return (
    // Stable gutter: a scrollbar appearing doesn't move the text.
    <div
      data-key-scroll=""
      className="min-h-[100px] flex-1 subtle-scrollbar [scrollbar-gutter:stable] overflow-x-hidden overflow-y-auto p-3 sm:p-5"
    >
      <div
        key={unitSlide.key}
        ref={content}
        className={`relative mx-auto max-w-2xl ${relationVariable ? "pt-12" : ""} ${unitSlide.slideClass}`}
        onAnimationEnd={unitSlide.onAnimationEnd}
      >
        {relationVariable && <RelationArrows containerRef={content} />}
        <SwipeableUnit question={question}>
          <UnitFields
            layout={unit.layout}
            rendered={unit.rendered}
            focus={question.focus}
            focusDim={question.focusDim}
          />
        </SwipeableUnit>
      </div>
    </div>
  );
}

/** For a swipe question the unit moves when swiped; on a card only if the question asks for one (no layout jump otherwise). */
function SwipeableUnit({ question, children }: { question: CurrentQuestion; children: ReactNode }) {
  if (!question.swipeVariable) return <>{children}</>;
  const cardClass = question.swipeVariable.card
    ? "rounded-2xl border border-border bg-card p-4 shadow-md sm:p-5"
    : "rounded-2xl bg-background";
  return (
    <SwipeCard key={question.key} className={cardClass}>
      {children}
    </SwipeCard>
  );
}
