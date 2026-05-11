import { randomUUID } from "crypto";
import { mkdir, readFile, rename, rm, open } from "fs/promises";
import { homedir } from "os";
import { basename, dirname, join } from "path";

const MEMORY_VERSION = 4;
const MAX_FACTS_PER_SECTION = 30;
const MAX_FACT_LENGTH = 300;

const DEFAULT_MEMORY_PATH = join(
  process.env.HOME || homedir(),
  ".mcp-prose-memory",
  "memory.json"
);

export const SECTIONS = {
  work: "Work Context",
  personal: "Personal Context",
  top_of_mind: "Current Focus",
  history: "Brief History",
  instructions: "Other Instructions",
} as const;

type SectionKey = keyof typeof SECTIONS;
const SECTION_KEYS = Object.keys(SECTIONS) as SectionKey[];

interface MemoryData {
  version: number;
  updated: string;
  sections: Record<SectionKey, string[]>;
}

export interface MemoryStoreOptions {
  memoryPath?: string;
}

export class MemoryStore {
  private readonly memoryPath: string;

  constructor(options: MemoryStoreOptions = {}) {
    this.memoryPath =
      options.memoryPath || process.env.MEMORY_PATH || DEFAULT_MEMORY_PATH;
  }

  private async load(): Promise<MemoryData> {
    try {
      const raw = await readFile(this.memoryPath, "utf-8");
      return this.normalizeData(JSON.parse(raw));
    } catch (err: unknown) {
      const e = err as NodeJS.ErrnoException;
      if (e.code === "ENOENT") {
        return this.emptyData();
      }
      throw new Error(`Failed to load memory: ${e.message}`);
    }
  }

  // Atomic on a single filesystem: write a sibling temp file, fsync it, then rename.
  private async save(data: MemoryData): Promise<void> {
    data.version = MEMORY_VERSION;
    data.updated = new Date().toISOString();

    const targetDir = dirname(this.memoryPath);
    const tempPath = join(
      targetDir,
      `.${basename(this.memoryPath)}.${process.pid}.${randomUUID()}.tmp`
    );
    const payload = `${JSON.stringify(data, null, 2)}\n`;

    await mkdir(targetDir, { recursive: true });

    let handle: Awaited<ReturnType<typeof open>> | undefined;
    try {
      handle = await open(tempPath, "w", 0o600);
      await handle.writeFile(payload, "utf-8");
      await handle.sync();
      await handle.close();
      handle = undefined;
      await rename(tempPath, this.memoryPath);
    } catch (err) {
      if (handle) {
        await handle.close().catch(() => undefined);
      }
      await rm(tempPath, { force: true }).catch(() => undefined);
      throw err;
    }
  }

  /**
   * Get formatted memory for display/injection
   */
  async getFormatted(sectionFilter?: string): Promise<string> {
    if (sectionFilter) {
      this.validateSection(sectionFilter);
    }

    const data = await this.load();
    const lines: string[] = [];

    const sectionsToShow = sectionFilter
      ? { [sectionFilter]: SECTIONS[sectionFilter as SectionKey] }
      : SECTIONS;

    for (const [key, label] of Object.entries(sectionsToShow)) {
      const facts = data.sections[key as SectionKey] || [];
      if (facts.length === 0) continue;

      lines.push(`**${label}**\n`);
      facts.forEach((fact, i) => {
        lines.push(`${i + 1}. ${fact}`);
      });
      lines.push(""); // blank line between sections
    }

    if (lines.length === 0) {
      return sectionFilter
        ? `No facts in ${SECTIONS[sectionFilter as SectionKey] || sectionFilter}`
        : "No memories stored yet.";
    }

    return lines.join("\n").trim();
  }

