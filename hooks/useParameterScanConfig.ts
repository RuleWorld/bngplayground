import { useState, useRef, useMemo, useEffect } from 'react';
import { BNGLModel } from '../types';
import { computeDefaultBounds, roundForInput } from '@bngplayground/engine';

export type ScanMode = '1d' | '2d';

export function useParameterScanConfig(model: BNGLModel | null) {
  const [scanType, setScanType] = useState<ScanMode>('1d');
  const [parameter1, setParameter1] = useState('');
  const [parameter2, setParameter2] = useState('');
  const [param1Start, setParam1Start] = useState('');
  const [param1End, setParam1End] = useState('');
  const [param1Steps, setParam1Steps] = useState('5');
  const [param2Start, setParam2Start] = useState('');
  const [param2End, setParam2End] = useState('');
  const [param2Steps, setParam2Steps] = useState('5');
  const [method, setMethod] = useState<'ode' | 'ssa'>('ode');
  const [solver, setSolver] = useState<'auto' | 'cvode' | 'cvode_sparse' | 'rosenbrock23' | 'rk45' | 'rk4' | 'webgpu_rk4'>('auto');
  const [tEnd, setTEnd] = useState('100');
  const [nSteps, setNSteps] = useState('100');

  const previousModelRef = useRef<BNGLModel | null>(null);
  const previousParameter1 = useRef<string | null>(null);
  const previousParameter2 = useRef<string | null>(null);

  const parameterTypeMap = useMemo(() => {
    const map: Record<string, 'parameter' | 'species'> = {};
    if (!model) return map;
    Object.keys(model.parameters).forEach((p) => (map[p] = 'parameter'));
    model.species.forEach((s) => (map[s.name] = 'species'));
    return map;
  }, [model]);

  const parameterNames = useMemo(() => Object.keys(parameterTypeMap), [parameterTypeMap]);
  const observableNames = useMemo(() => (model ? model.observables.map((obs) => obs.name) : []), [model]);

  const speciesMap = useMemo(() => {
    const map = new Map<string, typeof model.species[0]>();
    if (model) {
      model.species.forEach(s => map.set(s.name, s));
    }
    return map;
  }, [model]);

  const paramToSpecies = useMemo<Record<string, string[]>>(() => {
    const map: Record<string, string[]> = {};
    if (!model) return map;
    model.species.forEach((s) => {
      if (s.initialExpression) {
        const tokens = s.initialExpression.match(/\b[A-Za-z_]\w*\b/g) || [];
        tokens.forEach((tok) => {
          if (tok in model.parameters) {
            map[tok] = map[tok] || [];
            if (!map[tok].includes(s.name)) map[tok].push(s.name);
          }
        });
      }
    });
    return map;
  }, [model]);

  useEffect(() => {
    if (!model) {
      setParameter1('');
      setParameter2('');
      setParam1Start('');
      setParam1End('');
      setParam2Start('');
      setParam2End('');
      previousModelRef.current = null;
      previousParameter1.current = null;
      previousParameter2.current = null;
      return;
    }

    if (previousModelRef.current !== model) {
      setParam1Start('');
      setParam1End('');
      setParam2Start('');
      setParam2End('');
      previousParameter1.current = null;
      previousParameter2.current = null;
      previousModelRef.current = model;
    }

    if (!parameterNames.includes(parameter1)) {
      setParameter1(parameterNames[0] ?? '');
    }

    if (!parameterNames.includes(parameter2) || parameter2 === parameter1) {
      const secondChoice = parameterNames.find((name) => name !== parameter1);
      setParameter2(secondChoice ?? parameterNames[0] ?? '');
    }
  }, [model, parameter1, parameter2, parameterNames]);

  useEffect(() => {
    if (!model) return;
    if (parameter1 && previousParameter1.current !== parameter1) {
      previousParameter1.current = parameter1;
      setParam1Start('');
      setParam1End('');
    }
  }, [model, parameter1]);

  useEffect(() => {
    if (!model) return;
    if (parameter2 && previousParameter2.current !== parameter2) {
      previousParameter2.current = parameter2;
      setParam2Start('');
      setParam2End('');
    }
  }, [model, parameter2]);

  const baseParam1 = useMemo(() => {
    if (!parameter1 || !model) return undefined;
    if (parameter1 in model.parameters) {
      const deps = paramToSpecies[parameter1];
      if (deps && deps.length > 0) {
        const sp = speciesMap.get(deps[0]);
        if (sp) return sp.initialConcentration;
      }
      return model.parameters[parameter1];
    }
    return speciesMap.get(parameter1)?.initialConcentration;
  }, [parameter1, model, paramToSpecies, speciesMap]);

  const baseParam2 = useMemo(() => {
    if (!parameter2 || !model) return undefined;
    if (parameter2 in model.parameters) {
      const deps = paramToSpecies[parameter2];
      if (deps && deps.length > 0) {
        const sp = speciesMap.get(deps[0]);
        if (sp) return sp.initialConcentration;
      }
      return model.parameters[parameter2];
    }
    return speciesMap.get(parameter2)?.initialConcentration;
  }, [parameter2, model, paramToSpecies, speciesMap]);

  const [defaultParam1Lower, defaultParam1Upper] = useMemo(() => {
    if (baseParam1 === undefined) return [0, 0];
    return computeDefaultBounds(baseParam1);
  }, [baseParam1]);

  const [defaultParam2Lower, defaultParam2Upper] = useMemo(() => {
    if (baseParam2 === undefined) return [0, 0];
    return computeDefaultBounds(baseParam2);
  }, [baseParam2]);

  const defaultParam1Start = baseParam1 !== undefined ? roundForInput(defaultParam1Lower) : '';
  const defaultParam1End = baseParam1 !== undefined ? roundForInput(defaultParam1Upper) : '';
  const defaultParam2Start = baseParam2 !== undefined ? roundForInput(defaultParam2Lower) : '';
  const defaultParam2End = baseParam2 !== undefined ? roundForInput(defaultParam2Upper) : '';

  const effectiveParam1Start = param1Start !== '' ? param1Start : defaultParam1Start;
  const effectiveParam1End = param1End !== '' ? param1End : defaultParam1End;
  const effectiveParam2Start = param2Start !== '' ? param2Start : defaultParam2Start;
  const effectiveParam2End = param2End !== '' ? param2End : defaultParam2End;

  const canRunScan = (isLogScale: boolean) => {
    if (!parameter1 || !effectiveParam1Start || !effectiveParam1End || !param1Steps) return false;
    if (isLogScale && (Number(effectiveParam1Start) <= 0 || Number(effectiveParam1End) <= 0)) return false;
    if (scanType === '2d' && (!parameter2 || parameter2 === parameter1 || !effectiveParam2Start || !effectiveParam2End || !param2Steps)) {
      return false;
    }
    if (scanType === '2d' && isLogScale && (Number(effectiveParam2Start) <= 0 || Number(effectiveParam2End) <= 0)) return false;
    return true;
  };

  return {
    scanType, setScanType,
    parameter1, setParameter1,
    parameter2, setParameter2,
    param1Start, setParam1Start,
    param1End, setParam1End,
    param1Steps, setParam1Steps,
    param2Start, setParam2Start,
    param2End, setParam2End,
    param2Steps, setParam2Steps,
    method, setMethod,
    solver, setSolver,
    tEnd, setTEnd,
    nSteps, setNSteps,
    parameterTypeMap,
    parameterNames,
    observableNames,
    speciesMap,
    paramToSpecies,
    effectiveParam1Start,
    effectiveParam1End,
    effectiveParam2Start,
    effectiveParam2End,
    defaultParam1Start,
    defaultParam1End,
    defaultParam2Start,
    defaultParam2End,
    baseParam1,
    baseParam2,
    canRunScan
  };
}
