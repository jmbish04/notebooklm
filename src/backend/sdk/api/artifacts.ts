import type { AuthTokens } from "../auth.js";
import type { RPCCore } from "../rpc/core.js";
import type {
  AudioFormatValue,
  AudioLengthValue,
  InfographicDetailValue,
  InfographicOrientationValue,
  InfographicStyleValue,
  QuizDifficultyValue,
  QuizQuantityValue,
  SlideDeckFormatValue,
  SlideDeckLengthValue,
  VideoFormatValue,
  VideoStyleValue,
} from "../types/enums.js";
import type { Artifact, GenerationStatus, Note, ReportSuggestion } from "../types/models.js";
import type { NotesAPI } from "./notes.js";

import { ArtifactTypeCode, artifactStatusFromCode, ExportType, RPCMethod } from "../types/enums.js";
import { ArtifactNotReadyError } from "../types/errors.js";
import { parseArtifact } from "../types/models.js";

export interface CreateAudioOptions {
  format?: AudioFormatValue;
  length?: AudioLengthValue;
  sourceIds?: string[];
  instructions?: string;
  language?: string;
}

export interface CreateVideoOptions {
  format?: VideoFormatValue;
  style?: VideoStyleValue;
  sourceIds?: string[];
  instructions?: string;
  language?: string;
}

export interface CreateQuizOptions {
  quantity?: QuizQuantityValue;
  difficulty?: QuizDifficultyValue;
  sourceIds?: string[];
  instructions?: string;
}

export interface CreateInfographicOptions {
  orientation?: InfographicOrientationValue;
  detail?: InfographicDetailValue;
  style?: InfographicStyleValue;
  sourceIds?: string[];
  instructions?: string;
  language?: string;
}

export interface CreateSlideDeckOptions {
  format?: SlideDeckFormatValue;
  length?: SlideDeckLengthValue;
  sourceIds?: string[];
  instructions?: string;
  language?: string;
}

export interface CreateDataTableOptions {
  sourceIds?: string[];
  instructions?: string;
  language?: string;
}

export interface DataTableContent {
  headers: string[];
  rows: string[][];
}

export interface PollUntilReadyOptions {
  timeoutSecs?: number;
  intervalSecs?: number;
  onTick?: (status: GenerationStatus) => void | Promise<void>;
  signal?: AbortSignal;
}

export type ReportFormat = "briefing_doc" | "study_guide" | "blog_post" | "custom";

export interface CreateReportOptions {
  format?: ReportFormat;
  sourceIds?: string[];
  language?: string;
  customPrompt?: string;
  extraInstructions?: string;
}

// Triple-nest source IDs as required by the API: [[[sid]], [[sid]], ...]
function tripleNest(ids: string[]): string[][][] {
  return ids.map((id) => [[id]]);
}

// Double-nest source IDs: [[sid], [sid], ...]
function doubleNest(ids: string[]): string[][] {
  return ids.map((id) => [id]);
}

export class ArtifactsAPI {
  constructor(
    private readonly rpc: RPCCore,
    private readonly auth: AuthTokens,
    private readonly notes: NotesAPI,
  ) {}

  async list(notebookId: string): Promise<Artifact[]> {
    const rawList = await this._listRaw(notebookId);
    const artifacts: Artifact[] = [];
    for (const item of rawList) {
      if (Array.isArray(item)) {
        try {
          artifacts.push(parseArtifact(item, notebookId));
        } catch {
          // ignore malformed items
        }
      }
    }
    return artifacts;
  }

  private async _listRaw(notebookId: string): Promise<unknown[][]> {
    const params = [[2], notebookId, 'NOT artifact.status = "ARTIFACT_STATUS_SUGGESTED"'];
    const result = await this.rpc.call(RPCMethod.LIST_ARTIFACTS, params, {
      sourcePath: `/notebook/${notebookId}`,
      allowNull: true,
    });
    if (!Array.isArray(result) || !result.length) return [];
    return (Array.isArray(result[0]) ? result[0] : result) as unknown[][];
  }

  async get(notebookId: string, artifactId: string): Promise<Artifact | null> {
    const artifacts = await this.list(notebookId);
    return artifacts.find((a) => a.id === artifactId) ?? null;
  }

