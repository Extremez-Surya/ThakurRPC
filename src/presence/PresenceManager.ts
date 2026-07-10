import { EventEmitter } from "node:events";
import { createHash } from "node:crypto";
import type {
  PresenceActivity,
  PresenceAssets,
  PresenceButton,
  PresenceLogger,
  PresenceManagerOptions,
  PresencePayload,
  PresenceParty,
  PresenceState,
  PresenceStatus,
  PresenceTimestamp,
  PresenceTransport,
  PresenceUpdateInput,
  StreamingStatus,
} from "./types.js";

const DEFAULT_STATUS: PresenceStatus = "dnd";
const DEFAULT_INITIAL_RECONNECT_DELAY_MS = 1000;
const DEFAULT_MAX_RECONNECT_DELAY_MS = 30000;
const DEFAULT_RECONNECT_FACTOR = 2;
const DEFAULT_MAX_RECONNECT_ATTEMPTS = 8;

class PresenceValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PresenceValidationError";
  }
}

function createDefaultLogger(): PresenceLogger {
  return {
    debug: (message, meta) => console.debug(`[PresenceManager] ${message}`, meta ?? ""),
    info: (message, meta) => console.info(`[PresenceManager] ${message}`, meta ?? ""),
    warn: (message, meta) => console.warn(`[PresenceManager] ${message}`, meta ?? ""),
    error: (message, meta) => console.error(`[PresenceManager] ${message}`, meta ?? ""),
  };
}

function isValidHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function normalizeText(value: unknown, fallback = ""): string {
  if (typeof value !== "string") {
    return fallback;
  }

  return value.trim();
}

