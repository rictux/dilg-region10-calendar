import { analyzeCalendar } from "./calendar-analysis.js";

export class CalendarAnalysisClient {
  constructor() {
    this.pending = new Map();
    this.sequence = 0;
    this.disabled = false;
    this.worker = null;
  }
  disableWorker() {
    this.disabled = true;
    this.worker?.terminate();
    this.worker = null;
    for (const task of this.pending.values()) {
      clearTimeout(task.timeout);
      task.reject(new Error("Calendar worker unavailable."));
    }
    this.pending.clear();
  }
  async run(type, events) {
    if (!events.length) return [];
    if (!this.disabled) {
      try {
        if (!this.worker) {
          this.worker = new Worker(new URL("./calendar-worker.js", import.meta.url), { type: "module" });
          this.worker.onerror = event => { event.preventDefault(); this.disableWorker(); };
          this.worker.onmessageerror = () => this.disableWorker();
          this.worker.onmessage = ({ data }) => {
            const task = this.pending.get(data.id);
            if (!task) return;
            this.pending.delete(data.id);
            clearTimeout(task.timeout);
            if (data.error) task.reject(new Error(data.error));
            else task.resolve(data.result);
          };
        }
        return await new Promise((resolve, reject) => {
          const id = ++this.sequence;
          const timeout = setTimeout(() => this.disableWorker(), 30000);
          this.pending.set(id, { resolve, reject, timeout });
          this.worker.postMessage({ id, type, events });
        });
      } catch {
        this.disableWorker();
      }
    }
    // Storage/worker restrictions must not make the dashboard unavailable.
    await new Promise(resolve => setTimeout(resolve, 0));
    return analyzeCalendar(type, events);
  }
}
