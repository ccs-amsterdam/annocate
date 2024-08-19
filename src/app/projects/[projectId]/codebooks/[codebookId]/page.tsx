"use client";
import { useCodebook } from "@/app/api/projects/[projectId]/codebooks/query";
import { CodebookSchema } from "@/app/api/projects/[projectId]/codebooks/schemas";
import { useUnit } from "@/components/AnnotatorProvider/AnnotatorProvider";
import { Preview } from "@/components/Common/Preview";
import { UpdateCodebook } from "@/components/Forms/codebookForms";
import { Loading } from "@/components/ui/loader";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

type Codebook = z.infer<typeof CodebookSchema>;

export default function Codebook({ params }: { params: { projectId: number; codebookId: number } }) {
  const [preview, setPreview] = useState<Codebook | undefined>();
  const { data: codebook, isLoading } = useCodebook(params.projectId, params.codebookId);

  const confirmUpdate = useCallback(() => {
    toast.success("Updated codebook");
  }, []);

  if (isLoading) return <Loading />;
  if (!codebook) return <div className="ml-10 mt-10">Codebook not found</div>;

  return (
    <div className="mx-auto  grid  grid-cols-1 gap-3 xl:grid-cols-[auto,1fr]">
      <div className="mx-auto w-[600px] max-w-[95vw] overflow-auto py-6 xl:max-h-[calc(100vh-var(--header-height))]">
        <div className="h-20"></div>
        <UpdateCodebook
          projectId={params.projectId}
          current={codebook}
          setPreview={setPreview}
          afterSubmit={confirmUpdate}
        />
      </div>
      <div className="relative flex justify-center overflow-auto xl:h-[calc(100vh-var(--header-height))] ">
        {/* <PreviewCodebook projectId={projectId} preview={preview} /> */}
        {preview ? <Preview projectId={params.projectId} codebook={preview} /> : <Loading />}
      </div>
    </div>
  );
}

// function PreviewCodebook({ projectId, preview }: { projectId: number; preview?: Codebook }) {
//   const { user } = useMiddlecat();
//   const [focus, setFocus] = useState(false);
//   const [size, setSize] = useLocalStorage("size", { width: 400, height: 500 });

//   const jobServer = useMemo(() => {
//     if (!preview) return null;
//     const unit = { ...rawPreviewUnit, unit: { ...rawPreviewUnit.unit, codebook: preview } };
//     return new JobServerPreview(preview, [unit]);
//   }, [projectId, user, preview]);

//   if (!jobServer) return null;

//   return (
//     <div className="flex w-full flex-col items-center">
//       <div className="mt-10 grid w-96 grid-cols-[4rem,1fr,4rem] gap-2">
//         <div>Width</div>
//         <Slider min={300} max={800} value={[size.width]} onValueChange={(width) => setSize({ ...size, width })} />
//         <div>{size.width} px</div>
//         <div>Height</div>
//         <Slider min={500} max={800} value={[size.height]} onValueChange={(height) => setSize({ ...size, height })} />
//         <div>{size.height} px</div>
//       </div>
//       <div
//         tabIndex={0}
//         className={`border-1 mt-10 rounded-lg  border-foreground/50 bg-foreground/50 p-1  ${focus ? " ring-4 ring-secondary ring-offset-2" : ""}`}
//         style={{ height: size.height + "px", width: size.width + "px" }}
//         onClick={(e) => {
//           e.currentTarget.focus();
//         }}
//         onFocus={() => setFocus(true)}
//         onBlur={() => setFocus(false)}
//       >
//         <UnitProvider jobServer={jobServer}>
//           <QuestionTask blockEvents={!focus} />
//           <PreviewAnnotations />
//         </UnitProvider>
//       </div>
//     </div>
//   );
// }

function PreviewAnnotations() {
  const { annotationLib } = useUnit();

  return (
    <div className="mt-6">
      {Object.values(annotationLib.annotations).map((a) => {
        return (
          <div key={a.id} className="text-sm">
            {a.variable} - {a.code}
          </div>
        );
      })}
    </div>
  );

  // return (
  //   <div>
  //     {annotationLib.map((annotation) => (
  //       <div key={annotation.id}>
  //         {annotation.type} - {annotation.value}
  //       </div>
  //     ))}
  //   </div>
  // );
}
