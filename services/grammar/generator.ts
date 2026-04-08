import {
  BioSentence,
  InteractionSentence,
  DefinitionSentence,
  InitializationSentence,
  SimulationSentence,
  ObservableSentence,
} from "./types";
import {
  ACTION_SITE_CONFIG,
  DEFAULT_PARAMETER_VALUES,
  defaultForwardRate,
  defaultReverseRate,
} from "./ontology";

const isNumericToken = (value: string): boolean => /^[0-9.e-]+$/i.test(value);

export class BNGLGenerator {
  static generate(sentences: BioSentence[]): string {
    const definitions = sentences.filter(
      (s) => s.type === "DEFINITION" && s.isValid,
    ) as DefinitionSentence[];
    const interactions = sentences.filter(
      (s) => s.type === "INTERACTION" && s.isValid,
    ) as InteractionSentence[];
    const initializations = sentences.filter(
      (s) => s.type === "INITIALIZATION" && s.isValid,
    ) as InitializationSentence[];
    const simulation = sentences.find(
      (s) => s.type === "SIMULATION" && s.isValid,
    ) as SimulationSentence | undefined;
    const observables = sentences.filter(
      (s) => s.type === "OBSERVABLE" && s.isValid,
    ) as ObservableSentence[];

    // Symbol Table: Track defined molecules and their sites/states
    const moleculeMap = new Map<
      string,
      { sites: Set<string>; states: Record<string, Set<string>> }
    >();

    // 1. Process Definitions
    definitions.forEach((def) => {
      const { name, sites, states } = def.agent;
      if (!moleculeMap.has(name)) {
        moleculeMap.set(name, { sites: new Set(sites), states: {} });
      }
      const entry = moleculeMap.get(name)!;
      sites.forEach((s) => entry.sites.add(s));
      Object.entries(states).forEach(([site, stateList]) => {
        if (!entry.states[site]) entry.states[site] = new Set();
        stateList.forEach((st) => entry.states[site].add(st));
      });
    });

    // 2. Infer Sites from Interactions (Implicit Definitions)
    interactions.forEach((int) => {
      const subName = int.subject.name;
      const objName = int.object.name;

      // Ensure molecules exist (except Null for degradation)
      [subName, objName].forEach((name) => {
        if (name !== "Null" && !moleculeMap.has(name)) {
          moleculeMap.set(name, { sites: new Set(), states: {} });
        }
      });

      if (int.action === "binds" || int.action === "dimerizes") {
        // Binding site 'b'
        if (subName !== "Null") moleculeMap.get(subName)!.sites.add("b");
        if (objName !== "Null") moleculeMap.get(objName)!.sites.add("b");
      } else if (int.action === "synthesizes") {
        // Object is created - ensure it exists
        if (!moleculeMap.has(objName)) {
          moleculeMap.set(objName, { sites: new Set(), states: {} });
        }
      } else if (int.action === "degrades") {
        // Target is degraded - no special sites needed
      } else if (int.action === "translocates") {
        // Target gets a location/compartment marker
        const targetEntry = moleculeMap.get(subName)!;
        targetEntry.sites.add("loc");
        if (!targetEntry.states["loc"]) targetEntry.states["loc"] = new Set();
        targetEntry.states["loc"].add("cyt");
        if (int.targetCompartment) {
          targetEntry.states["loc"].add(
            int.targetCompartment.substring(0, 3).toLowerCase(),
          );
        }
      } else {
        // Modification actions (phosphorylation, ubiquitination, etc.)
        const config = ACTION_SITE_CONFIG[int.action];
        if (config && objName !== "Null") {
          const targetEntry = moleculeMap.get(objName)!;
          const siteToUse = int.site || config.site;
          targetEntry.sites.add(siteToUse);
          if (!targetEntry.states[siteToUse])
            targetEntry.states[siteToUse] = new Set();
          config.states.forEach((st) => targetEntry.states[siteToUse].add(st));
        }
      }
    });

    // Collect rates actually referenced by generated rules to avoid noisy parameter blocks.
    const requiredRates = new Set<string>();
    interactions.forEach((int) => {
      const fwd = int.rate || defaultForwardRate(int.action);
      if (!isNumericToken(fwd)) requiredRates.add(fwd);

      const needsReverse =
        int.isBidirectional ||
        int.action === "binds" ||
        int.action === "dimerizes";
      if (needsReverse) {
        const rev = int.reverseRate || defaultReverseRate(int.action);
        if (!isNumericToken(rev)) requiredRates.add(rev);
      }
    });

    // 3. Generate BNGL Blocks
    const lines: string[] = ["begin model"];

    // Parameters
    lines.push("begin parameters");
    lines.push("  # Auto-generated rate constants");
    const sortedRates = Array.from(requiredRates).sort();
    const emittedRates = sortedRates.length > 0 ? sortedRates : ["k_fwd"];
    emittedRates.forEach((rateName) => {
      const defaultValue = DEFAULT_PARAMETER_VALUES[rateName] ?? 1.0;
      lines.push(`  ${rateName} ${defaultValue}`);
    });
    lines.push("end parameters");

    // Molecule Types
    lines.push("begin molecule types");
    moleculeMap.forEach((data, name) => {
      const siteStrParts: string[] = [];
      data.sites.forEach((site) => {
        const states = data.states[site];
        if (states && states.size > 0) {
          siteStrParts.push(`${site}~${Array.from(states).join("~")}`);
        } else {
          siteStrParts.push(site);
        }
      });
      lines.push(`  ${name}(${siteStrParts.join(",")})`);
    });
    // Add Trash() for degradation sink
    if (interactions.some((i) => i.action === "degrades")) {
      lines.push("  Trash()");
    }
    lines.push("end molecule types");

    // Seed Species
    lines.push("begin seed species");
    if (initializations.length > 0) {
      initializations.forEach((init) => {
        const name = init.molecule.name;
        const entry = moleculeMap.get(name);
        if (entry) {
          const sitesStr = Array.from(entry.sites)
            .map((s) => {
              const states = entry.states[s];
              // Pick "inactive" or "unmodified" state as default
              if (states && states.has("u")) return `${s}~u`;
              if (states && states.has("n")) return `${s}~n`;
              if (states && states.has("i")) return `${s}~i`;
              if (states && states.has("cyt")) return `${s}~cyt`;
              if (states && states.size > 0)
                return `${s}~${Array.from(states)[0]}`;
              return s;
            })
            .join(",");
          lines.push(`  ${name}(${sitesStr}) ${init.count}`);
        }
      });
    } else {
      lines.push("  # Default seeds generated by Designer");
      moleculeMap.forEach((_, name) => {
        const entry = moleculeMap.get(name)!;
        const sitesStr = Array.from(entry.sites)
          .map((s) => {
            const states = entry.states[s];
            if (states && states.has("u")) return `${s}~u`;
            if (states && states.has("n")) return `${s}~n`;
            if (states && states.has("i")) return `${s}~i`;
            if (states && states.has("cyt")) return `${s}~cyt`;
            if (states && states.size > 0)
              return `${s}~${Array.from(states)[0]}`;
            return s;
          })
          .join(",");
        lines.push(`  ${name}(${sitesStr}) 100`);
      });
    }
    lines.push("end seed species");

    // Observables
    lines.push("begin observables");
    if (observables.length > 0) {
      lines.push("  # User-defined observables");
      observables.forEach((obs) => {
        const obsName = obs.name || `Obs_${obs.pattern.replace(/\W+/g, '_')}`;
        const patternWithParens = obs.pattern.includes('(') ? obs.pattern : `${obs.pattern}()`;
        lines.push(`  Molecules ${obsName} ${patternWithParens}`);
      });
    }
    lines.push("  # Auto-generated observables");
    moleculeMap.forEach((data, name) => {
      lines.push(`  Molecules ${name}_total ${name}()`);
      // Add state-specific observables for modified sites
      data.sites.forEach((site) => {
        const states = data.states[site];
        if (states && states.size > 1) {
          states.forEach((state) => {
            lines.push(
              `  Molecules ${name}_${site}_${state} ${name}(${site}~${state})`,
            );
          });
        }
      });
    });
    lines.push("end observables");

    // Reaction Rules
    lines.push("begin reaction rules");
    interactions.forEach((int, idx) => {
      const ruleName = `rule${idx + 1}`;
      const s = int.subject.name;
      const o = int.object.name;
      const rate = int.rate || defaultForwardRate(int.action);
      const revRate = int.reverseRate || defaultReverseRate(int.action);

      switch (int.action) {
        case "binds":
          lines.push(
            `  ${ruleName}: ${s}(b) + ${o}(b) <-> ${s}(b!1).${o}(b!1) ${rate}, ${revRate}`,
          );
          break;

        case "dimerizes":
          if (s === o) {
            // Homodimerization
            lines.push(
              `  ${ruleName}: ${s}(b) + ${s}(b) <-> ${s}(b!1).${s}(b!1) ${rate}, ${revRate}`,
            );
          } else {
            // Heterodimerization
            lines.push(
              `  ${ruleName}: ${s}(b) + ${o}(b) <-> ${s}(b!1).${o}(b!1) ${rate}, ${revRate}`,
            );
          }
          break;

        case "phosphorylates":
        case "dephosphorylates":
        case "ubiquitinates":
        case "deubiquitinates":
        case "methylates":
        case "demethylates":
        case "acetylates":
        case "deacetylates":
        case "activates":
        case "inhibits":
        case "cleaves": {
          const config = ACTION_SITE_CONFIG[int.action];
          if (config) {
            const siteToUse = int.site || config.site;
            lines.push(
              `  ${ruleName}: ${s}() + ${o}(${siteToUse}~${config.modFrom}) -> ${s}() + ${o}(${siteToUse}~${config.modTo}) ${rate}`,
            );
          }
          break;
        }

        case "synthesizes":
          // Source produces target from nothing
          const objEntry = moleculeMap.get(o);
          if (objEntry) {
            const objSitesStr = Array.from(objEntry.sites)
              .map((site) => {
                const states = objEntry.states[site];
                if (states && states.has("u")) return `${site}~u`;
                if (states && states.has("n")) return `${site}~n`;
                if (states && states.has("i")) return `${site}~i`;
                if (states && states.size > 0)
                  return `${site}~${Array.from(states)[0]}`;
                return site;
              })
              .join(",");
            lines.push(`  ${ruleName}: 0 -> ${o}(${objSitesStr}) ${rate}`);
          }
          break;

        case "degrades":
          // Target is degraded to nothing
          if (s === "Null") {
            // Spontaneous degradation
            lines.push(`  ${ruleName}: ${o}() -> 0 ${rate}`);
          } else {
            // Enzyme-mediated degradation
            lines.push(`  ${ruleName}: ${s}() + ${o}() -> ${s}() ${rate}`);
          }
          break;

        case "translocates": {
          const fromLoc = "cyt";
          const toLoc =
            int.targetCompartment?.substring(0, 3).toLowerCase() || "mem";
          lines.push(
            `  ${ruleName}: ${s}(loc~${fromLoc}) -> ${s}(loc~${toLoc}) ${rate}`,
          );
          break;
        }

        default:
          lines.push(
            `  # ${ruleName}: Unhandled action '${int.action}' for ${s} -> ${o}`,
          );
      }
    });
    lines.push("end reaction rules");

    lines.push("end model");
    lines.push("generate_network({overwrite=>1})");

    if (simulation) {
      lines.push(
        `simulate({method=>"ode", t_end=>${simulation.duration}, n_steps=>${simulation.steps}})`,
      );
    } else {
      lines.push('simulate({method=>"ode", t_end=>100, n_steps=>100})');
    }

    return lines.join("\n");
  }
}
