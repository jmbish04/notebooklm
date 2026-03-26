import type { RPCCore } from "../rpc/core.js";
import type { Note } from "../types/models.js";

import { RPCMethod } from "../types/enums.js";

export class NotesAPI {
  constructor(private readonly rpc: RPCCore) {}

  async list(notebookId: string): Promise<Note[]> {
    const all = await this._fetchAll(notebookId);
    return all.filter((n) => !this._isMindMap(n.content));
  }

  async get(notebookId: string, noteId: string): Promise<Note | null> {
    const all = await this._fetchAll(notebookId);
    return all.find((note) => note.id === noteId) ?? null;
  }

  async listMindMaps(notebookId: string): Promise<Note[]> {
    const all = await this._fetchAll(notebookId);
    return all.filter((n) => this._isMindMap(n.content));
  }

  async create(notebookId: string, content: string, title?: string): Promise<Note> {
    // CREATE_NOTE ignores content/title; creates an empty note and returns the ID.
    // We must call UPDATE_NOTE afterwards to set actual content and title.
    const createParams = [notebookId, "", [1], null, "New Note"];
    const result = await this.rpc.call(RPCMethod.CREATE_NOTE, createParams, {
      sourcePath: `/notebook/${notebookId}`,
      allowNull: true,
    });

    const noteId: string | null =
      Array.isArray(result) && Array.isArray(result[0]) && typeof result[0][0] === "string"
        ? (result[0][0] as string)
        : Array.isArray(result) && typeof result[0] === "string"
          ? (result[0] as string)
          : null;

    if (!noteId) throw new Error("CREATE_NOTE did not return a note ID");

    await this.update(notebookId, noteId, content, title ?? "New Note");
    return { id: noteId, title: title ?? null, content, createdAt: null, updatedAt: new Date() };
  }

  async update(notebookId: string, noteId: string, content: string, title?: string): Promise<Note> {
    const params = [notebookId, noteId, [[[content, title ?? "New Note", [], 0]]]];
    await this.rpc.call(RPCMethod.UPDATE_NOTE, params, {
      sourcePath: `/notebook/${notebookId}`,
      allowNull: true,
    });
    return { id: noteId, title: title ?? null, content, createdAt: null, updatedAt: new Date() };
  }

  async delete(notebookId: string, noteId: string): Promise<boolean> {
    const params = [notebookId, null, [noteId]];
    await this.rpc.call(RPCMethod.DELETE_NOTE, params, {
      sourcePath: `/notebook/${notebookId}`,
      allowNull: true,
    });
    return true;
  }

  async deleteMindMap(notebookId: string, mindMapId: string): Promise<boolean> {
    return this.delete(notebookId, mindMapId);
  }

  private async _fetchAll(notebookId: string): Promise<Note[]> {
    const result = await this.rpc.call(RPCMethod.GET_NOTES_AND_MIND_MAPS, [notebookId], {
      sourcePath: `/notebook/${notebookId}`,
      allowNull: true,
    });
    if (!Array.isArray(result) || !Array.isArray(result[0])) return [];
    const notes: Note[] = [];
    for (const item of result[0] as unknown[][]) {
      if (!Array.isArray(item) || typeof item[0] !== "string") continue;
      if (item[1] === null && item[2] === 2) continue; // deleted
      const content = this._extractContent(item);
      notes.push(this._parseItem(item, notebookId, content));
    }
    return notes;
  }

  private _isMindMap(content: string): boolean {
    return content.includes('"children":') || content.includes('"nodes":');
  }

  private _extractContent(item: unknown[]): string {
    if (typeof item[1] === "string") return item[1];
    if (Array.isArray(item[1]) && typeof item[1][1] === "string") return item[1][1] as string;
    return "";
  }

  private _parseItem(item: unknown[], _notebookId: string, content: string): Note {
    // New format: item[1] is [note_id, content, metadata, null, title]
    // Old format: item[1] is a plain string (no title available)
    const inner = Array.isArray(item[1]) ? (item[1] as unknown[]) : null;
    const title = inner && typeof inner[4] === "string" && inner[4] ? (inner[4] as string) : null;
    const createdAt =
      Array.isArray(item[3]) && typeof item[3][0] === "number"
        ? new Date((item[3][0] as number) * 1000)
        : null;
    return { id: item[0] as string, title, content, createdAt, updatedAt: null };
  }
}
