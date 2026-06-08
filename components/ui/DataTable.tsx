import React from 'react';

interface DataTableProps {
  headers: string[];
  rows: (string | number | React.ReactNode)[][];
}

export const DataTable: React.FC<DataTableProps> = ({ headers, rows }) => {
  return (
    <div className="overflow-x-auto border border-stone-200 dark:border-slate-700 rounded-lg">
      <table aria-label="Data table" className="min-w-full divide-y divide-stone-200 dark:divide-slate-700">
        <thead className="bg-slate-50 dark:bg-slate-800">
          <tr>
            {headers.map((header, index) => (
              <th key={index} scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-200 uppercase tracking-wider">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-white dark:bg-slate-900 divide-y divide-stone-200 dark:divide-slate-700">
          {rows.length > 0 ? rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="px-6 py-4 whitespace-nowrap text-sm text-slate-700 dark:text-slate-100">
                  {cell}
                </td>
              ))}
            </tr>
          )) : (
            <tr>
              <td colSpan={headers.length} className="text-center px-6 py-4 text-sm text-slate-500 dark:text-slate-300">
                No data available.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};
