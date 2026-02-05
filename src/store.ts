import { readFile, writeFile, mkdir } from "fs/promises";
import { dirname } from "path";

const MEMORY_PATH = process.env.MEMORY_PATH || `${process.env.HOME}/.claude/memory.json`;

// Section definitions with display order
const SECTIONS = {
  work: "Work Context",
  personal: "Personal Context",
  top_of_mind: "Top of Mind",
  history: "Brief History",
  instructions: "Other Instructions",
} as const;

type SectionKey = keyof typeof SECTIONS;

interface MemoryData {
  version: number;
  updated: string;
  sections: Record<SectionKey, string[]>;
}

export class MemoryStore {
  private async load(): Promise<MemoryData> {
    try {
      const raw = await readFile(MEMORY_PATH, "utf-8");
      return JSON.parse(raw);
    } catch (err: unknown) {
      const e = err as NodeJS.ErrnoException;
      if (e.code === "ENOENT") {
        // File doesn't exist - return empty structure
        return {
          version: 4,
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
      // JSON parse error or other issue - don't silently wipe memory
      throw new Error(`Failed to load memory: ${e.message}`);
    }
  }

  // Note: Not thread-safe. Relies on MCP stdio transport being single-threaded.
  private async save(data: MemoryData): Promise<void> {
    data.updated = new Date().toISOString();
    await mkdir(dirname(MEMORY_PATH), { recursive: true });
    await writeFile(MEMORY_PATH, JSON.stringify(data, null, 2), "utf-8");
  }

  /**
   * Get formatted memory for display/injection
   */
  async getFormatted(sectionFilter?: string): Promise<string> {
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

    if (fact.length > 300) {
      throw new Error(`Fact too long (${fact.length} chars). Max 300.`);
    }

    const data = await this.load();
    const facts = data.sections[section as SectionKey];

    // Check for duplicates (case-insensitive)
    const normalized = fact.toLowerCase();
    if (facts.some((f) => f.toLowerCase() === normalized)) {
      throw new Error("Duplicate fact already exists");
    }

    // Limit per section (30 facts max)
    if (facts.length >= 30) {
      throw new Error(`Section "${section}" is full (max 30 facts). Remove old facts first.`);
    }

    facts.push(fact);
    await this.save(data);

    return { line: facts.length, fact };
  }

  /**
   * Remove a fact by line number
   */
  async removeFact(section: string, line: number): Promise<string> {
    this.validateSection(section);

    const data = await this.load();
    const facts = data.sections[section as SectionKey];

    if (line < 1 || line > facts.length) {
      throw new Error(`Invalid line ${line}. Section has ${facts.length} facts.`);
    }

    const [removed] = facts.splice(line - 1, 1);
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

    if (newFact.length > 300) {
      throw new Error(`Fact too long (${newFact.length} chars). Max 300.`);
    }

    const data = await this.load();
    const facts = data.sections[section as SectionKey];

    if (line < 1 || line > facts.length) {
      throw new Error(`Invalid line ${line}. Section has ${facts.length} facts.`);
    }

    const old = facts[line - 1];
    facts[line - 1] = newFact;
    await this.save(data);

    return { old, new: newFact };
  }

  private validateSection(section: string): void {
    if (!(section in SECTIONS)) {
      throw new Error(
        `Invalid section "${section}". Valid: ${Object.keys(SECTIONS).join(", ")}`
      );
    }
  }
}