  async listAudio(notebookId: string): Promise<Artifact[]> {
    return (await this.list(notebookId)).filter((a) => a.kind === "audio");
  }

  async listVideo(notebookId: string): Promise<Artifact[]> {
    return (await this.list(notebookId)).filter((a) => a.kind === "video");
  }

  async listReports(notebookId: string): Promise<Artifact[]> {
    return (await this.list(notebookId)).filter((a) => a.kind === "report");
  }

  async listQuizzes(notebookId: string): Promise<Artifact[]> {
    return (await this.list(notebookId)).filter((a) => a.kind === "quiz");
  }

  async listFlashcards(notebookId: string): Promise<Artifact[]> {
    return (await this.list(notebookId)).filter((a) => a.kind === "flashcards");
  }

  async listInfographics(notebookId: string): Promise<Artifact[]> {
    return (await this.list(notebookId)).filter((a) => a.kind === "infographic");
  }

  async listSlideDecks(notebookId: string): Promise<Artifact[]> {
    return (await this.list(notebookId)).filter((a) => a.kind === "slide_deck");
  }

  async listDataTables(notebookId: string): Promise<Artifact[]> {
    return (await this.list(notebookId)).filter((a) => a.kind === "data_table");
  }

  async delete(notebookId: string, artifactId: string): Promise<boolean> {
    const params = [[2], notebookId, artifactId];
    await this.rpc.call(RPCMethod.DELETE_ARTIFACT, params, {
      sourcePath: `/notebook/${notebookId}`,
      allowNull: true,
    });
    return true;
  }

  async rename(notebookId: string, artifactId: string, newTitle: string): Promise<boolean> {
    const params = [[2], notebookId, artifactId, newTitle];
    await this.rpc.call(RPCMethod.RENAME_ARTIFACT, params, {
      sourcePath: `/notebook/${notebookId}`,
      allowNull: true,
    });
    return true;
  }

  // ---------------------------------------------------------------------------
  // Generation
  // ---------------------------------------------------------------------------

  async createAudio(notebookId: string, opts: CreateAudioOptions = {}): Promise<GenerationStatus> {
    const format = opts.format ?? null;
    const length = opts.length ?? null;
    const language = opts.language ?? "en";
    const sourceIds = opts.sourceIds ?? (await this.rpc.getSourceIds(notebookId));
    const triple = tripleNest(sourceIds);
    const double = doubleNest(sourceIds);

    // config at index 6 (no extra null before it)
    const params = [
      [2],
      notebookId,
      [
        null,
        null,
        ArtifactTypeCode.AUDIO,
        triple,
        null,
        null,
        [null, [opts.instructions ?? null, length, null, double, language, null, format]],
      ],
    ];
    return this._callGenerate(notebookId, params);
  }

  async createVideo(notebookId: string, opts: CreateVideoOptions = {}): Promise<GenerationStatus> {
    const format = opts.format ?? null;
    const style = opts.style ?? null;
    const language = opts.language ?? "en";
    const sourceIds = opts.sourceIds ?? (await this.rpc.getSourceIds(notebookId));
    const triple = tripleNest(sourceIds);
    const double = doubleNest(sourceIds);

    // config at index 8 (two extra nulls at 6,7)
    const params = [
      [2],
      notebookId,
      [
        null,
        null,
        ArtifactTypeCode.VIDEO,
        triple,
        null,
        null,
        null,
        null,
        [null, null, [double, language, opts.instructions ?? null, null, format, style]],
      ],
    ];
    return this._callGenerate(notebookId, params);
  }

  async createQuiz(notebookId: string, opts: CreateQuizOptions = {}): Promise<GenerationStatus> {
    const quantity = opts.quantity ?? null;
    const difficulty = opts.difficulty ?? null;
    const sourceIds = opts.sourceIds ?? (await this.rpc.getSourceIds(notebookId));
    const triple = tripleNest(sourceIds);

    // config at index 9 (three extra nulls at 6,7,8); no source_ids_double in config
    const params = [
      [2],
      notebookId,
      [
        null,
        null,
        ArtifactTypeCode.QUIZ,
        triple,
        null,
        null,
        null,
        null,
        null,
        [
          null,
          [2, null, opts.instructions ?? null, null, null, null, null, [quantity, difficulty]],
        ],
      ],
    ];
    return this._callGenerate(notebookId, params);
  }

