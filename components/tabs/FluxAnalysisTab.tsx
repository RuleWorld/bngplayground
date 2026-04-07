import React, { useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend } from 'recharts';
import { BNGLModel, SimulationResults } from '../../types';
import { Card } from '../ui/Card';
import { Select } from '../ui/Select';
import { CHART_COLORS } from '../../src/utils/chartColors';

interface FluxAnalysisTabProps {
  model: BNGLModel | null;
  results: SimulationResults | null;
}

interface FluxData {
  reactionName: string;
  rate: number;
  rateConstant: number;
  reactants: string[];
  products: string[];
  flux: number;
  direction: 'production' | 'consumption' | 'neutral';
}

/**
 * Compute reaction fluxes based on the model's reactions and simulation results.
 * Flux is computed as rate constant * product of reactant concentrations at a given time point.
 */
function computeFluxes(
  results: SimulationResults,
  timePointIndex: number,
  selectedSpecies: string | null
): FluxData[] {
  // Use speciesData for actual species concentrations, not observable data
  const speciesDataPoint = results.speciesData?.[timePointIndex] || results.data[timePointIndex];
  if (!speciesDataPoint) return [];

  // Use expandedReactions from simulation results (generated during network expansion)
  const reactions = results.expandedReactions || [];
  if (reactions.length === 0) return [];

  const fluxes: FluxData[] = [];

  reactions.forEach((reaction, index) => {
    const reactionName = `R${index + 1}`;
    const rateConstant = reaction.rateConstant ?? 1;

    // Compute the flux as rate_constant * product of reactant concentrations
    let flux = rateConstant;
    const reactantConcentrations: number[] = [];

    reaction.reactants.forEach((reactant) => {
      // Find the species concentration from the data point
      // BUG FIX: Default to 0 (not 1) when species not found
      const concentration = speciesDataPoint[reactant] ?? 0;
      const numericConc = typeof concentration === 'number' ? concentration : 0;
      reactantConcentrations.push(numericConc);
      flux *= numericConc;
    });

    // Determine direction relative to selected species
    let direction: 'production' | 'consumption' | 'neutral' = 'neutral';
    if (selectedSpecies) {
      const isReactant = reaction.reactants.some((r) => r.includes(selectedSpecies));
      const isProduct = reaction.products.some((p) => p.includes(selectedSpecies));
      if (isReactant && !isProduct) {
        direction = 'consumption';
      } else if (isProduct && !isReactant) {
        direction = 'production';
      } else if (isReactant && isProduct) {
        direction = 'neutral'; // catalytic
      }
    }

    fluxes.push({
      reactionName,
      rate: typeof reaction.rate === 'number' ? reaction.rate : parseFloat(String(reaction.rate)) || 0,
      rateConstant,
      reactants: reaction.reactants,
      products: reaction.products,
      flux,
      direction,
    });
  });

  // Sort by absolute flux value (descending)
  fluxes.sort((a, b) => Math.abs(b.flux) - Math.abs(a.flux));

  return fluxes;
}

