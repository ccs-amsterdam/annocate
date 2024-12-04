"use client";;
import { use } from "react";
import { HelpDrawer } from "@/components/Common/HelpDrawer";
import { Database } from "lucide-react";
import { UnitsTable } from "./UnitsTable";
import { CreateUnitsButton } from "@/components/Forms/unitForms";

export default function Users(props: { params: Promise<{ projectId: number }> }) {
  const params = use(props.params);
  return (
    <div>
      <div className="mt-6 lg:col-span-2">
        <div className="mt-3 px-3">
          <CreateUnitsButton projectId={params.projectId} />
          <UnitsTable projectId={params.projectId} />
        </div>
      </div>
      <Help />
    </div>
  );
}

// function SelectUnitset({ projectId }: { projectId: number }) {
//   const { data: unitsets, isLoading } = useUnitsets(projectId, {});
//   const router = useRouter();

//   const setsByLayout = useMemo(() => {
//     const setsByLayout: Record<string, { id: number; name: string }[]> = {};
//     unitsets?.forEach((set) => {
//       if (!setsByLayout[set.layout]) setsByLayout[set.layout] = [];
//       setsByLayout[set.layout].push(set);
//     });
//     return setsByLayout;
//   }, [unitsets]);

//   function onSelect(set: { id: number; name: string }) {
//     router.push(`/projects/${projectId}/units/unitsets/${set.id}`);
//   }

//   return (
//     <Command>
//       <CommandInput placeholder="Select unit set" />
//       <CommandList>
//         {Object.entries(setsByLayout).map(([layout, sets]) => {
//           return (
//             <CommandGroup key={layout}>
//               <div className="flex items-center gap-3 py-1 ">
//                 <Palette size={24} />
//                 <h4 className="text-base font-semibold">{layout}</h4>
//               </div>
//               {sets.map((set) => {
//                 return (
//                   <CommandItem
//                     key={set.name}
//                     value={set.name}
//                     className=" cursor-pointer pl-9 hover:bg-accent"
//                     onSelect={() => onSelect(set)}
//                   >
//                     {set.name}
//                   </CommandItem>
//                 );
//               })}
//             </CommandGroup>
//           );
//         })}
//       </CommandList>
//     </Command>
//   );
// }

// function CreateLayout({ projectId }: { projectId: number }) {
//   const [newLayoutName, setNewLayoutName] = useState("");
//   const { create } = useCreateEmptyLayout(projectId);
//   const router = useRouter();

//   return (
//     <div className="flex items-center gap-2">
//       <Input placeholder="Create new layout" value={newLayoutName} onChange={(e) => setNewLayoutName(e.target.value)} />
//       <Button
//         disabled={!newLayoutName}
//         className="ml-auto flex  w-min gap-1"
//         variant="secondary"
//         onClick={() =>
//           create(newLayoutName).then(({ id }) => {
//             router.push(`/projects/${projectId}/units/layouts/${id}`);
//           })
//         }
//       >
//         <Plus />
//       </Button>
//     </div>
//   );
// }

function Help() {
  return (
    <HelpDrawer title={"Upload units"} className="fixed bottom-5 right-5">
      <p>Blabla here you can upload units blabla</p>
    </HelpDrawer>
  );
}
