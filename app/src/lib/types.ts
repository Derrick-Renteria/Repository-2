export type Status = 'Confirmed' | 'Pending' | 'Changed' | 'Scratched';
export const STATUSES: Status[] = ['Confirmed', 'Pending', 'Changed', 'Scratched'];

export interface EventSettings {
  maxPerFlight: number;
  changeWindowMin: number;
  flightLengthMin: number;
  publicShowAge: boolean;
  published: boolean;
  currentFlightId: string | null;
  currentStartedAt: string | null;
}
export const DEFAULT_SETTINGS: EventSettings = {
  maxPerFlight: 10, changeWindowMin: 60, flightLengthMin: 15,
  publicShowAge: false, published: true, currentFlightId: null, currentStartedAt: null,
};

export interface EventRow { id: string; name: string; date: string | null; settings: EventSettings; createdAt: string }
export interface Level { id: string; eventId: string; name: string; color: string; sort: number }
export interface Flight {
  id: string; eventId: string; levelId: string; number: number;
  startMin: number | null; notes: string; changedAt: string | null;
}
export interface Athlete {
  id: string; eventId: string; name: string; age: number | null;
  levelId: string | null; flightId: string | null; overrideMin: number | null;
  status: Status; notes: string; changedAt: string | null; srcRow: number | null;
}
export type TableName = 'events' | 'levels' | 'flights' | 'athletes' | 'changes';
export interface UndoOp { table: TableName; id: string; op: 'update' | 'insert' | 'delete'; row?: Record<string, unknown>; patch?: Record<string, unknown> }
export interface Change {
  id: string; eventId: string; at: string; actor: string;
  target: string; field: string; oldValue: string; newValue: string;
  undo: UndoOp[] | null; undone: boolean;
}
export interface Data {
  events: EventRow[]; levels: Level[]; flights: Flight[]; athletes: Athlete[]; changes: Change[];
}
export const EMPTY: Data = { events: [], levels: [], flights: [], athletes: [], changes: [] };

export const LEVEL_COLORS = ['#F59E0B', '#10B981', '#3B82F6', '#8B5CF6', '#EF4444',
  '#06B6D4', '#84CC16', '#EC4899', '#F97316', '#6366F1', '#14B8A6', '#A855F7'];
