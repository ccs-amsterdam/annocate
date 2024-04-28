import { useState } from "react";
import { FaKeyboard } from "react-icons/fa";

import { FullScreenNode } from "@/app/types";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";

interface AnnotateTaskManualProps {
  fullScreenNode: FullScreenNode;
}

const AnnotateTaskManual = ({ fullScreenNode }: AnnotateTaskManualProps) => {
  const [open, setOpen] = useState(false);

  return (
    <Dialog>
      <DialogTrigger>
        <FaKeyboard />
        Controls
      </DialogTrigger>
      <DialogContent>
        <div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead></TableHead>
                <TableHead>Keyboard</TableHead>
                <TableHead>Mouse</TableHead>
                <TableHead>Touchpad</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell>
                  <strong>Navigate</strong>
                </TableCell>
                <TableCell>
                  <i>Arrow keys</i>
                </TableCell>
                <TableCell></TableCell>
                <TableCell></TableCell>
              </TableRow>
              <TableRow>
                <TableCell>
                  <strong>Select words</strong>
                </TableCell>
                <TableCell>
                  <i>spacebar.</i> Hold to select mutiple
                </TableCell>
                <TableCell>
                  <i>Left-click.</i> Hold to select multiple
                </TableCell>
                <TableCell>
                  <i>tap</i> the start word, then tap the end word
                </TableCell>
              </TableRow>

              <TableRow>
                <TableCell>
                  <strong>
                    Select variable
                    <br />
                    (if multiple)
                  </strong>
                </TableCell>
                <TableCell>
                  Next with <i>tab</i>, previous with <i>shift+tab</i>
                </TableCell>
                <TableCell>Use the buttons</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>
                  <strong>Edit/remove code</strong>
                </TableCell>
                <TableCell>Select annotated words to overwrite or delete the code</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>
                  <strong>Finish unit</strong>
                </TableCell>
                <TableCell>
                  <i>ctrl+Enter</i> or <i>alt+Enter</i>
                </TableCell>
                <TableCell>Use the next unit button</TableCell>
              </TableRow>
              <br />

              <TableRow>
                <TableCell>
                  <strong>Edit mode</strong>
                </TableCell>
                <TableCell>
                  A job, or a specific variable in a job, can also be in <b>edit mode</b>
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell>
                  <strong>Edit mode: navigation</strong>
                </TableCell>
                <TableCell>
                  <i>Arrow keys</i> select last/next annotation
                </TableCell>
                <TableCell>Can only select existing annotations</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>
                  <strong>Edit mode: update/delete</strong>
                </TableCell>
                <TableCell>
                  Select a single token to get entire annotation, and update or delete this annotation
                </TableCell>
              </TableRow>
              {/* <TableRow>
              <TableCell>
                <strong>
                  Browse units
                  <br />
                  (if allowed)
                </strong>
              </TableCell>
              <TableCell>
                Press or hold <i>ctrl+Enter</i> (forward) or <i>ctrl+backspace</i> (backward)
              </TableCell>
              <TableCell>back and next buttons (top-left)</TableCell>
              <TableCell>back and next buttons (top-left)</TableCell>
            </TableRow> */}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableHead>
                  <strong>Quick keys</strong> <br />
                  in popup
                </TableHead>
                <TableHead>
                  <ul>
                    <li>
                      navigate buttons with <i>arrow keys</i>, select with <i>spacebar</i>
                    </li>
                    <li>
                      <i>text input</i> automatically opens dropdown{" "}
                    </li>
                    <li>
                      use <i>escape</i> to close popup
                    </li>
                    <li>
                      hold <i>ctrl</i> or <i>alt</i> to select multiple codes without closing the popup
                    </li>
                  </ul>
                </TableHead>
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AnnotateTaskManual;
