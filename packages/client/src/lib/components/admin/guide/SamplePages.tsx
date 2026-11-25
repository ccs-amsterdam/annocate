import { Fragment, type ReactNode } from "react";
import { ArrowRight, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ResearcherApi } from "../../../api/httpResearcherApi";
import { DEFAULT_CODER_SORT } from "../../../admin/codersTable";
import { codeLinkUrl } from "../../../session/coderSession";
import { AddCodersForm } from "../coders/AddCodersForm";
import { CodersTable } from "../coders/CodersTable";
import { DesignToDeploy } from "../deploy/DesignToDeploy";
import { UnitsToDeploy } from "../deploy/UnitsToDeploy";
import { LinkTable } from "../links/LinkTable";
import { AgreementView } from "../results/AgreementView";
import { designLabels } from "../results/designLabels";
import { QuestionsView } from "../results/QuestionsView";
import { STUDY_PAGES } from "../study/studyPages";
import { UnitsPage } from "../units/UnitsPage";
import type { SamplePage } from "./parseGuide";
import { SAMPLE_AGREEMENT, SAMPLE_ANSWERS, SAMPLE_CODERS, SAMPLE_LINKS } from "./sampleData";
import { sampleDesign } from "./sampleStudy";

// The guide's pictures of the study's pages (docs/client.md §7, "Guide"):
// the real page, or its parts that take plain data, with the sample's.
// `pictures.ts` has the size each is drawn at.

const noop = () => {};

/** A page's part under its title, as the page has it. */
function Titled({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-lg font-medium">{title}</h2>
      {children}
    </div>
  );
}

const MAP_STEPS = ["Design", "Units", "Coders", "Deploy", "Results"];

/** A study in five steps: the pages they are done on, in order. */
function StudyMap() {
  const steps = MAP_STEPS.map((id) => STUDY_PAGES.find((page) => page.id === id)!);
  return (
    <div className="flex h-full items-center justify-between gap-2">
      {steps.map(({ id, label, icon: Icon }, i) => (
        <Fragment key={id}>
          {i > 0 && <ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground" />}
          <div className="flex flex-1 flex-col items-center gap-2 rounded-xl border border-border bg-card px-2 py-4 shadow-xs">
            <Icon className="h-6 w-6 text-primary" />
            <span className="text-sm font-medium">
              {i + 1}. {label}
            </span>
          </div>
        </Fragment>
      ))}
    </div>
  );
}

function SampleAddCoders({ client }: { client: ResearcherApi }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-xs">
      <Titled title="Add coders">
        <AddCodersForm client={client} existing={[]} />
      </Titled>
    </div>
  );
}

function SampleCoders() {
  return (
    <Titled title="Coders">
      <CodersTable kind="expert" coders={SAMPLE_CODERS} sort={DEFAULT_CODER_SORT} onSort={noop} actions={() => null} />
    </Titled>
  );
}

/** A later deploy, as the Deploy page asks it: the design's draft with what changed, and the draft units. */
function SampleDeploy() {
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5">
      <div>
        <h2 className="text-lg font-medium">Deploy</h2>
        <p className="text-sm text-muted-foreground">
          Coders use v1 now. Everything you edit is a draft until you deploy it; what you leave out stays a draft.
        </p>
      </div>
      <div className="space-y-4 text-sm">
        <DesignToDeploy
          versionNumber={2}
          liveNumber={1}
          included
          onIncludedChange={noop}
          changes={[{ kind: "added", name: "actor", type: "question", parent: "Politics only" }]}
          valueWarnings={[]}
          note="Added the main actor, for political headlines"
          onNoteChange={noop}
        />
        <UnitsToDeploy
          changes={{ added: 1, changed: 0, removed: 0, sets: true }}
          changed
          firstDeploy={false}
          included
          onIncludedChange={noop}
        />
      </div>
      <div>
        <Button>
          <Rocket className="mr-1.5 h-4 w-4" /> Deploy
        </Button>
      </div>
    </div>
  );
}

function SampleLinks({ client }: { client: ResearcherApi }) {
  return (
    <Titled title="Links">
      <LinkTable client={client} links={SAMPLE_LINKS} linkOf={(link) => codeLinkUrl("samplestudy1", link.secret)} />
    </Titled>
  );
}

const labels = designLabels(sampleDesign());

function SampleResults() {
  return (
    <div className="flex flex-col gap-4">
      <QuestionsView questions={SAMPLE_ANSWERS} labels={labels} />
      <Titled title="Agreement">
        <AgreementView questions={SAMPLE_AGREEMENT} labels={labels} />
      </Titled>
    </div>
  );
}

/** The picture of a page (or of a study's five steps), with the sample's API. */
export function SamplePagePicture({ show, client }: { show: SamplePage; client: ResearcherApi }) {
  if (show === "map") return <StudyMap />;
  if (show === "units") return <UnitsPage client={client} onOpenCoders={noop} />;
  if (show === "add-coders") return <SampleAddCoders client={client} />;
  if (show === "coders") return <SampleCoders />;
  if (show === "deploy") return <SampleDeploy />;
  if (show === "links") return <SampleLinks client={client} />;
  return <SampleResults />;
}
