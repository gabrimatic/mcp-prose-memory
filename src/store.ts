import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { dirname } from "path";
import { homedir } from "os";

export type SectionType = "work" | "personal" | "top_of_mind" | "history" | "instructions";

export interface DocumentMetadata {
  version: number;
  updated: string;
}

export interface MemoryDocument {
  metadata: DocumentMetadata;
  sections: Record<SectionType, string>;
}

const MEMORY_PATH = process.env.MEMORY_PATH || `${homedir()}/.mcp/memory.md`;

const SECTION_HEADERS: Record<SectionType, string> = {
  work: "## Work Context",
  personal: "## Personal Context",
  top_of_mind: "## Top of Mind",
  history: "## Brief History",
  instructions: "## Other Instructions",
};

const SECTION_ORDER: SectionType[] = ["work", "personal", "top_of_mind", "history", "instructions"];

async function ensureDir(path: string): Promise<void> {
  const dir = dirname(path);
  if (!existsSync(dir)) await mkdir(dir, { recursive: true });
}

function parseYamlFrontmatter(content: string): { metadata: DocumentMetadata; body: string } {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);

  if (!frontmatterMatch) {
    return {
      metadata: { version: 2, updated: new Date().toISOString() },
      body: content,
    };
  }

  const [, yaml, body] = frontmatterMatch;
  const metadata: DocumentMetadata = { version: 2, updated: new Date().toISOString() };

  for (const line of yaml.split("\n")) {
    const match = line.match(/^(\w+):\s*(.+)$/);
    if (match) {
      const [, key, value] = match;
      if (key === "version") metadata.version = parseInt(value, 10);
      if (key === "updated") metadata.updated = value;
    }
  }

  return { metadata, body };
}

function parseSections(body: string): Record<SectionType, string> {
  const sections: Record<SectionType, string> = {
    work: "",
    personal: "",
    top_of_mind: "",
    history: "",
    instructions: "",
  };

  const sectionPattern = /^## (Work Context|Personal Context|Top of Mind|Brief History|Other Instructions)\n/gm;
  const headerToType: Record<string, SectionType> = {
    "Work Context": "work",
    "Personal Context": "personal",
    "Top of Mind": "top_of_mind",
    "Brief History": "history",
    "Other Instructions": "instructions",
  };

  const matches: Array<{ type: SectionType; start: number; headerEnd: number }> = [];
  let match: RegExpExecArray | null;

  while ((match = sectionPattern.exec(body)) !== null) {
    const type = headerToType[match[1]];
    if (type) {
      matches.push({
        type,
        start: match.index,
        headerEnd: match.index + match[0].length,
      });
    }
  }

  for (let i = 0; i < matches.length; i++) {
    const current = matches[i];
    const nextStart = matches[i + 1]?.start ?? body.length;
    const content = body.slice(current.headerEnd, nextStart).trim();
    sections[current.type] = content;
  }

  return sections;
}

function serializeDocument(doc: MemoryDocument): string {
  const lines: string[] = [
    "---",
    `version: ${doc.metadata.version}`,
    `updated: ${doc.metadata.updated}`,
    "---",
    "",
  ];

  for (const sectionType of SECTION_ORDER) {
    lines.push(SECTION_HEADERS[sectionType]);
    lines.push("");
    const content = doc.sections[sectionType];
    if (content) {
      lines.push(content);
      lines.push("");
    }
  }

  return lines.join("\n");
}

export async function loadDocument(): Promise<MemoryDocument> {
  try {
    const content = await readFile(MEMORY_PATH, "utf-8");
    const { metadata, body } = parseYamlFrontmatter(content);
    const sections = parseSections(body);
    return { metadata, sections };
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") {
      return {
        metadata: { version: 2, updated: new Date().toISOString() },
        sections: {
          work: "",
          personal: "",
          top_of_mind: "",
          history: "",
          instructions: "",
        },
      };
    }
    throw e;
  }
}

export async function saveDocument(doc: MemoryDocument): Promise<void> {
  doc.metadata.updated = new Date().toISOString();
  await ensureDir(MEMORY_PATH);
  await writeFile(MEMORY_PATH, serializeDocument(doc));
}

export async function getSection(sectionType: SectionType): Promise<string> {
  const doc = await loadDocument();
  return doc.sections[sectionType];
}

export async function updateSection(sectionType: SectionType, content: string): Promise<MemoryDocument> {
  const doc = await loadDocument();
  doc.sections[sectionType] = content.trim();
  await saveDocument(doc);
  return doc;
}

export async function getFullContext(): Promise<string> {
  try {
    return await readFile(MEMORY_PATH, "utf-8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") {
      return "";
    }
    throw e;
  }
}

export async function appendToSection(sectionType: SectionType, fact: string): Promise<void> {
  const doc = await loadDocument();
  const existing = doc.sections[sectionType].trim();
  doc.sections[sectionType] = existing ? `${existing}\n- ${fact.trim()}` : `- ${fact.trim()}`;
  await saveDocument(doc);
}

export { MEMORY_PATH, SECTION_ORDER, SECTION_HEADERS };
