import { analyzeCalendar } from "./calendar-analysis.js";

self.onmessage = ({ data: { id, type, events } }) => {
  try {
    self.postMessage({ id, result: analyzeCalendar(type, events) });
  } catch {
    self.postMessage({ id, error: "Calendar analysis failed." });
  }
};
