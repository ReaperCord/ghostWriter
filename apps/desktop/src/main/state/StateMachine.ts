import { AppState, StateEvent } from "./StateEvents";

export class StateMachine {
  private state: AppState = "CAPTURING";

  getState(): AppState {
    return this.state;
  }

  dispatch(event: StateEvent): AppState {
    switch (this.state) {
      case "IDLE":
        if (event.type === "START_MEETING") {
          this.state = "CAPTURING";
        }
        break;

      case "CAPTURING":
        if (event.type === "STOP_MEETING") {
          this.state = "REVIEW";
        }
        break;

      case "REVIEW":
        if (
          event.type === "SAVE_NOTES" ||
          event.type === "DISCARD_NOTES"
        ) {
          this.state = "IDLE";
        }
        break;
    }

    return this.state;
  }
}
