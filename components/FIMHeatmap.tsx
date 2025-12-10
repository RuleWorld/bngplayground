import React from 'react';

interface FIMHeatmapProps {
  correlations: number[][];
  paramNames: string[];
  cellSize?: number;
}

export const FIMHeatmap: React.FC<FIMHeatmapProps> = ({ correlations, paramNames, cellSize = 30 }) => {
  const n = paramNames.length;
  const width = n * cellSize + 100;
  const height = n * cellSize + 50;

  const colorFor = (v: number) => {
    // Blue for negative, Red for positive, White near 0
    const intensity = Math.min(1, Math.abs(v));
    if (v > 0) {
      return `rgba(220, 38, 38, ${intensity})`;
    }
    return `rgba(37, 99, 235, ${intensity})`;
  };

  return (
    <svg width={width} height={height}>
      {/* Increased top margin to 120 to accommodate rotated labels */}
      <g transform="translate(100, 120)">
        {correlations.map((row, i) =>
          row.map((val, j) => (
            <g key={`${i}-${j}`}>
              <rect
                x={j * cellSize}
                y={i * cellSize}
                width={cellSize}
                height={cellSize}
                fill={colorFor(val)}
                stroke="#eee"
              />
              <title>{`${paramNames[i]} vs ${paramNames[j]}: ${val.toFixed(3)}`}</title>
            </g>
          ))
        )}
        {/* Axis labels */}
        {paramNames.map((p, j) => (
          <text 
            key={`x-${j}`} 
            x={0} 
            y={0} 
            transform={`translate(${j * cellSize + cellSize / 2}, -10) rotate(-90)`}
            fontSize={10} 
            textAnchor="start"
            fill="currentColor"
            className="text-slate-700 dark:text-slate-300"
          >
            {p}
          </text>
        ))}
        {paramNames.map((p, i) => (
          <text 
            key={`y-${i}`} 
            x={-8} 
            y={i * cellSize + cellSize / 2} 
            fontSize={10} 
            textAnchor="end" 
            dominantBaseline="middle"
            fill="currentColor"
            className="text-slate-700 dark:text-slate-300"
          >
            {p}
          </text>
        ))}
      </g>
    </svg>
  );
};

export default FIMHeatmap;
