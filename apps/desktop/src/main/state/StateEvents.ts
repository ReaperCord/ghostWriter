export type AppState =
  | "IDLE"
  | "CAPTURING"
  | "REVIEW";

export type StateEvent =
  | { type: "START_MEETING" }
  | { type: "STOP_MEETING" }
  | { type: "SAVE_NOTES" }
  | { type: "DISCARD_NOTES" };