  async createFlashcards(
    notebookId: string,
    opts: CreateQuizOptions = {},
  ): Promise<GenerationStatus> {
    const quantity = opts.quantity ?? null;
    const difficulty = opts.difficulty ?? null;
    const sourceIds = opts.sourceIds ?? (await this.rpc.getSourceIds(notebookId));
    const triple = tripleNest(sourceIds);

    // config at index 9; note [difficulty, quantity] order (reversed from quiz)
    const params = [
      [2],
      notebookId,
      [
        null,
        null,
        ArtifactTypeCode.QUIZ,
        triple,
        null,
        null,
        null,
        null,
        null,
        [null, [1, null, opts.instructions ?? null, null, null, null, [difficulty, quantity]]],
      ],
    ];
    return this._callGenerate(notebookId, params);
  }

  async createInfographic(
    notebookId: string,
    opts: CreateInfographicOptions = {},
  ): Promise<GenerationStatus> {
    const orientation = opts.orientation ?? null;
    const detail = opts.detail ?? null;
    const style = opts.style ?? null;
    const language = opts.language ?? "en";
    const sourceIds = opts.sourceIds ?? (await this.rpc.getSourceIds(notebookId));
    const triple = tripleNest(sourceIds);

    // config at index 14 (eight extra nulls at 6-13); no source_ids_double in config
    const params = [
      [2],
      notebookId,
      [
        null,
        null,
        ArtifactTypeCode.INFOGRAPHIC,
        triple,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        [[opts.instructions ?? null, language, null, orientation, detail, style]],
      ],
    ];
    return this._callGenerate(notebookId, params);
  }

  async createSlideDeck(
    notebookId: string,
    opts: CreateSlideDeckOptions = {},
  ): Promise<GenerationStatus> {
    const format = opts.format ?? null;
    const length = opts.length ?? null;
    const language = opts.language ?? "en";
    const sourceIds = opts.sourceIds ?? (await this.rpc.getSourceIds(notebookId));
    const triple = tripleNest(sourceIds);

    // config at index 16 (ten extra nulls at 6-15); no source_ids_double in config
    const params = [
      [2],
      notebookId,
      [
        null,
        null,
        ArtifactTypeCode.SLIDE_DECK,
        triple,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        [[opts.instructions ?? null, language, format, length]],
      ],
    ];
    return this._callGenerate(notebookId, params);
  }

  async createDataTable(
    notebookId: string,
    opts: CreateDataTableOptions = {},
  ): Promise<GenerationStatus> {
    const language = opts.language ?? "en";
    const sourceIds = opts.sourceIds ?? (await this.rpc.getSourceIds(notebookId));
    const triple = tripleNest(sourceIds);

    // config at index 18 (twelve extra nulls at 6-17)
    const params = [
      [2],
      notebookId,
      [
        null,
        null,
        ArtifactTypeCode.DATA_TABLE,
        triple,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        [null, [opts.instructions ?? null, language]],
      ],
    ];
    return this._callGenerate(notebookId, params);
  }

