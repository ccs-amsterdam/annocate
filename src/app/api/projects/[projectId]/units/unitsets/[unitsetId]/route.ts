// export async function GET(req: NextRequest, { params }: { params: { projectId: number; unitsetId: number } }) {
//   const { projectId } = params;
//   return createGet({
//     selectFunction: async (email, urlParams) => {
//       const [unitset] = await db
//         .select({
//           id: unitsets.id,
//           name: unitsets.name,
//           units: count(unitsetUnits.unitId),
//           columns: sql<string>`jsonb_object_keys(${units.data})`.as("columns"),
//         })
//         .from(unitsetUnits)
//         .leftJoin(units, eq(unitsetUnits.unitId, units.id))
//         .leftJoin(unitsets, eq(unitsetUnits.unitsetId, unitsets.id))
//         .where(and(eq(projects.id, projectId), eq(unitsetUnits.unitsetId, params.unitsetId)));
//       console.log(unitset);
//       return unitset;
//     },
//     req,
//     responseSchema: UnitsetResponseSchema,
//     projectId: params.projectId,
//     authorizeFunction: async (auth, params) => {
//       if (!hasMinProjectRole(auth.projectRole, "manager")) return { message: "Unauthorized" };
//     },
//   });
// }
