import { Branching, CodebookNode, Layouts, UpdateData, UpdateTrigger } from "@/app/types";

// UpdateData contains all the information needed to perform updates to the JobManagerState,
// such as the raw codebook nodes, layouts, branching rules, and update triggers.

export function computeUpdateData(nodes: CodebookNode[]): UpdateData {
  return {
    triggers: computeUpdateTriggers(nodes),
    nodeMap: computeNodeMap(nodes),
    branching: computeBranching(nodes),
  };
}

function computeUpdateTriggers(nodes: CodebookNode[]): UpdateTrigger[] {
  const nodeLookup: Record<string, CodebookNode> = {};
  for (const node of nodes) {
    nodeLookup[node.name] = node;
  }

  const updateTriggers: UpdateTrigger[] = [];

  for (const node of nodes) {
    for (let { property, dataIndicators } of node.dependencies) {
      for (let dataIndicator of dataIndicators) {
        const triggerType = dataIndicator.type;
        let triggerId: number | null = null;
        let triggerPosition: number | null = null;

        if (triggerType === "variable") {
          // If the data indicator is a variable name, we look up the variable and get its ID and position
          const triggerNode = nodeLookup[dataIndicator.variableName];
          triggerId = triggerNode.id;
          triggerPosition = triggerNode.globalPosition;
        } else {
          // If the data indicator is a phase property (like a unit), we look up the phase ID and starting position
          triggerId = node.phaseId;
          triggerPosition = nodeLookup[node.phaseId].globalPosition;
        }

        updateTriggers.push({
          triggerType,
          triggerId,
          triggerPosition,
          updateId: node.id,
          updatePosition: node.globalPosition,
          updateProperty: property,
        });
      }
    }
  }

  // sorting should be redundant, because codebooknodes are already sorted by global position,
  return updateTriggers.sort((a, b) => {
    return a.updatePosition - b.updatePosition;
  });
}

function computeNodeMap(nodes: CodebookNode[]): Record<number, CodebookNode> {
  const nodeMap: Record<number, CodebookNode> = {};
  for (const node of nodes) {
    nodeMap[node.id] = node;
  }
  return nodeMap;
}

function computeLayouts(nodes: CodebookNode[]): Layouts {
  const layouts: Layouts = {};
  for (let node of nodes) {
    if ("layout" in node.data && node.data.layout) {
      // if a node has a layout, we add it to the layouts object
      layouts[node.id] = node.data.layout;
    }
  }
  return layouts;
}

function computeBranching(nodes: CodebookNode[]): Branching {
  const branching: Branching = {};
  for (let node of nodes) {
    if ("condition" in node.data && node.data.condition) {
      // if a node has a condition, we add a branching rule. The condition is a js script that evaluates to a boolean.
      // the dependencies are the variables used in the condition, and the skips array indices which variables to skip if the condition is true
      branching[node.id] = {
        condition: node.data.condition,
        skips: node.children,
      };
    }
  }
  return branching;
}
