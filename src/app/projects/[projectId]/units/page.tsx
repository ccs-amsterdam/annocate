"use client";
import { HelpDrawer } from "@/components/Common/HelpDrawer";
import { Database } from "lucide-react";
import { UnitsTable } from "./UnitsTable";

export default function Users({ params }: { params: { projectId: number } }) {
  return (
    <div>
      <div className="mt-6 lg:col-span-2">
        <div className="flex items-center gap-3 rounded-md bg-secondary p-4 text-secondary-foreground">
          <Database />
          <h3 className="text-lg font-semibold">Data</h3>
        </div>
        <div className="mt-3 px-3 lg:px-0">
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
    <HelpDrawer className="fixed bottom-5 right-5">
      <h3 className="mb-4 ">Manage Units</h3>
      <p>
        Here you manage your coding units. You can upload <b>Unit data</b> and design <b>Layouts</b> for displaying
        units to coders.
      </p>
      <p>
        A simple project might just have a single collection of units and a single layout, but you can have multiple
        collections and layouts. This way, you can then make different layouts for different collections, or even
        different layouts for the same collection (e.g., for experiments)
      </p>
    </HelpDrawer>
  );
}
