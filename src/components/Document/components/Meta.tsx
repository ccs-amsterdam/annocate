import { MetaField } from "@/app/types";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";

interface MetaProps {
  metaFields: MetaField[];
}

const Meta = ({ metaFields }: MetaProps) => {
  const rows = () => {
    return metaFields.map((row) => {
      let label = row.label ?? row.name ?? "";
      label = String(label);

      return (
        <TableRow
          key={label}
          style={{
            lineHeight: "1.2",
            fontSize: `1.2em`,
          }}
        >
          <TableCell
            width={1}
            style={{
              borderTop: "none",
              textAlign: "right",
              color: "hsl(var(--primary-foreground))",
            }}
          >
            <b>{label}</b>
          </TableCell>
          <TableCell style={row.style}>{row.value}</TableCell>
        </TableRow>
      );
    });
  };

  if (metaFields.length === 0) return null;

  return (
    <div
      key="meta"
      style={{
        width: "calc(100% - 20px)",
        display: "flex",
        marginTop: "5px",
        marginBottom: "10px",
        fontFamily: "Garamond, serif",
        //boxShadow: "3px 4px 10px grey",
      }}
    >
      <div style={{ margin: "auto" }}>
        <Table>
          <TableBody>{rows()}</TableBody>
        </Table>
      </div>
    </div>
  );
};

export default Meta;