  async createReport(
    notebookId: string,
    opts: CreateReportOptions = {},
  ): Promise<GenerationStatus> {
    const format = opts.format ?? "briefing_doc";
    const language = opts.language ?? "en";
    const sourceIds = opts.sourceIds ?? (await this.rpc.getSourceIds(notebookId));
    const triple = tripleNest(sourceIds);
    const double = doubleNest(sourceIds);

    const configs: Record<string, { title: string; description: string; prompt: string }> = {
      briefing_doc: {
        title: "Briefing Doc",
        description: "Key insights and important quotes",
        prompt:
          "Create a comprehensive briefing document that includes an Executive Summary, " +
          "detailed analysis of key themes, important quotes with context, and actionable insights.",
      },
      study_guide: {
        title: "Study Guide",
        description: "Short-answer quiz, essay questions, glossary",
        prompt:
          "Create a comprehensive study guide that includes key concepts, short-answer practice " +
          "questions, essay prompts for deeper exploration, and a glossary of important terms.",
      },
      blog_post: {
        title: "Blog Post",
        description: "Insightful takeaways in readable article format",
        prompt:
          "Write an engaging blog post that presents the key insights in an accessible, " +
          "reader-friendly format with an attention-grabbing introduction and compelling conclusion.",
      },
      custom: {
        title: "Custom Report",
        description: "Custom format",
        prompt: opts.customPrompt ?? "Create a report based on the provided sources.",
      },
    };

    const cfg = configs[format] ?? configs["briefing_doc"]!;
    const prompt =
      opts.extraInstructions && format !== "custom"
        ? `${cfg.prompt}\n\n${opts.extraInstructions}`
        : cfg.prompt;

    const params = [
      [2],
      notebookId,
      [
        null,
        null,
        ArtifactTypeCode.REPORT,
        triple,
        null,
        null,
        null,
        [null, [cfg.title, cfg.description, null, double, language, prompt, null, true]],
      ],
    ];
    return this._callGenerate(notebookId, params);
  }

  async createMindMap(notebookId: string, sourceIds?: string[]): Promise<Note> {
    const ids = sourceIds ?? (await this.rpc.getSourceIds(notebookId));
    const triple = tripleNest(ids);

    // GENERATE_MIND_MAP returns content directly — it does NOT persist anything.
    // We extract the JSON from result[0][0] and save it as a note.
    const params = [
      triple,
      null,
      null,
      null,
      null,
      ["interactive_mindmap", [["[CONTEXT]", ""]], ""],
      null,
      [2, null, [1]],
    ];
    const result = await this.rpc.call(RPCMethod.GENERATE_MIND_MAP, params, {
      sourcePath: `/notebook/${notebookId}`,
      allowNull: true,
    });

    const mindMapJson: string | null =
      Array.isArray(result) && Array.isArray(result[0]) && typeof result[0][0] === "string"
        ? (result[0][0] as string)
        : null;

    if (!mindMapJson) throw new Error("Mind map generation returned no content");

    let title = "Mind Map";
    try {
      const parsed = JSON.parse(mindMapJson) as Record<string, unknown>;
      if (typeof parsed["name"] === "string") title = parsed["name"];
    } catch {
      // keep default title
    }

    return this.notes.create(notebookId, mindMapJson, title);
  }

  // ---------------------------------------------------------------------------
  // Polling / download
  // ---------------------------------------------------------------------------

  /** Poll until artifact reaches completed/failed status. */
  async waitUntilReady(
    notebookId: string,
    artifactId: string,
    timeout = 1800,
    pollInterval = 3,
  ): Promise<Artifact> {
    return this.pollUntilReady(notebookId, artifactId, {
      timeoutSecs: timeout,
      intervalSecs: pollInterval,
    });
  }

  /** Poll until artifact is fully ready, with optional progress hooks and cancellation. */
  async pollUntilReady(
    notebookId: string,
    artifactId: string,
    opts: PollUntilReadyOptions = {},
  ): Promise<Artifact> {
    const timeout = opts.timeoutSecs ?? 1800;
    const pollInterval = opts.intervalSecs ?? 3;
    const deadline = Date.now() + timeout * 1000;
    let lastStatus: GenerationStatus | null = null;

    while (Date.now() < deadline) {
      this.throwIfAborted(opts.signal);

      const status = await this.pollStatus(notebookId, artifactId);
      lastStatus = status;
      if (opts.onTick) await opts.onTick(status);

      const artifact = await this.get(notebookId, artifactId);
      if (artifact?.status === "completed") {
        if (
          (artifact.kind === "audio" && !artifact.audioUrl) ||
          (artifact.kind === "video" && !artifact.videoUrl)
        ) {
          await sleep(pollInterval * 1000);
          continue;
        }
        return artifact;
      }
      if (artifact?.status === "failed" || status.status === "failed") {
        throw new ArtifactNotReadyError(artifact?.kind ?? "artifact", {
          artifactId,
          status: "failed",
        });
      }

      await sleep(pollInterval * 1000);
    }

    throw new ArtifactNotReadyError("artifact", {
      artifactId,
      status: lastStatus?.status ?? "timeout",
    });
  }

