export type PresenceStatus = "online" | "idle" | "dnd" | "invisible";
export type PresenceActivityType = "PLAYING" | "STREAMING" | "LISTENING" | "WATCHING" | "COMPETING";

export interface PresenceButton {
  label: string;
  url: string;
}

export interface PresenceAssets {
  largeImage?: string;
  largeText?: string;
  smallImage?: string;
  smallText?: string;
}

export interface PresenceTimestamp {
  start?: number | string | Date | null;
  end?: number | string | Date | null;
}

export interface PresenceParty {
  id?: string;
  current: number;
  max: number;
}

export interface StreamingStatus {
  name: string;
  details?: string;
  state?: string;
  url?: string;
  assets?: PresenceAssets;
  buttons?: PresenceButton[];
  party?: PresenceParty;
  timestamps?: PresenceTimestamp;
  joinSecret?: string;
}

export interface PresenceActivity {
  type: PresenceActivityType;
  name: string;
  details?: string;
  state?: string;
  url?: string;
  timestamps?: PresenceTimestamp;
  assets?: PresenceAssets;
  buttons?: PresenceButton[];
  party?: PresenceParty;
  joinSecret?: string;
}

export interface PresenceState {
  status: PresenceStatus;
  activity?: PresenceActivity;
  streamingStatuses: StreamingStatus[];
  assets?: PresenceAssets;
  buttons: PresenceButton[];
  party?: PresenceParty;
  timestamps?: PresenceTimestamp;
  joinSecret?: string;
}

export interface PresencePayload {
  status: PresenceStatus;
  activities: PresenceActivity[];
}

export interface PresenceLogger {
  debug(message: string, meta?: unknown): void;
  info(message: string, meta?: unknown): void;
  warn(message: string, meta?: unknown): void;
  error(message: string, meta?: unknown): void;
}

export interface PresenceTransport {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  setPresence(payload: PresencePayload): Promise<void>;
}

export interface PresenceManagerOptions {
  applicationId?: string;
  status?: PresenceStatus;
  reconnect?: {
    enabled?: boolean;
    initialDelayMs?: number;
    maxDelayMs?: number;
    factor?: number;
    maxAttempts?: number;
    jitter?: boolean;
  };
  logger?: PresenceLogger;
}

export interface PresenceUpdateInput {
  status?: PresenceStatus;
  activity?: Partial<PresenceActivity>;
  streamingStatuses?: Array<Partial<StreamingStatus>>;
  assets?: PresenceAssets;
  buttons?: PresenceButton[];
  party?: PresenceParty;
  timestamps?: PresenceTimestamp;
  joinSecret?: string;
}
