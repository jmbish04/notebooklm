import { ArtifactsAPI } from "./api/artifacts.js";
import { ChatAPI } from "./api/chat.js";
import { NotebooksAPI } from "./api/notebooks.js";
import { NotesAPI } from "./api/notes.js";
import { ResearchAPI } from "./api/research.js";
import { SettingsAPI } from "./api/settings.js";
import { SharingAPI } from "./api/sharing.js";
import { SourcesAPI } from "./api/sources.js";
import { type AuthTokens, type ConnectOptions, connect, refreshAuthTokens } from "./auth.js";
import { RPCCore } from "./rpc/core.js";

export interface ClientOptions {
  /** HTTP request timeout in milliseconds. Default: 30000 */
  timeoutMs?: number;
}

/**
 * NotebookLM SDK client.
 *
 * @example
 * ```ts
 * // After running `npx notebooklm-sdk login` once:
 * const client = await NotebookLMClient.connect();
 * const notebooks = await client.notebooks.list();
 *
 * // Or with explicit credentials:
 * const client = await NotebookLMClient.connect({ cookiesFile: './session.json' });
 * ```
 */
export class NotebookLMClient {
  readonly notebooks: NotebooksAPI;
  readonly sources: SourcesAPI;
  readonly artifacts: ArtifactsAPI;
  readonly chat: ChatAPI;
  readonly notes: NotesAPI;
  readonly research: ResearchAPI;
  readonly settings: SettingsAPI;
  readonly sharing: SharingAPI;
  private refreshPromise: Promise<void> | null = null;

  private constructor(
    private readonly auth: AuthTokens,
    opts: ClientOptions = {},
  ) {
    const refreshAuth = this.refreshTokens.bind(this);
    const rpc = new RPCCore(auth, opts.timeoutMs, refreshAuth);
    this.notebooks = new NotebooksAPI(rpc);
    this.sources = new SourcesAPI(rpc, auth);
    this.notes = new NotesAPI(rpc);
    this.artifacts = new ArtifactsAPI(rpc, auth, this.notes);
    this.chat = new ChatAPI(rpc, auth, refreshAuth);
    this.research = new ResearchAPI(rpc);
    this.settings = new SettingsAPI(rpc);
    this.sharing = new SharingAPI(rpc);
  }

  /**
   * Connect to NotebookLM using cookies.
   * Fetches CSRF and session tokens from the NotebookLM homepage.
   */
  static async connect(
    opts: ConnectOptions = {},
    clientOpts: ClientOptions = {},
  ): Promise<NotebookLMClient> {
    const auth = await connect(opts);
    return new NotebookLMClient(auth, clientOpts);
  }

  /**
   * Refresh CSRF and session tokens (e.g. if they expire mid-session).
   */
  async refreshTokens(): Promise<void> {
    if (!this.refreshPromise) {
      this.refreshPromise = refreshAuthTokens(this.auth)
        .then(() => undefined)
        .finally(() => {
          this.refreshPromise = null;
        });
    }
    await this.refreshPromise;
  }
}