  private throwIfAborted(signal?: AbortSignal): void {
    if (!signal?.aborted) return;
    throw new Error("Artifact polling aborted");
  }

  /** Get the current status of a generated artifact without waiting. */
  async pollStatus(notebookId: string, artifactId: string): Promise<GenerationStatus> {
    const rawList = await this._listRaw(notebookId);
    for (const item of rawList) {
      if (!Array.isArray(item) || item[0] !== artifactId) continue;
      const statusCode = typeof item[4] === "number" ? (item[4] as number) : null;
      return {
        artifactId,
        status: statusCode != null ? artifactStatusFromCode(statusCode) : "pending",
      };
    }
    return { artifactId, status: "pending" };
  }

  /** Download audio content as a Buffer. */
  async downloadAudio(notebookId: string, artifactId: string): Promise<Buffer> {
    const artifact = await this.get(notebookId, artifactId);
    if (!artifact || artifact.status !== "completed") {
      throw new ArtifactNotReadyError("audio", { artifactId, status: artifact?.status });
    }
    if (!artifact.audioUrl) throw new ArtifactNotReadyError("audio", { artifactId });
    return this._fetchMediaWithCookies(artifact.audioUrl);
  }

  /** Download video content as a Buffer. */
  async downloadVideo(notebookId: string, artifactId: string): Promise<Buffer> {
    const artifact = await this.get(notebookId, artifactId);
    if (!artifact || artifact.status !== "completed") {
      throw new ArtifactNotReadyError("video", { artifactId, status: artifact?.status });
    }
    if (!artifact.videoUrl) throw new ArtifactNotReadyError("video", { artifactId });
    return this._fetchMediaWithCookies(artifact.videoUrl);
  }

  /** Get markdown content for a completed report artifact. */
  async getReportMarkdown(notebookId: string, artifactId: string): Promise<string | null> {
    const artifact = await this.get(notebookId, artifactId);
    return artifact?.content ?? null;
  }

  /** Get interactive HTML for quiz/flashcard artifacts. */
  async getInteractiveHtml(notebookId: string, artifactId: string): Promise<string | null> {
    const params = [artifactId];
    const result = await this.rpc.call(RPCMethod.GET_INTERACTIVE_HTML, params, {
      sourcePath: `/notebook/${notebookId}`,
      allowNull: true,
    });
    // result[0] is artifact data array; HTML is at result[0][9][0]
    if (Array.isArray(result) && Array.isArray(result[0])) {
      const data = result[0] as unknown[];
      if (Array.isArray(data[9]) && typeof (data[9] as unknown[])[0] === "string") {
        return (data[9] as unknown[])[0] as string;
      }
    }
    return null;
  }