  /**
   * Add a fact to a section
   */
  async addFact(
    section: string,
    fact: string
  ): Promise<{ line: number; fact: string }> {
    this.validateSection(section);
    const normalizedFact = this.normalizeFact(fact);

    const data = await this.load();
    const facts = data.sections[section as SectionKey];

    if (this.hasDuplicate(facts, normalizedFact)) {
      throw new Error("Duplicate fact already exists");
    }

    if (facts.length >= MAX_FACTS_PER_SECTION) {
      throw new Error(
        `Section "${section}" is full (max ${MAX_FACTS_PER_SECTION} facts). Remove old facts first.`
      );
    }

    facts.push(normalizedFact);
    await this.save(data);

    return { line: facts.length, fact: normalizedFact };
  }

  /**
   * Remove a fact by line number
   */
  async removeFact(section: string, line: number): Promise<string> {
    this.validateSection(section);

    const data = await this.load();
    const facts = data.sections[section as SectionKey];
    const index = this.validateLine(line, facts.length);

    const [removed] = facts.splice(index, 1);
    await this.save(data);

    return removed;
  }

  /**
   * Replace a fact by line number
   */
  async replaceFact(
    section: string,
    line: number,
    newFact: string
  ): Promise<{ old: string; new: string }> {
    this.validateSection(section);
    const normalizedFact = this.normalizeFact(newFact);

    const data = await this.load();
    const facts = data.sections[section as SectionKey];
    const index = this.validateLine(line, facts.length);

    if (this.hasDuplicate(facts, normalizedFact, index)) {
      throw new Error("Duplicate fact already exists");
    }

    const old = facts[index];
    facts[index] = normalizedFact;
    await this.save(data);

    return { old, new: normalizedFact };
  }

  private validateSection(section: string): void {
    if (!(section in SECTIONS)) {
      throw new Error(
        `Invalid section "${section}". Valid: ${Object.keys(SECTIONS).join(", ")}`
      );
    }
  }

  private validateLine(line: number, sectionLength: number): number {
    if (!Number.isInteger(line)) {
      throw new Error("Line number must be a whole number.");
    }

    if (line < 1 || line > sectionLength) {
      throw new Error(`Invalid line ${line}. Section has ${sectionLength} facts.`);
    }

    return line - 1;
  }

  private normalizeFact(fact: string): string {
    if (typeof fact !== "string") {
      throw new Error("Fact must be a string.");
    }

    const trimmed = fact.trim();
    if (!trimmed) {
      throw new Error("Fact cannot be empty or whitespace-only.");
    }

    if (trimmed.length > MAX_FACT_LENGTH) {
      throw new Error(`Fact too long (${trimmed.length} chars). Max ${MAX_FACT_LENGTH}.`);
    }

    return trimmed;
  }

  private hasDuplicate(
    facts: string[],
    fact: string,
    exceptIndex?: number
  ): boolean {
    const normalized = fact.toLowerCase();
    return facts.some(
      (existing, index) =>
        index !== exceptIndex && existing.toLowerCase() === normalized
    );
  }

  private emptyData(): MemoryData {
    return {
      version: MEMORY_VERSION,
      updated: new Date().toISOString(),
      sections: {
        work: [],
        personal: [],
        top_of_mind: [],
        history: [],
        instructions: [],
      },
    };
  }

  private normalizeData(data: unknown): MemoryData {
    if (!data || typeof data !== "object") {
      throw new Error("Memory file must contain a JSON object.");
    }

    const source = data as {
      updated?: unknown;
      sections?: unknown;
    };

    if (!source.sections || typeof source.sections !== "object") {
      throw new Error("Memory file must contain a sections object.");
    }

    const sourceSections = source.sections as Record<string, unknown>;
    const sections = {} as Record<SectionKey, string[]>;

    for (const key of SECTION_KEYS) {
      const facts = sourceSections[key];
      if (facts === undefined) {
        sections[key] = [];
        continue;
      }

      if (!Array.isArray(facts)) {
        throw new Error(`Section "${key}" must be an array of strings.`);
      }

      sections[key] = facts.map((fact, index) => {
        if (typeof fact !== "string") {
          throw new Error(`Section "${key}" line ${index + 1} must be a string.`);
        }
        return fact.trim();
      });
    }

    return {
      version: MEMORY_VERSION,
      updated:
        typeof source.updated === "string"
          ? source.updated
          : new Date().toISOString(),
      sections,
    };
  }
}
