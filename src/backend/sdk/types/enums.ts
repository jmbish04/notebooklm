/** RPC method IDs for NotebookLM batchexecute API. */
export const RPCMethod = {
  // Notebook
  LIST_NOTEBOOKS: "wXbhsf",
  CREATE_NOTEBOOK: "CCqFvf",
  GET_NOTEBOOK: "rLM1Ne",
  RENAME_NOTEBOOK: "s0tc2d",
  DELETE_NOTEBOOK: "WWINqb",
  // Sources
  ADD_SOURCE: "izAoDd",
  ADD_SOURCE_FILE: "o4cbdc",
  DELETE_SOURCE: "tGMBJ",
  GET_SOURCE: "hizoJc",
  REFRESH_SOURCE: "FLmJqe",
  CHECK_SOURCE_FRESHNESS: "yR9Yof",
  UPDATE_SOURCE: "b7Wfje",
  // Summary
  SUMMARIZE: "VfAZjd",
  GET_SOURCE_GUIDE: "tr032e",
  GET_SUGGESTED_REPORTS: "ciyUvf",
  // Artifacts
  CREATE_ARTIFACT: "R7cb6c",
  LIST_ARTIFACTS: "gArtLc",
  DELETE_ARTIFACT: "V5N4be",
  RENAME_ARTIFACT: "rc3d8d",
  EXPORT_ARTIFACT: "Krh3pd",
  SHARE_ARTIFACT: "RGP97b",
  GET_INTERACTIVE_HTML: "v9rmvd",
  REVISE_SLIDE: "KmcKPe",
  // Research
  START_FAST_RESEARCH: "Ljjv0c",
  START_DEEP_RESEARCH: "QA9ei",
  POLL_RESEARCH: "e3bVqc",
  IMPORT_RESEARCH: "LBwxtb",
  // Notes / Mind Maps
  GENERATE_MIND_MAP: "yyryJe",
  CREATE_NOTE: "CYK0Xb",
  GET_NOTES_AND_MIND_MAPS: "cFji9",
  UPDATE_NOTE: "cYAfTb",
  DELETE_NOTE: "AH0mwd",
  // Conversation
  GET_LAST_CONVERSATION_ID: "hPTbtc",
  GET_CONVERSATION_TURNS: "khqZz",
  // Sharing
  SHARE_NOTEBOOK: "QDyure",
  GET_SHARE_STATUS: "JFMDGd",
  // Misc
  REMOVE_RECENTLY_VIEWED: "fejl7e",
  GET_USER_SETTINGS: "ZwVcOc",
  SET_USER_SETTINGS: "hT54vc",
} as const;

export type RPCMethodId = (typeof RPCMethod)[keyof typeof RPCMethod];

// ---------------------------------------------------------------------------
// Artifact type codes (used in RPC calls)
// ---------------------------------------------------------------------------

export const ArtifactTypeCode = {
  AUDIO: 1,
  REPORT: 2,
  VIDEO: 3,
  QUIZ: 4,
  MIND_MAP: 5,
  INFOGRAPHIC: 7,
  SLIDE_DECK: 8,
  DATA_TABLE: 9,
} as const;

export type ArtifactTypeCodeValue = (typeof ArtifactTypeCode)[keyof typeof ArtifactTypeCode];

// ---------------------------------------------------------------------------
// Artifact status codes
// ---------------------------------------------------------------------------

export const ArtifactStatusCode = {
  PROCESSING: 1,
  PENDING: 2,
  COMPLETED: 3,
  FAILED: 4,
} as const;

export type ArtifactStatusCodeValue = (typeof ArtifactStatusCode)[keyof typeof ArtifactStatusCode];

// ---------------------------------------------------------------------------
// Source status codes
// ---------------------------------------------------------------------------

export const SourceStatusCode = {
  PROCESSING: 1,
  READY: 2,
  ERROR: 3,
  PREPARING: 5,
} as const;

export type SourceStatusCodeValue = (typeof SourceStatusCode)[keyof typeof SourceStatusCode];

// ---------------------------------------------------------------------------
// User-facing string enums
// ---------------------------------------------------------------------------

/** User-facing source type strings. */
export type SourceType =
  | "google_docs"
  | "google_slides"
  | "google_spreadsheet"
  | "pdf"
  | "pasted_text"
  | "web_page"
  | "youtube"
  | "markdown"
  | "docx"
  | "csv"
  | "image"
  | "media"
  | "unknown";

