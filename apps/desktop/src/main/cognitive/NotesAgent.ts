import { ProcessedText } from "./Pipeline";

export interface MeetingNotes {
  timestamp: string;
  keyPoints: string[];
  decisions: string[];
  actionItems: string[];
}

export class NotesAgent {
  generate(processed: ProcessedText): MeetingNotes {
    return {
      timestamp: new Date().toISOString(),
      keyPoints: processed.keyPoints,
      decisions: processed.decisions,
      actionItems: processed.actionItems
    };
  }

  createEmpty(): MeetingNotes {
    return {
      timestamp: new Date().toISOString(),
      keyPoints: [],
      decisions: [],
      actionItems: []
    };
  }
}