  /** Download a completed slide deck as PDF or PPTX. Returns a Buffer. */
  async downloadSlideDeck(
    notebookId: string,
    artifactId: string,
    format: "pdf" | "pptx" = "pdf",
  ): Promise<Buffer> {
    const rawList = await this._listRaw(notebookId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = rawList.find(
      (a: any) => a[0] === artifactId && a[2] === ArtifactTypeCode.SLIDE_DECK,
    ) as any;
    if (!raw) throw new ArtifactNotReadyError("slide_deck", { artifactId });

    // artifact[16] = [config, title, slides, pdf_url, pptx_url]
    const metadata = raw[16];
    if (!Array.isArray(metadata)) throw new ArtifactNotReadyError("slide_deck", { artifactId });

    const url = format === "pptx" ? metadata[4] : metadata[3];
    if (typeof url !== "string" || !url.startsWith("http")) {
      throw new ArtifactNotReadyError("slide_deck", { artifactId, status: `no ${format} url` });
    }
    return this._fetchMediaWithCookies(url);
  }

  /** Download a completed infographic as PNG. Returns a Buffer. */
  async downloadInfographic(notebookId: string, artifactId: string): Promise<Buffer> {
    const rawList = await this._listRaw(notebookId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = rawList.find(
      (a: any) => a[0] === artifactId && a[2] === ArtifactTypeCode.INFOGRAPHIC,
    ) as any[];
    if (!raw) throw new ArtifactNotReadyError("infographic", { artifactId });

    // Scan in reverse for the nested list containing the image URL
    let url: string | null = null;
    for (let i = raw.length - 1; i >= 0; i--) {
      const item = raw[i];
      if (
        Array.isArray(item) &&
        Array.isArray(item[2]) &&
        Array.isArray(item[2][0]) &&
        Array.isArray(item[2][0][1]) &&
        typeof item[2][0][1][0] === "string" &&
        (item[2][0][1][0] as string).startsWith("http")
      ) {
        url = item[2][0][1][0] as string;
        break;
      }
    }
    if (!url) throw new ArtifactNotReadyError("infographic", { artifactId });
    return this._fetchMediaWithCookies(url);
  }

  /** Get AI-suggested report formats based on notebook content. */
  async suggestReports(notebookId: string): Promise<ReportSuggestion[]> {
    const params = [[2], notebookId];
    const result = await this.rpc.call(RPCMethod.GET_SUGGESTED_REPORTS, params, {
      sourcePath: `/notebook/${notebookId}`,
      allowNull: true,
      timeoutMs: 120_000,
    });
    if (!Array.isArray(result) || !result.length) return [];
    const items = Array.isArray(result[0]) ? (result[0] as unknown[]) : result;
    const suggestions: ReportSuggestion[] = [];
    for (const item of items) {
      if (Array.isArray(item) && item.length >= 5) {
        suggestions.push({
          title: typeof item[0] === "string" ? item[0] : "",
          description: typeof item[1] === "string" ? item[1] : "",
          prompt: typeof item[4] === "string" ? item[4] : "",
          audienceLevel: typeof item[5] === "number" ? item[5] : 2,
        });
      }
    }
    return suggestions;
  }

  /** Revise an individual slide in a completed slide deck using a prompt. */
  async reviseSlide(
    notebookId: string,
    artifactId: string,
    slideIndex: number,
    prompt: string,
  ): Promise<GenerationStatus> {
    if (slideIndex < 0) throw new Error("slideIndex must be >= 0");
    const params = [[2], artifactId, [[[slideIndex, prompt]]]];
    const result = await this.rpc.call(RPCMethod.REVISE_SLIDE, params, {
      sourcePath: `/notebook/${notebookId}`,
      allowNull: true,
    });
    return this._parseGenerationResult(result);
  }

  /** Get parsed headers and rows from a completed data table artifact. */
  async getDataTableContent(
    notebookId: string,
    artifactId: string,
  ): Promise<DataTableContent | null> {
    const artifacts = await this._listRaw(notebookId);
    const raw = artifacts.find(
      (a) => Array.isArray(a) && a[0] === artifactId && a[2] === ArtifactTypeCode.DATA_TABLE,
    );
    if (!raw || !Array.isArray(raw) || !Array.isArray(raw[18])) return null;
    return parseDataTable(raw[18]);
  }

  // ---------------------------------------------------------------------------
  // Internal
  /** Export a completed report artifact to Google Docs. Returns the created document URL. */
  async exportReport(
    notebookId: string,
    artifactId: string,
    title: string,
  ): Promise<string | null> {
    const params = [null, artifactId, null, title, ExportType.DOCS];
    const result = await this.rpc.call(RPCMethod.EXPORT_ARTIFACT, params, {
      sourcePath: `/notebook/${notebookId}`,
      allowNull: true,
    });
    return extractExportUrl(result);
  }

  /** Export a completed data table artifact to Google Sheets. Returns the created spreadsheet URL. */
  async exportDataTable(
    notebookId: string,
    artifactId: string,
    title: string,
  ): Promise<string | null> {
    const params = [null, artifactId, null, title, ExportType.SHEETS];
    const result = await this.rpc.call(RPCMethod.EXPORT_ARTIFACT, params, {
      sourcePath: `/notebook/${notebookId}`,
      allowNull: true,
    });
    return extractExportUrl(result);
  }

  // ---------------------------------------------------------------------------

  /**
   * Fetch a Google-hosted media URL, manually following redirects to ensure
   * cookies are included on every hop. Node/Bun fetch strips the Cookie header
   * on cross-origin redirects (e.g. googleusercontent.com → lh3.google.com).
   */
  private async _fetchMediaWithCookies(url: string, maxRedirects = 10): Promise<Buffer> {
    let current = url;
    for (let i = 0; i < maxRedirects; i++) {
      if (!isTrustedDomain(current)) {
        throw new Error(`Untrusted redirect target: ${new URL(current).hostname}`);
      }
      const response = await fetch(current, {
        headers: { Cookie: this.auth.googleCookieHeader },
        redirect: "manual",
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location)
          throw new Error(`Redirect with no Location header (status ${response.status})`);
        current = location.startsWith("http") ? location : new URL(location, current).href;
        continue;
      }

      if (!response.ok) throw new Error(`Media download failed: HTTP ${response.status}`);

      const contentType = response.headers.get("content-type") ?? "";
      if (contentType.includes("text/html")) {
        throw new Error("Media download returned HTML — authentication cookies may be expired.");
      }

      return Buffer.from(await response.arrayBuffer());
    }
    throw new Error("Too many redirects fetching media URL");
  }

  private async _callGenerate(notebookId: string, params: unknown[]): Promise<GenerationStatus> {
    const result = await this.rpc.call(RPCMethod.CREATE_ARTIFACT, params, {
      sourcePath: `/notebook/${notebookId}`,
      allowNull: true,
    });
    return this._parseGenerationResult(result);
  }

  private _parseGenerationResult(result: unknown): GenerationStatus {
    if (Array.isArray(result) && result.length > 0) {
      const artifactData = result[0] as unknown[];
      const artifactId =
        Array.isArray(artifactData) &&
        artifactData.length > 0 &&
        typeof artifactData[0] === "string"
          ? (artifactData[0] as string)
          : null;
      const statusCode =
        Array.isArray(artifactData) &&
        artifactData.length > 4 &&
        typeof artifactData[4] === "number"
          ? (artifactData[4] as number)
          : null;

      if (artifactId) {
        return {
          artifactId,
          status: statusCode != null ? artifactStatusFromCode(statusCode) : "pending",
        };
      }
    }
    return { artifactId: null, status: "failed" };
  }
}

function extractCellText(cell: unknown): string {
  if (typeof cell === "string") return cell;
  if (typeof cell === "number") return "";
  if (Array.isArray(cell)) return cell.map(extractCellText).join("");
  return "";
}

function parseDataTable(rawData: unknown): DataTableContent {
  try {
    // Navigate: raw[0][0][0][0][4][2] → rows array
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nav = rawData as any;
    const rowsArray = nav[0][0][0][0][4][2] as unknown[][];
    if (!rowsArray?.length) throw new Error("Empty data table");

    const headers: string[] = [];
    const rows: string[][] = [];

    for (let i = 0; i < rowsArray.length; i++) {
      const rowSection = rowsArray[i];
      if (!Array.isArray(rowSection) || rowSection.length < 3) continue;
      const cellArray = rowSection[2] as unknown[];
      if (!Array.isArray(cellArray)) continue;
      const values = cellArray.map(extractCellText);
      if (i === 0) headers.push(...values);
      else rows.push(values);
    }

    if (!headers.length) throw new Error("No headers found");
    return { headers, rows };
  } catch (e) {
    throw new Error(`Failed to parse data table: ${e}`);
  }
}

function extractExportUrl(result: unknown): string | null {
  if (!Array.isArray(result)) return null;
  // Scan recursively for the first https URL
  function findUrl(data: unknown, depth = 5): string | null {
    if (depth <= 0 || data == null) return null;
    if (typeof data === "string" && data.startsWith("https://")) return data;
    if (Array.isArray(data)) {
      for (const item of data) {
        const found = findUrl(item, depth - 1);
        if (found) return found;
      }
    }
    return null;
  }
  return findUrl(result);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const TRUSTED_MEDIA_DOMAINS = [
  ".google.com",
  ".googleusercontent.com",
  ".googleapis.com",
  ".usercontent.google.com",
];

function isTrustedDomain(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return TRUSTED_MEDIA_DOMAINS.some((d) => host === d.slice(1) || host.endsWith(d));
  } catch {
    return false;
  }
}
