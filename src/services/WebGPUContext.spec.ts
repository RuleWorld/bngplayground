// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    isWebGPUSupported,
    initWebGPU,
    getGPUDevice,
    getGPUAdapter,
    isWebGPUReady,
    disposeWebGPU,
} from './WebGPUContext';

describe('WebGPUContext', () => {
    let originalNavigator: any;

    beforeEach(() => {
        originalNavigator = global.navigator;
        disposeWebGPU();
        vi.restoreAllMocks();
        // Mock console info/warn/error to keep test output clean
        vi.spyOn(console, 'info').mockImplementation(() => {});
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        global.navigator = originalNavigator;
        disposeWebGPU();
        vi.restoreAllMocks();
    });

    describe('isWebGPUSupported', () => {
        it('should return true if navigator.gpu exists', () => {
            Object.defineProperty(global, 'navigator', {
                value: { gpu: {} },
                writable: true,
                configurable: true
            });
            expect(isWebGPUSupported()).toBe(true);
        });

        it('should return false if navigator.gpu does not exist', () => {
            Object.defineProperty(global, 'navigator', {
                value: {},
                writable: true,
                configurable: true
            });
            expect(isWebGPUSupported()).toBe(false);
        });

        it('should return false if navigator is undefined', () => {
            Object.defineProperty(global, 'navigator', {
                value: undefined,
                writable: true,
                configurable: true
            });
            expect(isWebGPUSupported()).toBe(false);
        });
    });

    describe('initWebGPU', () => {
        it('should return false if WebGPU is not supported', async () => {
            Object.defineProperty(global, 'navigator', {
                value: {},
                writable: true,
                configurable: true
            });
            const result = await initWebGPU();
            expect(result).toBe(false);
            expect(console.info).toHaveBeenCalledWith('[WebGPU] Not supported in this browser');
        });

        it('should return false if requestAdapter returns null', async () => {
            const mockRequestAdapter = vi.fn().mockResolvedValue(null);
            Object.defineProperty(global, 'navigator', {
                value: { gpu: { requestAdapter: mockRequestAdapter } },
                writable: true,
                configurable: true
            });

            const result = await initWebGPU();
            expect(result).toBe(false);
            expect(console.warn).toHaveBeenCalledWith('[WebGPU] No GPU adapter found');
        });

        it('should handle device lost gracefully', async () => {
            let deviceLostResolver: (value: any) => void;
            const deviceLostPromise = new Promise((resolve) => {
                deviceLostResolver = resolve;
            });

            const mockDevice = {
                lost: deviceLostPromise,
                destroy: vi.fn()
            };

            const mockAdapter = {
                requestDevice: vi.fn().mockResolvedValue(mockDevice)
            };

            const mockRequestAdapter = vi.fn().mockResolvedValue(mockAdapter);

            Object.defineProperty(global, 'navigator', {
                value: { gpu: { requestAdapter: mockRequestAdapter } },
                writable: true,
                configurable: true
            });

            const result = await initWebGPU();
            expect(result).toBe(true);
            expect(getGPUDevice()).toBe(mockDevice);

            // Trigger device lost
            deviceLostResolver!({ message: 'Device crashed' });

            // Wait for promise tick
            await new Promise(process.nextTick);

            expect(console.error).toHaveBeenCalledWith('[WebGPU] Device lost:', 'Device crashed');
            expect(getGPUDevice()).toBeNull();
        });

        it('should initialize successfully and log adapter info if available', async () => {
            const mockDevice = {
                lost: new Promise(() => {}), // never resolves
                destroy: vi.fn()
            };

            const mockAdapterInfo = {
                vendor: 'Test Vendor',
                architecture: 'Test Arch'
            };

            const mockAdapter = {
                requestAdapterInfo: vi.fn().mockResolvedValue(mockAdapterInfo),
                requestDevice: vi.fn().mockResolvedValue(mockDevice)
            };

            const mockRequestAdapter = vi.fn().mockResolvedValue(mockAdapter);

            Object.defineProperty(global, 'navigator', {
                value: { gpu: { requestAdapter: mockRequestAdapter } },
                writable: true,
                configurable: true
            });

            const result = await initWebGPU();

            expect(result).toBe(true);
            expect(console.info).toHaveBeenCalledWith('[WebGPU] Adapter:', 'Test Vendor', 'Test Arch');
            expect(console.info).toHaveBeenCalledWith('[WebGPU] Device initialized successfully');
            expect(getGPUAdapter()).toBe(mockAdapter);
            expect(getGPUDevice()).toBe(mockDevice);
            expect(isWebGPUReady()).toBe(true);
        });

        it('should initialize successfully when requestAdapterInfo throws', async () => {
            const mockDevice = {
                lost: new Promise(() => {}),
                destroy: vi.fn()
            };

            const mockAdapter = {
                requestAdapterInfo: vi.fn().mockRejectedValue(new Error('Info unavailable')),
                requestDevice: vi.fn().mockResolvedValue(mockDevice)
            };

            const mockRequestAdapter = vi.fn().mockResolvedValue(mockAdapter);

            Object.defineProperty(global, 'navigator', {
                value: { gpu: { requestAdapter: mockRequestAdapter } },
                writable: true,
                configurable: true
            });

            const result = await initWebGPU();

            expect(result).toBe(true);
            expect(console.info).toHaveBeenCalledWith('[WebGPU] Adapter found (info query failed)');
        });

        it('should handle requestAdapter initialization errors', async () => {
            const mockRequestAdapter = vi.fn().mockRejectedValue(new Error('Adapter init failed'));

            Object.defineProperty(global, 'navigator', {
                value: { gpu: { requestAdapter: mockRequestAdapter } },
                writable: true,
                configurable: true
            });

            const result = await initWebGPU();

            expect(result).toBe(false);
            expect(console.error).toHaveBeenCalledWith('[WebGPU] Initialization failed:', expect.any(Error));
        });

        it('should return existing initPromise if already initializing/initialized', async () => {
            const mockDevice = {
                lost: new Promise(() => {}),
                destroy: vi.fn()
            };

            const mockAdapter = {
                requestDevice: vi.fn().mockResolvedValue(mockDevice)
            };

            const mockRequestAdapter = vi.fn().mockResolvedValue(mockAdapter);

            Object.defineProperty(global, 'navigator', {
                value: { gpu: { requestAdapter: mockRequestAdapter } },
                writable: true,
                configurable: true
            });

            const promise1 = initWebGPU();
            const promise2 = initWebGPU();

            expect(promise1).toStrictEqual(promise2); // Same promise object

            await promise1;

            // Call again after initialized
            const promise3 = initWebGPU();
            expect(promise3).toStrictEqual(promise1);
        });
    });
});
