import { AppState, StateEvent } from "./StateEvents";

export class StateMachine {
  private state: AppState = "IDLE";

  getState(): AppState {
    return this.state;
  }

  dispatch(stateEvent: StateEvent): AppState {
    const previous = this.state;

    switch (this.state) {
      case "IDLE":
        if (stateEvent.type === "START_MEETING") {
          this.state = "CAPTURING";
        }
        break;

      case "CAPTURING":
        if (stateEvent.type === "STOP_MEETING") {
          this.state = "REVIEW";
        }
        break;

      case "REVIEW":
        if (
          stateEvent.type === "SAVE_NOTES" ||
          stateEvent.type === "DISCARD_NOTES"
        ) {
          this.state = "IDLE";
        }
        break;
    }

    if (previous !== this.state) {
      console.log(`Estado mudou: ${previous} -> ${this.state}`);
    }

    return this.state;
  }
}