import { randomUUID } from "crypto";
import { mkdir, readFile, rename, rm, open } from "fs/promises";
import { homedir } from "os";
import { basename, dirname, join } from "path";

const MEMORY_VERSION = 5;
const MAX_FACTS_PER_SECTION = 30;
const MAX_FACT_LENGTH = 300;
const MAX_KEY_LENGTH = 80;

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
  user_profile: "User Profile",
  user_preferences: "User Preferences",
  eyra_project: "Eyra Project",
  devices_environment: "Devices and Environment",
  workflows: "Workflows",
  writing_style: "Writing Style",
  long_term_tasks: "Long-Term Tasks",
  do_not_forget: "Do Not Forget",
} as const;

type SectionKey = keyof typeof SECTIONS;
const SECTION_KEYS = Object.keys(SECTIONS) as SectionKey[];
type Confidence = "low" | "medium" | "high";

type StoredFact =
  | string
  | {
      key: string;
      value: string;
      confidence?: Confidence;
      source?: string;
      createdAt?: string;
      updatedAt?: string;
    };

interface MemoryData {
  version: number;
  updated: string;
  sections: Record<SectionKey, StoredFact[]>;
}

export interface MemoryStoreOptions {
  memoryPath?: string;
}

export interface StructuredFactInput {
  key?: string;
  value?: string;
  fact?: string;
  confidence?: Confidence;
  source?: string;
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
    return this.getContext({ sectionFilter, format: "formatted" });
  }

  async getContext(options: {
    sectionFilter?: string;
    sections?: string[];
    maxChars?: number;
    format?: "formatted" | "compact" | "json";
  } = {}): Promise<string> {
    const { sectionFilter, sections, maxChars, format = "formatted" } = options;
    if (sectionFilter) {
      this.validateSection(sectionFilter);
    }
    if (sections) {
      sections.forEach((section) => this.validateSection(section));
    }

    const data = await this.load();
    if (format === "json") {
      return this.clip(
        JSON.stringify({
          version: data.version,
          updated: data.updated,
          sections: this.filteredSections(data, sectionFilter, sections),
        }, null, 2),
        maxChars,
      );
    }

    const lines: string[] = [];

    const sectionsToShow = this.sectionEntries(sectionFilter, sections);

    for (const [key, label] of sectionsToShow) {
      const facts = data.sections[key as SectionKey] || [];
      if (facts.length === 0) continue;

      if (format === "compact") {
        lines.push(`${label}:`);
      } else {
        lines.push(`**${label}**\n`);
      }
      facts.forEach((fact, i) => {
        lines.push(`${i + 1}. ${this.renderFact(fact, format)}`);
      });
      lines.push(""); // blank line between sections
    }

    if (lines.length === 0) {
      return sectionFilter
        ? `No facts in ${SECTIONS[sectionFilter as SectionKey] || sectionFilter}`
        : "No memories stored yet.";
    }

    return this.clip(lines.join("\n").trim(), maxChars);
  }

  /**
   * Add a fact to a section
   */
  async addFact(
    section: string,
    fact: string | StructuredFactInput
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

    return { line: facts.length, fact: this.renderFact(normalizedFact, "compact") };
  }

  async upsertFact(
    section: string,
    fact: string | StructuredFactInput
  ): Promise<{ line: number; fact: string; action: "added" | "replaced" | "unchanged" }> {
    this.validateSection(section);
    const normalizedFact = this.normalizeFact(fact);
    const data = await this.load();
    const facts = data.sections[section as SectionKey];
    const existingIndex = this.findEquivalentIndex(facts, normalizedFact);
    if (existingIndex >= 0) {
      if (this.factsEqual(facts[existingIndex], normalizedFact)) {
        return { line: existingIndex + 1, fact: this.renderFact(facts[existingIndex], "compact"), action: "unchanged" };
      }
      facts[existingIndex] = this.withUpdatedAt(normalizedFact, facts[existingIndex]);
      await this.save(data);
      return { line: existingIndex + 1, fact: this.renderFact(facts[existingIndex], "compact"), action: "replaced" };
    }
    if (facts.length >= MAX_FACTS_PER_SECTION) {
      throw new Error(
        `Section "${section}" is full (max ${MAX_FACTS_PER_SECTION} facts). Remove old facts first.`
      );
    }
    facts.push(normalizedFact);
    await this.save(data);
    return { line: facts.length, fact: this.renderFact(normalizedFact, "compact"), action: "added" };
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

    return this.renderFact(removed, "compact");
  }

  /**
   * Replace a fact by line number
   */
  async replaceFact(
    section: string,
    line: number,
    newFact: string | StructuredFactInput
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
    facts[index] = this.withUpdatedAt(normalizedFact, old);
    await this.save(data);

    return { old: this.renderFact(old, "compact"), new: this.renderFact(facts[index], "compact") };
  }

  private validateSection(section: string): void {
    if (!Object.hasOwn(SECTIONS, section)) {
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

  private normalizeFact(fact: string | StructuredFactInput): StoredFact {
    if (typeof fact === "object" && fact !== null) {
      const key = this.normalizeKey(fact.key || "");
      const value = this.normalizeFactText(fact.value || fact.fact || "", "Value");
      const rendered = `${key}: ${value}`;
      if (rendered.length > MAX_FACT_LENGTH) {
        throw new Error(`Fact too long (${rendered.length} chars). Max ${MAX_FACT_LENGTH}.`);
      }
      const now = new Date().toISOString();
      return {
        key,
        value,
        confidence: fact.confidence || "high",
        source: this.optionalMeta(fact.source),
        createdAt: now,
        updatedAt: now,
      };
    }
    if (typeof fact !== "string") {
      throw new Error("Fact must be a string or structured fact.");
    }

    return this.normalizeFactText(fact, "Fact");
  }

  private normalizeFactText(value: string, label: string): string {
    if (typeof value !== "string") {
      throw new Error(`${label} must be a string.`);
    }
    const trimmed = value.trim().replace(/\s+/g, " ");
    if (!trimmed) {
      throw new Error(`${label} cannot be empty or whitespace-only.`);
    }
    if (trimmed.length > MAX_FACT_LENGTH) {
      throw new Error(`${label} too long (${trimmed.length} chars). Max ${MAX_FACT_LENGTH}.`);
    }
    return trimmed;
  }

  private normalizeKey(key: string): string {
    const trimmed = key.trim().toLowerCase().replace(/[^a-z0-9_.-]+/g, "_").replace(/^_+|_+$/g, "");
    if (!trimmed) {
      throw new Error("Key is required for structured facts.");
    }
    if (trimmed.length > MAX_KEY_LENGTH) {
      throw new Error(`Key too long (${trimmed.length} chars). Max ${MAX_KEY_LENGTH}.`);
    }
    return trimmed;
  }

  private optionalMeta(value: string | undefined): string | undefined {
    if (!value) return undefined;
    return value.trim().replace(/\s+/g, " ").slice(0, 80) || undefined;
  }

  private hasDuplicate(
    facts: StoredFact[],
    fact: StoredFact,
    exceptIndex?: number
  ): boolean {
    const normalized = this.comparisonKey(fact);
    return facts.some(
      (existing, index) =>
        index !== exceptIndex && this.comparisonKey(existing) === normalized
    );
  }

  private findEquivalentIndex(facts: StoredFact[], fact: StoredFact): number {
    const key = this.comparisonKey(fact);
    return facts.findIndex((existing) => this.comparisonKey(existing) === key || this.sameStructuredKey(existing, fact));
  }

  private sameStructuredKey(a: StoredFact, b: StoredFact): boolean {
    return typeof a === "object" && typeof b === "object" && a.key.toLowerCase() === b.key.toLowerCase();
  }

  private factsEqual(a: StoredFact, b: StoredFact): boolean {
    return this.renderFact(a, "compact").toLowerCase() === this.renderFact(b, "compact").toLowerCase();
  }

  private comparisonKey(fact: StoredFact): string {
    if (typeof fact === "string") {
      return fact.toLowerCase();
    }
    return `${fact.key}: ${fact.value}`.toLowerCase();
  }

  private withUpdatedAt(next: StoredFact, old: StoredFact): StoredFact {
    if (typeof next === "string") return next;
    const createdAt = typeof old === "object" ? old.createdAt : next.createdAt;
    return { ...next, createdAt, updatedAt: new Date().toISOString() };
  }

  private renderFact(fact: StoredFact, format: "formatted" | "compact" | "json"): string {
    if (typeof fact === "string") return fact;
    if (format === "json") return JSON.stringify(fact);
    return `${fact.key}: ${fact.value}`;
  }

  private sectionEntries(sectionFilter?: string, sections?: string[]): Array<[string, string]> {
    if (sectionFilter) {
      return [[sectionFilter, SECTIONS[sectionFilter as SectionKey]]];
    }
    if (sections && sections.length > 0) {
      return sections.map((section) => [section, SECTIONS[section as SectionKey]]);
    }
    return Object.entries(SECTIONS);
  }

  private filteredSections(data: MemoryData, sectionFilter?: string, sections?: string[]): Record<string, StoredFact[]> {
    const output: Record<string, StoredFact[]> = {};
    for (const [key] of this.sectionEntries(sectionFilter, sections)) {
      output[key] = data.sections[key as SectionKey] || [];
    }
    return output;
  }

  private clip(text: string, maxChars?: number): string {
    if (!maxChars || maxChars <= 0 || text.length <= maxChars) return text;
    return text.slice(0, Math.max(0, maxChars - 24)).trimEnd() + "\n...[context clipped]";
  }

  private emptyData(): MemoryData {
    return {
      version: MEMORY_VERSION,
      updated: new Date().toISOString(),
      sections: Object.fromEntries(SECTION_KEYS.map((key) => [key, []])) as unknown as Record<SectionKey, StoredFact[]>,
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
    const sections = {} as Record<SectionKey, StoredFact[]>;

    for (const key of SECTION_KEYS) {
      const facts = sourceSections[key];
      if (facts === undefined) {
        sections[key] = [];
        continue;
      }

      if (!Array.isArray(facts)) {
        throw new Error(`Section "${key}" must be an array of strings or structured facts.`);
      }

      sections[key] = facts.map((fact, index) => {
        if (typeof fact === "string") {
          return fact.trim();
        }
        if (!fact || typeof fact !== "object" || Array.isArray(fact)) {
          throw new Error(`Section "${key}" line ${index + 1} must be a string or structured fact.`);
        }
        const item = fact as Partial<Extract<StoredFact, object>>;
        const normalized = this.normalizeFact({
          key: String(item.key || ""),
          value: String(item.value || ""),
          confidence: item.confidence,
          source: item.source,
        });
        if (typeof normalized === "string") return normalized;
        return {
          ...normalized,
          createdAt: typeof item.createdAt === "string" ? item.createdAt : normalized.createdAt,
          updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : normalized.updatedAt,
        };
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
