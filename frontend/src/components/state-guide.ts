interface StateGuideDefinition {
  name: string;
  stage: string;
  tagline: string;
  description: string;
}

const STATE_GUIDE_STATES: StateGuideDefinition[] = [
  {
    name: "Backlog",
    stage: "backlog",
    tagline: "parked work",
    description: "Backlog stays visible on the board, but agents do not treat it as ready to pick up yet.",
  },
  {
    name: "Todo",
    stage: "todo",
    tagline: "ready next",
    description: "Todo means the issue is eligible for the queue and can be selected for the next agent run.",
  },
  {
    name: "In Progress",
    stage: "in_progress",
    tagline: "active queue",
    description: "In Progress is active work Risoluto watches closely and may continue dispatching from.",
  },
  {
    name: "In Review",
    stage: "in_review",
    tagline: "human gate",
    description: "In Review is a checkpoint stage where work waits for approval or feedback before it can finish.",
  },
  {
    name: "Done",
    stage: "done",
    tagline: "terminal success",
    description: "Done is a terminal state that removes the issue from active work and records a successful outcome.",
  },
  {
    name: "Canceled",
    stage: "canceled",
    tagline: "terminal stop",
    description: "Canceled is a terminal state that stops further agent action and closes the issue out of the queue.",
  },
];

export function getStageDescription(stageKey: string): string | undefined {
  const lower = stageKey.toLowerCase();
  const normalized = lower === "cancelled" ? "canceled" : lower;
  return STATE_GUIDE_STATES.find((state) => state.stage === normalized)?.description;
}