/** User-facing artifact type strings. */
export type ArtifactType =
  | "audio"
  | "video"
  | "report"
  | "quiz"
  | "flashcards"
  | "mind_map"
  | "infographic"
  | "slide_deck"
  | "data_table"
  | "unknown";

/** User-facing artifact status strings. */
export type ArtifactStatus = "in_progress" | "pending" | "completed" | "failed" | "unknown";

/** User-facing source status strings. */
export type SourceStatus = "processing" | "ready" | "error" | "preparing" | "unknown";

// ---------------------------------------------------------------------------
// Format options (passed to RPC)
// ---------------------------------------------------------------------------

export const AudioFormat = {
  DEEP_DIVE: 1,
  BRIEF: 2,
  CRITIQUE: 3,
  DEBATE: 4,
} as const;
export type AudioFormatValue = (typeof AudioFormat)[keyof typeof AudioFormat];

export const AudioLength = {
  SHORT: 1,
  DEFAULT: 2,
  LONG: 3,
} as const;
export type AudioLengthValue = (typeof AudioLength)[keyof typeof AudioLength];

export const VideoFormat = {
  EXPLAINER: 1,
  BRIEF: 2,
  CINEMATIC: 3,
} as const;
export type VideoFormatValue = (typeof VideoFormat)[keyof typeof VideoFormat];

export const VideoStyle = {
  AUTO_SELECT: 1,
  CUSTOM: 2,
  CLASSIC: 3,
  WHITEBOARD: 4,
  KAWAII: 5,
  ANIME: 6,
  WATERCOLOR: 7,
  RETRO_PRINT: 8,
  HERITAGE: 9,
  PAPER_CRAFT: 10,
} as const;
export type VideoStyleValue = (typeof VideoStyle)[keyof typeof VideoStyle];

export const QuizQuantity = {
  FEWER: 1,
  STANDARD: 2,
  MORE: 2, // API limitation: same as STANDARD
} as const;
export type QuizQuantityValue = (typeof QuizQuantity)[keyof typeof QuizQuantity];

export const QuizDifficulty = {
  EASY: 1,
  MEDIUM: 2,
  HARD: 3,
} as const;
export type QuizDifficultyValue = (typeof QuizDifficulty)[keyof typeof QuizDifficulty];

export const InfographicOrientation = {
  LANDSCAPE: 1,
  PORTRAIT: 2,
  SQUARE: 3,
} as const;
export type InfographicOrientationValue =
  (typeof InfographicOrientation)[keyof typeof InfographicOrientation];

export const InfographicDetail = {
  CONCISE: 1,
  STANDARD: 2,
  DETAILED: 3,
} as const;
export type InfographicDetailValue = (typeof InfographicDetail)[keyof typeof InfographicDetail];

export const InfographicStyle = {
  AUTO_SELECT: 1,
  SKETCH_NOTE: 2,
  PROFESSIONAL: 3,
  BENTO_GRID: 4,
  EDITORIAL: 5,
  INSTRUCTIONAL: 6,
  BRICKS: 7,
  CLAY: 8,
  ANIME: 9,
  KAWAII: 10,
  SCIENTIFIC: 11,
} as const;
export type InfographicStyleValue = (typeof InfographicStyle)[keyof typeof InfographicStyle];

export const SlideDeckFormat = {
  DETAILED_DECK: 1,
  PRESENTER_SLIDES: 2,
} as const;
export type SlideDeckFormatValue = (typeof SlideDeckFormat)[keyof typeof SlideDeckFormat];

export const SlideDeckLength = {
  DEFAULT: 1,
  SHORT: 2,
} as const;
export type SlideDeckLengthValue = (typeof SlideDeckLength)[keyof typeof SlideDeckLength];

export const ExportType = {
  DOCS: 1,
  SHEETS: 2,
} as const;
export type ExportTypeValue = (typeof ExportType)[keyof typeof ExportType];

export const DriveMimeType = {
  GOOGLE_DOC: "application/vnd.google-apps.document",
  GOOGLE_SLIDES: "application/vnd.google-apps.presentation",
  GOOGLE_SHEETS: "application/vnd.google-apps.spreadsheet",
  PDF: "application/pdf",
} as const;
export type DriveMimeTypeValue = (typeof DriveMimeType)[keyof typeof DriveMimeType];

// ---------------------------------------------------------------------------
// Internal mappings
// ---------------------------------------------------------------------------

