import path from "path";
import fs from "fs";

export interface ChatMessage {
  id: string;
  role: "system" | "user" | "assistant";
  content: string;
  createdAt: number;
}

export interface Chat {
  id: string;
  title: string;
  messages: ChatMessage[];
  modelId?: string;
  systemPrompt?: string;
  createdAt: number;
  updatedAt: number;
}

export async function listChats(chatsDir: string): Promise<Chat[]> {
  if (!fs.existsSync(chatsDir)) return [];
  const files = fs.readdirSync(chatsDir).filter((f) => f.endsWith(".json"));
  const out: Chat[] = [];
  for (const f of files) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(chatsDir, f), "utf-8"));
      out.push(data);
    } catch {}
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getChat(chatsDir: string, id: string): Promise<Chat | null> {
  const file = path.join(chatsDir, `${id}.json`);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8")) as Chat;
  } catch {
    return null;
  }
}

export async function saveChat(chatsDir: string, chat: unknown): Promise<Chat> {
  const c = chat as Chat;
  c.updatedAt = Date.now();
  const file = path.join(chatsDir, `${c.id}.json`);
  fs.writeFileSync(file, JSON.stringify(c, null, 2));
  return c;
}

export async function deleteChat(chatsDir: string, id: string): Promise<boolean> {
  const file = path.join(chatsDir, `${id}.json`);
  if (fs.existsSync(file)) {
    fs.unlinkSync(file);
    return true;
  }
  return false;
}
