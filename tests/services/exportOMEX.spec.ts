import { describe, it, expect, vi, beforeEach } from 'vitest';
import { exportToOMEX } from '../../services/exportOMEX';
import { generateOMEX, BNGLModel, OMEXExportOptions } from '@bngplayground/engine';

vi.mock('@bngplayground/engine', () => {
  return {
    generateOMEX: vi.fn().mockReturnValue(new Uint8Array([1, 2, 3])),
  };
});

describe('exportToOMEX', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should call generateOMEX with default options when no options are provided', () => {
    const mockModel = {
      name: 'TestModel',
    } as BNGLModel;

    const bnglCode = 'begin model\nend model';

    const result = exportToOMEX(mockModel, bnglCode);

    expect(generateOMEX).toHaveBeenCalledWith(mockModel, {
      bnglCode,
      modelName: 'TestModel',
      simulationOptions: {
        method: 'ode',
        t_end: 100,
        n_steps: 100
      }
    });

    expect(result).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('should use fallback "model" name when model.name is missing', () => {
    const mockModel = {} as BNGLModel;
    const bnglCode = 'begin model\nend model';

    exportToOMEX(mockModel, bnglCode);

    expect(generateOMEX).toHaveBeenCalledWith(mockModel, expect.objectContaining({
      modelName: 'model'
    }));
  });

  it('should override default options when custom options are provided', () => {
    const mockModel = { name: 'TestModel' } as BNGLModel;
    const bnglCode = 'begin model\nend model';

    const customOptions: Partial<OMEXExportOptions> = {
      modelName: 'CustomModel',
      simulationOptions: {
        method: 'ssa',
        t_end: 200,
        n_steps: 50
      },
      metadata: {
        title: 'Custom Metadata'
      }
    };

    exportToOMEX(mockModel, bnglCode, customOptions);

    expect(generateOMEX).toHaveBeenCalledWith(mockModel, {
      bnglCode,
      modelName: 'CustomModel',
      simulationOptions: {
        method: 'ssa',
        t_end: 200,
        n_steps: 50
      },
      metadata: {
        title: 'Custom Metadata'
      }
    });
  });
});
