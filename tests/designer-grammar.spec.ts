import { describe, expect, it } from "vitest";

import { BioParser } from "../services/grammar/parser";
import { BNGLGenerator } from "../services/grammar/generator";
import { validateInteractionSentence } from "../services/grammar/validator";
import { composeModelFromStatements } from "../packages/mcp-server/src/services/intelligence/compose";

const SIMPLE_DOC = [
  "Define A with sites b",
  "Define B with sites b",
  "A binds B",
  "Start with 100 of A",
  "Start with 50 of B",
  "Simulate for 10s with 200 steps",
].join("\n");

describe("Designer grammar ontology + validator", () => {
  it("parses compartment sentences correctly", () => {
    const sentences = BioParser.parseDocument(
      "Define compartment cytoplasm with volume 1 dim 3",
    );
    expect(sentences).toHaveLength(1);
    expect(sentences[0]).toMatchObject({
      type: "COMPARTMENT",
      name: "cytoplasm",
      volume: 1,
      dimension: 3,
      isValid: true,
    });
  });

  it("parses binding and simulation statements", () => {
    const sentences = BioParser.parseDocument(SIMPLE_DOC);
    const interactions = sentences.filter((s) => s.type === "INTERACTION");
    const sim = sentences.find((s) => s.type === "SIMULATION");

    expect(interactions).toHaveLength(1);
    expect(interactions[0]).toMatchObject({
      type: "INTERACTION",
      action: "binds",
      isBidirectional: true,
    });
    expect(sim).toBeDefined();
    expect((sim as any).duration).toBe(10);
    expect((sim as any).steps).toBe(200);
  });

  it("generates BNGL from parsed sentences", () => {
    const sentences = BioParser.parseDocument(SIMPLE_DOC);
    const bngl = BNGLGenerator.generate(sentences);

    expect(bngl).toContain("begin model");
    expect(bngl).toContain("begin reaction rules");
    expect(bngl).toContain("<->");
    expect(bngl).toContain(
      'simulate({method=>"ode", t_end=>10, n_steps=>200})',
    );
  });

  it("flags invalid lines with actionable error text", () => {
    const sentences = BioParser.parseDocument("This is not valid syntax");
    expect(sentences[0].type).toBe("INVALID");
    expect(sentences[0].isValid).toBe(false);
    expect(sentences[0].error?.message).toContain("Unrecognized sentence");
  });

  it("parses observables correctly", () => {
    const sentences = BioParser.parseDocument("Observe Lck as Lck_obs");
    expect(sentences).toHaveLength(1);
    expect(sentences[0]).toMatchObject({
      type: "OBSERVABLE",
      pattern: "Lck",
      name: "Lck_obs",
      isValid: true,
    });
  });

  it("validates interaction structure deterministically", () => {
    const valid = BioParser.parseDocument(
      "Kinase phosphorylates Target at y",
    )[0];
    expect(valid.type).toBe("INTERACTION");
    if (valid.type !== "INTERACTION") {
      throw new Error("Expected interaction sentence");
    }

    const check = validateInteractionSentence(valid);
    expect(check.isValid).toBe(true);
    expect(check.errors).toHaveLength(0);
  });
});

describe("Grammar parity between Designer and MCP", () => {
  it("MCP compose uses canonical services grammar output", () => {
    const canonicalSentences = BioParser.parseDocument(SIMPLE_DOC);
    const canonicalBNGL = BNGLGenerator.generate(canonicalSentences);
    const composed = composeModelFromStatements({
      statements: SIMPLE_DOC.split("\n").filter(
        (line) => line.trim().length > 0,
      ),
    });

    expect(composed.code).toEqual(canonicalBNGL);
    expect(composed.analysis.recognizedCount).toBeGreaterThan(0);
  });
});