const SOURCE_TYPE_MAP: Record<number, SourceType> = {
  1: "google_docs",
  2: "google_slides",
  3: "pdf",
  4: "pasted_text",
  5: "web_page",
  8: "markdown",
  9: "youtube",
  10: "media",
  11: "docx",
  13: "image",
  14: "google_spreadsheet",
  16: "csv",
};

const ARTIFACT_TYPE_MAP: Record<number, ArtifactType> = {
  1: "audio",
  2: "report",
  3: "video",
  5: "mind_map",
  7: "infographic",
  8: "slide_deck",
  9: "data_table",
};

const ARTIFACT_STATUS_MAP: Record<number, ArtifactStatus> = {
  1: "in_progress",
  2: "pending",
  3: "completed",
  4: "failed",
};

const SOURCE_STATUS_MAP: Record<number, SourceStatus> = {
  1: "processing",
  2: "ready",
  3: "error",
  5: "preparing",
};

export function sourceTypeFromCode(code: number | null | undefined): SourceType {
  if (code == null) return "unknown";
  return SOURCE_TYPE_MAP[code] ?? "unknown";
}

export function artifactTypeFromCode(typeCode: number, variant?: number | null): ArtifactType {
  // Quiz (4) and flashcards both use type 4, distinguished by variant
  if (typeCode === 4) {
    if (variant === 1) return "flashcards";
    if (variant === 2) return "quiz";
    return "unknown";
  }
  return ARTIFACT_TYPE_MAP[typeCode] ?? "unknown";
}

export function artifactStatusFromCode(code: number): ArtifactStatus {
  return ARTIFACT_STATUS_MAP[code] ?? "unknown";
}

export function sourceStatusFromCode(code: number): SourceStatus {
  return SOURCE_STATUS_MAP[code] ?? "unknown";
}

// ---------------------------------------------------------------------------
// Chat mode
// ---------------------------------------------------------------------------

/**
 * Predefined chat modes that control response style and verbosity.
 * Applied per-notebook via `client.chat.setMode()`.
 */
export const ChatMode = {
  /** General purpose — balanced length and style. */
  DEFAULT: "default",
  /** Educational focus with longer, learning-oriented responses. */
  LEARNING_GUIDE: "learning_guide",
  /** Short, concise answers. */
  CONCISE: "concise",
  /** Verbose, detailed answers. */
  DETAILED: "detailed",
} as const;

export type ChatModeValue = (typeof ChatMode)[keyof typeof ChatMode];

// Internal goal/length codes used by the RPC
const CHAT_MODE_PARAMS: Record<ChatModeValue, [goal: number, length: number]> = {
  default: [1, 1],
  learning_guide: [3, 4],
  concise: [1, 5],
  detailed: [1, 4],
};

export function chatModeToParams(mode: ChatModeValue): [goal: number, length: number] {
  return CHAT_MODE_PARAMS[mode];
}

export const ChatGoal = {
  /** General purpose research and brainstorming. */
  DEFAULT: 1,
  /** Custom instructions (up to 10,000 characters). */
  CUSTOM: 2,
  /** Educational focus with learning-oriented responses. */
  LEARNING_GUIDE: 3,
} as const;
export type ChatGoalValue = (typeof ChatGoal)[keyof typeof ChatGoal];

export const ChatResponseLength = {
  /** Standard response length. */
  DEFAULT: 1,
  /** Verbose, detailed responses. */
  LONGER: 4,
  /** Concise, brief responses. */
  SHORTER: 5,
} as const;
export type ChatResponseLengthValue = (typeof ChatResponseLength)[keyof typeof ChatResponseLength];

// ---------------------------------------------------------------------------
// Sharing enums
// ---------------------------------------------------------------------------

export const ShareAccess = {
  /** Only explicitly shared users can access */
  RESTRICTED: 0,
  /** Anyone with the link can access */
  ANYONE_WITH_LINK: 1,
} as const;

export type ShareAccessValue = (typeof ShareAccess)[keyof typeof ShareAccess];

export const ShareViewLevel = {
  /** Chat + sources + notes */
  FULL_NOTEBOOK: 0,
  /** Chat interface only */
  CHAT_ONLY: 1,
} as const;

export type ShareViewLevelValue = (typeof ShareViewLevel)[keyof typeof ShareViewLevel];

export const SharePermission = {
  OWNER: 1,
  EDITOR: 2,
  VIEWER: 3,
  /** Internal: remove user from share list */
  _REMOVE: 4,
} as const;

export type SharePermissionValue = (typeof SharePermission)[keyof typeof SharePermission];