export const FluxAnalysisTab: React.FC<FluxAnalysisTabProps> = ({ model, results }) => {
  const [selectedTimeIndex, setSelectedTimeIndex] = useState(0);
  const [selectedSpecies, setSelectedSpecies] = useState<string | null>(null);
  const [topN, setTopN] = useState(10);

  const timePoints = useMemo(() => {
    if (!results?.data) return [];
    return results.data.map((d, i) => ({
      index: i,
      time: d.time ?? i,
    }));
  }, [results]);

  const speciesNames = useMemo(() => {
    if (!model) return [];
    return model.species.map((s) => s.name);
  }, [model]);

  const fluxData = useMemo(() => {
    if (!results || !results.data) return [];
    const lastIndex = results.data.length - 1;
    const timeIndex = selectedTimeIndex > lastIndex ? lastIndex : selectedTimeIndex;
    return computeFluxes(results, timeIndex, selectedSpecies);
  }, [results, selectedTimeIndex, selectedSpecies]);

  const topFluxes = useMemo(() => {
    return fluxData.slice(0, topN);
  }, [fluxData, topN]);

  const chartData = useMemo(() => {
    return topFluxes.map((f) => ({
      name: f.reactionName,
      flux: f.flux,
      direction: f.direction,
      tooltip: `${f.reactants.join(' + ')} → ${f.products.join(' + ')}`,
    }));
  }, [topFluxes]);

  if (!model || !results || !results.data || results.data.length === 0) {
    return (
      <Card>
        <div className="text-slate-500 dark:text-slate-400 text-center py-8">
          Run a simulation first to analyze reaction fluxes.
        </div>
      </Card>
    );
  }

  if (!results.expandedReactions || results.expandedReactions.length === 0) {
    return (
      <Card>
        <div className="text-slate-500 dark:text-slate-400 text-center py-8 space-y-2">
          <p className="font-medium">No concrete reactions available for flux analysis.</p>
          <p className="text-sm">
            This feature requires the expanded reaction network. The model has {model.reactionRules?.length ?? 0} reaction rules.
            Re-run the simulation to generate the concrete reactions.
          </p>
          <p className="text-xs mt-4">
            💡 Tip: Check the Regulatory Graph tab for rule-level analysis.
          </p>
        </div>
      </Card>
    );
  }


  const getBarColor = (direction: string) => {
    switch (direction) {
      case 'production':
        return '#22c55e'; // green
      case 'consumption':
        return '#ef4444'; // red
      default:
        return CHART_COLORS[0]; // blue
    }
  };

  return (
    <div className="space-y-6">
      <Card className="space-y-4">
        <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
          Reaction Flux Analysis
        </h3>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Analyze which reactions contribute most to species dynamics. Flux = rate constant × reactant concentrations.
        </p>

        <div className="flex flex-wrap gap-4 items-end">
          <div className="space-y-1">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Time Point
            </label>
            <Select
              value={selectedTimeIndex.toString()}
              onChange={(e) => setSelectedTimeIndex(parseInt(e.target.value, 10))}
              className="w-32"
            >
              {timePoints.map((tp) => (
                <option key={tp.index} value={tp.index}>
                  t = {typeof tp.time === 'number' ? tp.time.toFixed(2) : tp.time}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-1">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Focus Species (optional)
            </label>
            <Select
              value={selectedSpecies ?? ''}
              onChange={(e) => setSelectedSpecies(e.target.value || null)}
              className="w-48"
            >
              <option value="">All reactions</option>
              {speciesNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-1">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Top N
            </label>
            <Select
              value={topN.toString()}
              onChange={(e) => setTopN(parseInt(e.target.value, 10))}
              className="w-24"
            >
              <option value="5">5</option>
              <option value="10">10</option>
              <option value="20">20</option>
              <option value="50">All</option>
            </Select>
          </div>
        </div>
      </Card>

      {chartData.length > 0 && (
        <Card className="space-y-4">
          <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
            Top Reaction Fluxes
          </h3>

          {selectedSpecies && (
            <div className="flex items-center gap-4 text-sm">
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded-full bg-green-500"></span>
                Production
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded-full bg-red-500"></span>
                Consumption
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded-full bg-blue-500"></span>
                Neutral/Catalytic
              </span>
            </div>
          )}

          <ResponsiveContainer width="100%" height={Math.max(300, chartData.length * 30)}>
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ top: 5, right: 20, left: 80, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(128, 128, 128, 0.3)" horizontal={false} />
              <XAxis type="number" tickFormatter={(v) => v.toExponential(1)} />
              <YAxis type="category" dataKey="name" width={70} />
              <Tooltip
                formatter={(value) => (typeof value === 'number' ? value.toExponential(3) : String(value ?? ''))}
                labelFormatter={(label, payload) => {
                  if (payload && payload[0]) {
                    return payload[0].payload.tooltip;
                  }
                  return label;
                }}
              />
              <Legend />
              <Bar dataKey="flux" name="Flux">
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={getBarColor(entry.direction)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      {topFluxes.length > 0 && (
        <Card className="space-y-4">
          <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
            Flux Details
          </h3>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700 dark:border-slate-700">
                  <th className="text-left py-2 px-3 font-medium text-slate-700 dark:text-slate-300">Reaction</th>
                  <th className="text-left py-2 px-3 font-medium text-slate-700 dark:text-slate-300">Reactants → Products</th>
                  <th className="text-right py-2 px-3 font-medium text-slate-700 dark:text-slate-300">Rate Constant</th>
                  <th className="text-right py-2 px-3 font-medium text-slate-700 dark:text-slate-300">Flux</th>
                </tr>
              </thead>
              <tbody>
                {topFluxes.map((f, i) => (
                  <tr
                    key={f.reactionName}
                    className={`border-b border-slate-100 dark:border-slate-800 ${i % 2 === 0 ? 'bg-slate-50 dark:bg-slate-900/50 dark:bg-slate-800/50' : ''}`}
                  >
                    <td className="py-2 px-3 font-mono text-slate-700 dark:text-slate-300">{f.reactionName}</td>
                    <td className="py-2 px-3 text-slate-600 dark:text-slate-400">
                      {f.reactants.join(' + ')} → {f.products.join(' + ')}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-slate-600 dark:text-slate-400">
                      {f.rateConstant.toExponential(2)}
                    </td>
                    <td className="py-2 px-3 text-right font-mono font-semibold" style={{ color: getBarColor(f.direction) }}>
                      {f.flux.toExponential(3)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
};
