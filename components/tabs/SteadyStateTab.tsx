import React, { useMemo } from 'react';
import { BNGLModel, SimulationOptions, SimulationResults } from '../../types';
import { Button } from '../ui/Button';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { InfoIcon } from '../icons/InfoIcon';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { CHART_COLORS } from '../../src/utils/chartColors';
import { formatYAxisTick } from '../charts/InteractiveLegend';
import { formatValue } from '../../src/utils/formatValue';
import { Card } from '../ui/Card';

interface SteadyStateTabProps {
  model: BNGLModel | null;
  results: SimulationResults | null;
  onSimulate: (options: SimulationOptions) => void;
  onCancelSimulation: () => void;
  isSimulating: boolean;
}

export const SteadyStateTab: React.FC<SteadyStateTabProps> = ({ model, results, onSimulate, onCancelSimulation, isSimulating }) => {

  const finalStateData = useMemo(() => {
    if (!results || !results.data || results.data.length === 0) return null;

    // Get the last data point
    const lastPoint = results.data[results.data.length - 1];
    if (!lastPoint) return null;

    // Filter out time and map to array
    const speciesData = Object.entries(lastPoint)
      .filter(([key]) => key !== 'time')
      .map(([name, value]) => ({ name, value: Number(value) }))
      .sort((a, b) => b.value - a.value); // Sort descending by concentration

    return {
      time: lastPoint.time,
      data: speciesData
    };
  }, [results]);

  if (!model) {
    return <div className="text-slate-500 dark:text-slate-400">Parse a model to run a steady-state analysis.</div>;
  }

  const handleRun = () => {
    onSimulate({
      method: 'ode',
      t_end: 2000,
      n_steps: 800,
      steadyState: true,
      steadyStateTolerance: 1e-6,
      steadyStateWindow: 12,
    });
  }

  return (
    <div className="space-y-6 h-full flex flex-col">
      <div className="p-4 rounded-md bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200 flex items-start gap-3 shrink-0">
        <InfoIcon className="w-5 h-5 mt-0.5 flex-shrink-0" />
        <p className="text-sm">
          <b>Steady-state finder:</b> Runs an adaptive ODE sweep until consecutive RK4 sub-steps change by less than 1e-6 (12 times in a row). The final point in the "Time Course" tab is the detected steady state.
        </p>
      </div>

      <div className="flex gap-2 shrink-0">
        <Button onClick={handleRun} disabled={isSimulating}>
          {isSimulating && <LoadingSpinner className="w-4 h-4 mr-2" />}
          {isSimulating ? 'Running…' : 'Run to Steady State'}
        </Button>
        {isSimulating && (
          <Button variant="danger" onClick={onCancelSimulation}>
            Cancel
          </Button>
        )}
      </div>

      {finalStateData && (
        <Card className="flex-1 min-h-0 flex flex-col p-4">
          <div className="mb-4">
            <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Final Concentrations</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              System equilibrated at t = {formatValue(finalStateData.time)}
            </p>
          </div>

          <div className="h-[500px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={finalStateData.data}
                layout="vertical"
                margin={{ top: 5, right: 30, left: 40, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={true} stroke="rgba(128, 128, 128, 0.2)" />
                <XAxis
                  type="number"
                  tickFormatter={formatYAxisTick}
                  label={{ value: 'Concentration', position: 'insideBottom', offset: -5, fill: '#334155', fontSize: 13, fontWeight: 'bold' }}
                />
                <YAxis
                  dataKey="name"
                  type="category"
                  width={120}
                  tick={{ fontSize: 11 }}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(0,0,0,0.05)' }}
                  formatter={(value: any) => [formatValue(value), 'Concentration']}
                />
                <Bar dataKey="value" name="Concentration" radius={[0, 4, 4, 0]}>
                  {finalStateData.data.map((_entry, index) => (
                    <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 text-center text-xs text-slate-400">
            Showing {finalStateData.data.length} species, sorted by abundance.
          </div>
        </Card>
      )}
    </div>
  );
};