function normalizeTimestampValue(value: number | string | Date | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (value instanceof Date) {
    const time = value.getTime();
    return Number.isFinite(time) ? time : null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string") {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return numeric;
    }

    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function normalizeTimestamp(input?: PresenceTimestamp): PresenceTimestamp | undefined {
  if (!input) {
    return undefined;
  }

  const start = normalizeTimestampValue(input.start);
  const end = normalizeTimestampValue(input.end);

  if (start === null && end === null) {
    return undefined;
  }

  return {
    ...(start !== null ? { start } : {}),
    ...(end !== null ? { end } : {}),
  };
}

function normalizeButtons(buttons?: PresenceButton[]): PresenceButton[] {
  if (!Array.isArray(buttons) || buttons.length === 0) {
    return [];
  }

  return buttons
    .slice(0, 2)
    .map((button) => ({
      label: normalizeText(button.label),
      url: normalizeText(button.url),
    }))
    .filter((button) => button.label.length > 0 && isValidHttpUrl(button.url));
}

function normalizeParty(party?: PresenceParty): PresenceParty | undefined {
  if (!party) {
    return undefined;
  }

  const current = Number(party.current);
  const max = Number(party.max);

  if (!Number.isFinite(current) || !Number.isFinite(max) || current < 1 || max < 1 || current > max) {
    return undefined;
  }

  return {
    id: party.id ? normalizeText(party.id) : undefined,
    current,
    max,
  };
}

function normalizeAssets(assets?: PresenceAssets): PresenceAssets | undefined {
  if (!assets) {
    return undefined;
  }

  const normalized: PresenceAssets = {};

  if (normalizeText(assets.largeImage).length > 0) normalized.largeImage = normalizeText(assets.largeImage);
  if (normalizeText(assets.largeText).length > 0) normalized.largeText = normalizeText(assets.largeText);
  if (normalizeText(assets.smallImage).length > 0) normalized.smallImage = normalizeText(assets.smallImage);
  if (normalizeText(assets.smallText).length > 0) normalized.smallText = normalizeText(assets.smallText);

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right));
  return `{${entries
    .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`)
    .join(",")}}`;
}

function hashPayload(payload: PresencePayload): string {
  return createHash("sha256").update(stableStringify(payload)).digest("hex");
}

function normalizeStreamingStatus(status: Partial<StreamingStatus>, index: number): StreamingStatus {
  const name = normalizeText(status.name, `Streaming ${index + 1}`);
  const details = normalizeText(status.details);
  const state = normalizeText(status.state);
  const url = normalizeText(status.url);
  const joinSecret = normalizeText(status.joinSecret);

  return {
    name,
    ...(details.length > 0 ? { details } : {}),
    ...(state.length > 0 ? { state } : {}),
    ...(url.length > 0 ? { url } : {}),
    ...(joinSecret.length > 0 ? { joinSecret } : {}),
    ...(status.assets ? { assets: status.assets } : {}),
    ...(status.buttons ? { buttons: status.buttons } : {}),
    ...(status.party ? { party: status.party } : {}),
    ...(status.timestamps ? { timestamps: status.timestamps } : {}),
  };
}

export class PresenceManager extends EventEmitter {
  private readonly transport: PresenceTransport;
  private readonly logger: PresenceLogger;
  private readonly applicationId: string;
  private readonly reconnectEnabled: boolean;
  private readonly reconnectInitialDelayMs: number;
  private readonly reconnectMaxDelayMs: number;
  private readonly reconnectFactor: number;
  private readonly reconnectMaxAttempts: number;
  private readonly reconnectJitter: boolean;

  private state: PresenceState;
  private connected = false;
  private destroyed = false;
  private lastPayloadHash = "";
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private publishInFlight = false;
  private publishAgain = false;

  constructor(transport: PresenceTransport, options: PresenceManagerOptions = {}) {
    super();
    this.transport = transport;
    this.logger = options.logger ?? createDefaultLogger();
    this.applicationId = options.applicationId ?? "";
    this.reconnectEnabled = options.reconnect?.enabled ?? true;
    this.reconnectInitialDelayMs = options.reconnect?.initialDelayMs ?? DEFAULT_INITIAL_RECONNECT_DELAY_MS;
    this.reconnectMaxDelayMs = options.reconnect?.maxDelayMs ?? DEFAULT_MAX_RECONNECT_DELAY_MS;
    this.reconnectFactor = options.reconnect?.factor ?? DEFAULT_RECONNECT_FACTOR;
    this.reconnectMaxAttempts = options.reconnect?.maxAttempts ?? DEFAULT_MAX_RECONNECT_ATTEMPTS;
    this.reconnectJitter = options.reconnect?.jitter ?? true;

    this.state = {
      status: options.status ?? DEFAULT_STATUS,
      streamingStatuses: [],
      buttons: [],
    };
  }

  public isConnected(): boolean {
    return this.connected;
  }

  public getState(): Readonly<PresenceState> {
    return this.state;
  }

  public async connect(): Promise<void> {
    if (this.destroyed) {
      throw new Error("PresenceManager has been destroyed");
    }

    await this.transport.connect();
    this.connected = true;
    this.reconnectAttempt = 0;
    this.logger.info("Presence transport connected");
    this.emit("connected");
    await this.publishIfChanged();
  }

  public async disconnect(): Promise<void> {
    this.destroyed = true;
    this.clearReconnectTimer();
    this.connected = false;
    await this.transport.disconnect();
    this.logger.info("Presence transport disconnected");
    this.emit("disconnected");
  }

  public async destroy(): Promise<void> {
    await this.disconnect();
  }

  public async update(input: PresenceUpdateInput): Promise<void> {
    this.state = this.mergeState(this.state, input);
    await this.publishIfChanged();
  }

  public async setStatus(status: PresenceStatus): Promise<void> {
    await this.update({ status });
  }

  public async setActivity(activity: Partial<PresenceActivity>): Promise<void> {
    await this.update({ activity });
  }

  public async setDetails(details: string): Promise<void> {
    await this.update({ activity: { details } });
  }

  public async setState(state: string): Promise<void> {
    await this.update({ activity: { state } });
  }

  public async setTimestamps(timestamps: PresenceTimestamp): Promise<void> {
    await this.update({ timestamps });
  }

  public async setAssets(assets: PresenceAssets): Promise<void> {
    await this.update({ assets });
  }

  public async setButtons(buttons: PresenceButton[]): Promise<void> {
    await this.update({ buttons });
  }

  public async setParty(party: PresenceParty): Promise<void> {
    await this.update({ party });
  }

  public async setJoinSecret(joinSecret: string): Promise<void> {
    await this.update({ joinSecret });
  }

  public async setStreamingStatuses(statuses: Array<Partial<StreamingStatus>>): Promise<void> {
    this.state = {
      ...this.state,
      streamingStatuses: statuses.map((status, index) => normalizeStreamingStatus(status, index)),
    };
    await this.publishIfChanged();
  }

  public async addStreamingStatus(status: Partial<StreamingStatus>): Promise<void> {
    this.state = {
      ...this.state,
      streamingStatuses: [...this.state.streamingStatuses, normalizeStreamingStatus(status, this.state.streamingStatuses.length)],
    };
    await this.publishIfChanged();
  }

  public async removeStreamingStatus(index: number): Promise<void> {
    if (index < 0 || index >= this.state.streamingStatuses.length) {
      return;
    }

    this.state = {
      ...this.state,
      streamingStatuses: this.state.streamingStatuses.filter((_, currentIndex) => currentIndex !== index),
    };
    await this.publishIfChanged();
  }

  public async clearPresence(): Promise<void> {
    this.state = {
      status: this.state.status,
      streamingStatuses: [],
      activity: undefined,
      assets: undefined,
      buttons: [],
      party: undefined,
      timestamps: undefined,
      joinSecret: undefined,
    };

    this.lastPayloadHash = "";
    await this.transport.setPresence({
      status: this.state.status,
      activities: [],
    });
  }

  private mergeState(current: PresenceState, input: PresenceUpdateInput): PresenceState {
    const nextStreamingStatuses = input.streamingStatuses
      ? input.streamingStatuses.map((status, index) => normalizeStreamingStatus(status, index))
      : current.streamingStatuses;

    return {
      ...current,
      ...(input.status ? { status: input.status } : {}),
      ...(input.activity ? { activity: this.mergeActivity(current.activity, input.activity) } : {}),
      ...(input.assets ? { assets: input.assets } : {}),
      ...(input.buttons ? { buttons: input.buttons } : {}),
      ...(input.party ? { party: input.party } : {}),
      ...(input.timestamps ? { timestamps: input.timestamps } : {}),
      ...(input.joinSecret ? { joinSecret: input.joinSecret } : {}),
      streamingStatuses: nextStreamingStatuses,
    };
  }

  private mergeActivity(current: PresenceActivity | undefined, update: Partial<PresenceActivity>): PresenceActivity {
    const merged: PresenceActivity = {
      type: update.type ?? current?.type ?? "PLAYING",
      name: normalizeText(update.name ?? current?.name, current?.name ?? "Presence"),
    };

    if (update.details !== undefined || current?.details !== undefined) {
      const details = normalizeText(update.details ?? current?.details);
      if (details.length > 0) merged.details = details;
    }

    if (update.state !== undefined || current?.state !== undefined) {
      const state = normalizeText(update.state ?? current?.state);
      if (state.length > 0) merged.state = state;
    }

    if (update.url !== undefined || current?.url !== undefined) {
      const url = normalizeText(update.url ?? current?.url);
      if (url.length > 0) merged.url = url;
    }

    const timestamps = normalizeTimestamp(update.timestamps ?? current?.timestamps);
    if (timestamps) merged.timestamps = timestamps;

    const assets = normalizeAssets(update.assets ?? current?.assets);
    if (assets) merged.assets = assets;

    const buttons = normalizeButtons(update.buttons ?? current?.buttons);
    if (buttons.length > 0) merged.buttons = buttons;

    const party = normalizeParty(update.party ?? current?.party);
    if (party) merged.party = party;

    const joinSecret = normalizeText(update.joinSecret ?? current?.joinSecret);
    if (joinSecret.length > 0) merged.joinSecret = joinSecret;

    return merged;
  }

  private buildPayload(): PresencePayload {
    const activities = this.state.streamingStatuses.length > 0
      ? this.state.streamingStatuses.map((status) => this.buildStreamingActivity(status))
      : this.state.activity
        ? [this.buildSingleActivity(this.state.activity)]
        : [];

    return {
      status: this.state.status,
      activities: activities.filter(Boolean) as PresenceActivity[],
    };
  }

  private buildSingleActivity(activity?: PresenceActivity): PresenceActivity {
    if (!activity) {
      return {
        type: "PLAYING",
        name: "Presence",
      };
    }

    const assets = normalizeAssets(activity.assets ?? this.state.assets);
    const buttons = normalizeButtons(activity.buttons ?? this.state.buttons);
    const party = normalizeParty(activity.party ?? this.state.party);
    const timestamps = normalizeTimestamp(activity.timestamps ?? this.state.timestamps);
    const joinSecret = normalizeText(activity.joinSecret ?? this.state.joinSecret);

    return {
      type: activity.type,
      name: activity.name,
      ...(activity.details ? { details: activity.details } : {}),
      ...(activity.state ? { state: activity.state } : {}),
      ...(activity.url ? { url: activity.url } : {}),
      ...(timestamps ? { timestamps } : {}),
      ...(assets ? { assets } : {}),
      ...(buttons.length > 0 ? { buttons } : {}),
      ...(party ? { party } : {}),
      ...(joinSecret.length > 0 ? { joinSecret } : {}),
    };
  }

  private buildStreamingActivity(status: StreamingStatus): PresenceActivity {
    const fallbackAssets = normalizeAssets(status.assets ?? this.state.assets);
    const fallbackButtons = normalizeButtons(status.buttons ?? this.state.buttons);
    const fallbackParty = normalizeParty(status.party ?? this.state.party);
    const fallbackTimestamps = normalizeTimestamp(status.timestamps ?? this.state.timestamps);
    const fallbackJoinSecret = normalizeText(status.joinSecret ?? this.state.joinSecret);

    const activity: PresenceActivity = {
      type: "STREAMING",
      name: status.name,
    };

    const details = normalizeText(status.details);
    if (details.length > 0) activity.details = details;

    const state = normalizeText(status.state);
    if (state.length > 0) activity.state = state;

    const url = normalizeText(status.url);
    if (url.length > 0) activity.url = url;

    if (fallbackTimestamps) activity.timestamps = fallbackTimestamps;

    if (fallbackAssets) activity.assets = fallbackAssets;

    if (fallbackButtons.length > 0) activity.buttons = fallbackButtons;

    if (fallbackParty) activity.party = fallbackParty;

    if (fallbackJoinSecret.length > 0) activity.joinSecret = fallbackJoinSecret;

    return activity;
  }

  private validatePayload(payload: PresencePayload, allowEmptyActivities = false): void {
    if (!this.applicationId) {
      throw new PresenceValidationError("applicationId is required");
    }

    if (!allowEmptyActivities && payload.activities.length === 0) {
      throw new PresenceValidationError("At least one activity is required");
    }

    for (const activity of payload.activities) {
      if (activity.name.length === 0) {
        throw new PresenceValidationError("Activity name cannot be empty");
      }

      if (activity.name.length > 128) {
        throw new PresenceValidationError("Activity name must be 128 characters or fewer");
      }

      if (activity.details && activity.details.length > 128) {
        throw new PresenceValidationError("Activity details must be 128 characters or fewer");
      }

      if (activity.state && activity.state.length > 128) {
        throw new PresenceValidationError("Activity state must be 128 characters or fewer");
      }

      if (activity.buttons && activity.buttons.length > 2) {
        throw new PresenceValidationError("Each activity can only expose up to 2 buttons");
      }

      if (activity.url && !isValidHttpUrl(activity.url)) {
        throw new PresenceValidationError(`Invalid streaming URL: ${activity.url}`);
      }
    }
  }

  private async publishIfChanged(): Promise<void> {
    if (this.publishInFlight) {
      this.publishAgain = true;
      return;
    }

    this.publishInFlight = true;

    try {
      do {
        this.publishAgain = false;
        const payload = this.buildPayload();
        this.validatePayload(payload, true);

        const payloadHash = hashPayload(payload);
        if (payloadHash === this.lastPayloadHash) {
          this.logger.debug("Skipping presence update because nothing changed");
          this.emit("skipped", payload);
          continue;
        }

        await this.transport.setPresence(payload);
        this.lastPayloadHash = payloadHash;
        this.logger.info("Presence updated", { activities: payload.activities.length, status: payload.status });
        this.emit("updated", payload);
      } while (this.publishAgain);
    } catch (error) {
      this.logger.error("Failed to publish presence", error);
      const normalizedError = error instanceof Error ? error : new Error(String(error));

      if (normalizedError instanceof PresenceValidationError) {
        this.emit("presenceError", normalizedError);
        throw normalizedError;
      }

      if (this.listenerCount("error") > 0) {
        this.emit("error", normalizedError);
      } else {
        this.emit("presenceError", normalizedError);
      }

      this.handleTransportFailure(normalizedError);
      throw normalizedError;
    } finally {
      this.publishInFlight = false;
    }
  }

  private handleTransportFailure(error: Error): void {
    if (!this.reconnectEnabled || this.destroyed) {
      return;
    }

    this.connected = false;
    this.emit("disconnected", error);
    this.scheduleReconnect(error);
  }

  private scheduleReconnect(error: Error): void {
    if (this.reconnectAttempt >= this.reconnectMaxAttempts) {
      this.logger.warn("Reconnect limit reached", { attempts: this.reconnectAttempt, error: error.message });
      return;
    }

    this.clearReconnectTimer();

    const delay = this.calculateReconnectDelay(this.reconnectAttempt);
    this.reconnectAttempt += 1;

    this.logger.warn("Scheduling presence reconnect", {
      attempt: this.reconnectAttempt,
      delay,
      error: error.message,
    });

    this.emit("reconnecting", { attempt: this.reconnectAttempt, delay, error });

    this.reconnectTimer = setTimeout(async () => {
      if (this.destroyed) {
        return;
      }

      try {
        await this.connect();
      } catch (connectError) {
        this.handleTransportFailure(connectError instanceof Error ? connectError : new Error(String(connectError)));
      }
    }, delay);
  }

  private calculateReconnectDelay(attempt: number): number {
    const baseDelay = Math.min(
      this.reconnectInitialDelayMs * Math.pow(this.reconnectFactor, attempt),
      this.reconnectMaxDelayMs,
    );

    if (!this.reconnectJitter) {
      return baseDelay;
    }

    const jitter = Math.floor(baseDelay * 0.2 * Math.random());
    return Math.min(baseDelay + jitter, this.reconnectMaxDelayMs);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}
