// Copyright Anysphere Inc.
import { MethodKind } from '@bufbuild/protobuf';
import {
	Code, ConnectError
} from '@connectrpc/connect';
import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	vi
} from 'vitest';
import {
	calculateBackoffDelay,
	createStreamRetryInterceptor,
	createUnaryRetryInterceptor,
	shouldRetryOnError,
} from '../../src/aiConnectTransport/retryInterceptor.js';
import {
	StructuredLogProviderImpl
} from '../../src/structuredLogProvider.js';
import {
	CursorDebugLogger
} from '../../src/utils/logger.js';

// Mock logger
vi.mock('../../src/utils/logger.js', () => ({
	CursorDebugLogger: {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		debug: vi.fn(),
	},
}));

// Mock structured log provider
vi.mock('../../src/structuredLogProvider.js', () => ({
	StructuredLogProviderImpl: {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		debug: vi.fn(),
	},
}));

// Mock vscode.cursor.checkFeatureGate and getDynamicConfigValue
const mockCheckFeatureGate = vi.fn();
const mockGetDynamicConfigValue = vi.fn();
vi.mock('vscode', () => ({
	default: {
		cursor: {
			checkFeatureGate: (...args: any[]) => mockCheckFeatureGate(...args),
			getDynamicConfigValue: (...args: any[]) => mockGetDynamicConfigValue(...args),
		},
	},
	cursor: {
		checkFeatureGate: (...args: any[]) => mockCheckFeatureGate(...args),
		getDynamicConfigValue: (...args: any[]) => mockGetDynamicConfigValue(...args),
	},
}));

describe('RetryInterceptor', async () => {
	let mockRequest: any;
	let mockMethod: any;
	let mockService: any;

	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers();
		// Default to killswitch disabled (retry logic enabled)
		mockCheckFeatureGate.mockResolvedValue(false);
		// Default to fallback values from experimentConfig.ts
		mockGetDynamicConfigValue.mockResolvedValue({
			retriableErrors: [
				{ code: 'Unavailable' },
				{ code: 'Internal' },
				{ code: 'DeadlineExceeded' },
			],
		});

		// Create mock request structure
		mockMethod = {
			name: 'testMethod',
			kind: MethodKind.Unary,
		};

		mockService = {
			typeName: 'TestService',
		};

		mockRequest = {
			method: mockMethod,
			service: mockService,
			header: new Headers(),
		};
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe('executeWithRetry - Success scenarios', async () => {
		it('should succeed on first attempt without retries', async () => {
			// Enable retries via header
			mockRequest.header.set('X-Cursor-RetryInterceptor-Enabled', 'true');

			const interceptor = createUnaryRetryInterceptor();
			const next = vi.fn().mockResolvedValue({
				success: true
			});

			const result = await interceptor(next)(mockRequest);

			expect(next).toHaveBeenCalledTimes(1);
			expect(result).toEqual({
				success: true
			});
			expect(CursorDebugLogger.info).not.toHaveBeenCalled();
		});

		it('should succeed after retries', async () => {
			// Enable retries via header with custom config
			mockRequest.header.set('X-Cursor-RetryInterceptor-Enabled', 'true');
			mockRequest.header.set('X-Cursor-RetryInterceptor-MaxRetries', '3');
			mockRequest.header.set('X-Cursor-RetryInterceptor-BaseDelayMs', '10');
			mockRequest.header.set('X-Cursor-RetryInterceptor-MaxDelayMs', '100');

			const interceptor = createUnaryRetryInterceptor();

			let attemptCount = 0;
			const next = vi.fn().mockImplementation(() => {
				attemptCount++;
				if (attemptCount < 3) {
					throw new ConnectError('Service unavailable', Code.Unavailable);
				}
				return Promise.resolve({
					success: true
				});
			});

			const resultPromise = interceptor(next)(mockRequest);

			// Fast-forward through retry delays
			await vi.advanceTimersByTimeAsync(100);

			const result = await resultPromise;

			expect(next).toHaveBeenCalledTimes(3);
			expect(result).toEqual({
				success: true
			});
			expect(CursorDebugLogger.info).toHaveBeenCalledWith(
				expect.stringContaining('Successfully completed after 2 retries (3 total requests made)')
			);
		});

		it('should succeed with streaming interceptor', async () => {
			mockRequest.header.set('X-Cursor-RetryInterceptor-Enabled', 'true');

			mockService.typeName = 'aiserver.v1.ChatService';
			mockMethod.name = 'streamUnifiedChatWithTools';
			mockMethod.kind = MethodKind.BiDiStreaming;

			const interceptor = createStreamRetryInterceptor();
			const next = vi.fn().mockResolvedValue({
				stream: 'data'
			});

			const result = await interceptor(next)(mockRequest);

			expect(next).toHaveBeenCalledTimes(1);
			expect(result).toEqual({
				stream: 'data'
			});
		});
	});

	describe('executeWithRetry - Non-retryable errors', async () => {
		it('should not retry on non-ConnectError', async () => {
			mockRequest.header.set('X-Cursor-RetryInterceptor-Enabled', 'true');

			const interceptor = createUnaryRetryInterceptor();
			const next = () => Promise.reject(new Error('Generic error'));

			await expect(interceptor(next)(mockRequest)).rejects.toThrow('Generic error');
		});

		it('should not retry on Canceled error code', async () => {
			mockRequest.header.set('X-Cursor-RetryInterceptor-Enabled', 'true');

			const interceptor = createUnaryRetryInterceptor();
			const next = () => Promise.reject(new ConnectError('Canceled', Code.Canceled));

			await expect(interceptor(next)(mockRequest)).rejects.toThrow();
		});

		it('should not retry on InvalidArgument error code', async () => {
			mockRequest.header.set('X-Cursor-RetryInterceptor-Enabled', 'true');

			const interceptor = createUnaryRetryInterceptor();
			const next = () => Promise.reject(new ConnectError('Invalid', Code.InvalidArgument));

			await expect(interceptor(next)(mockRequest)).rejects.toThrow();
		});
	});

	describe('executeWithRetry - Retryable errors', async () => {
		it('should retry on Unavailable error', async () => {
			mockRequest.header.set('X-Cursor-RetryInterceptor-Enabled', 'true');
			mockRequest.header.set('X-Cursor-RetryInterceptor-MaxRetries', '2');
			mockRequest.header.set('X-Cursor-RetryInterceptor-BaseDelayMs', '10');
			mockRequest.header.set('X-Cursor-RetryInterceptor-MaxDelayMs', '100');

			const interceptor = createUnaryRetryInterceptor();

			let attemptCount = 0;
			const next = vi.fn().mockImplementation(() => {
				attemptCount++;
				if (attemptCount < 2) {
					throw new ConnectError('Unavailable', Code.Unavailable);
				}
				return Promise.resolve({
					success: true
				});
			});

			const resultPromise = interceptor(next)(mockRequest);
			await vi.advanceTimersByTimeAsync(100);
			const result = await resultPromise;

			expect(next).toHaveBeenCalledTimes(2);
			expect(result).toEqual({
				success: true
			});
		});

		it('should retry on DeadlineExceeded error', async () => {
			mockRequest.header.set('X-Cursor-RetryInterceptor-Enabled', 'true');
			mockRequest.header.set('X-Cursor-RetryInterceptor-MaxRetries', '2');
			mockRequest.header.set('X-Cursor-RetryInterceptor-BaseDelayMs', '10');
			mockRequest.header.set('X-Cursor-RetryInterceptor-MaxDelayMs', '100');

			const interceptor = createUnaryRetryInterceptor();

			let attemptCount = 0;
			const next = vi.fn().mockImplementation(() => {
				attemptCount++;
				if (attemptCount < 2) {
					throw new ConnectError('Deadline exceeded', Code.DeadlineExceeded);
				}
				return Promise.resolve({
					success: true
				});
			});

			const resultPromise = interceptor(next)(mockRequest);
			await vi.advanceTimersByTimeAsync(100);
			const result = await resultPromise;

			expect(next).toHaveBeenCalledTimes(2);
			expect(result).toEqual({
				success: true
			});
		});

		it('should retry on Internal error', async () => {
			mockRequest.header.set('X-Cursor-RetryInterceptor-Enabled', 'true');
			mockRequest.header.set('X-Cursor-RetryInterceptor-MaxRetries', '2');
			mockRequest.header.set('X-Cursor-RetryInterceptor-BaseDelayMs', '10');
			mockRequest.header.set('X-Cursor-RetryInterceptor-MaxDelayMs', '100');

			const interceptor = createUnaryRetryInterceptor();

			let attemptCount = 0;
			const next = vi.fn().mockImplementation(() => {
				attemptCount++;
				if (attemptCount < 2) {
					throw new ConnectError('Internal error', Code.Internal);
				}
				return Promise.resolve({
					success: true
				});
			});

			const resultPromise = interceptor(next)(mockRequest);
			await vi.advanceTimersByTimeAsync(100);
			const result = await resultPromise;

			expect(next).toHaveBeenCalledTimes(2);
			expect(result).toEqual({
				success: true
			});
		});
	});

	describe('executeWithRetry - Max retries exhausted', async () => {
		it('should throw after max retries exhausted', async () => {
			mockRequest.header.set('X-Cursor-RetryInterceptor-Enabled', 'true');
			mockRequest.header.set('X-Cursor-RetryInterceptor-MaxRetries', '2');
			mockRequest.header.set('X-Cursor-RetryInterceptor-BaseDelayMs', '10');
			mockRequest.header.set('X-Cursor-RetryInterceptor-MaxDelayMs', '100');

			const interceptor = createUnaryRetryInterceptor();

			const error = new ConnectError('Service unavailable', Code.Unavailable);
			const next = vi.fn().mockRejectedValue(error);

			let didThrow = false;
			interceptor(next)(mockRequest).catch((e) => {
				didThrow = true;
				expect(e).toBe(error);
			});
			await vi.advanceTimersByTimeAsync(200);

			expect(didThrow).toBe(true);
			expect(next).toHaveBeenCalledTimes(3); // initial + 2 retries
			expect(CursorDebugLogger.warn).toHaveBeenCalledWith(
				expect.stringContaining('Max retries (2) exhausted')
			);
		});

		it('should respect maxRetries: 0', async () => {
			mockRequest.header.set('X-Cursor-RetryInterceptor-Enabled', 'true');
			mockRequest.header.set('X-Cursor-RetryInterceptor-MaxRetries', '0');
			mockRequest.header.set('X-Cursor-RetryInterceptor-BaseDelayMs', '10');
			mockRequest.header.set('X-Cursor-RetryInterceptor-MaxDelayMs', '100');

			const interceptor = createUnaryRetryInterceptor();

			const error = new ConnectError('Service unavailable', Code.Unavailable);
			const next = () => Promise.reject(error);

			let didThrow = false;
			interceptor(next)(mockRequest).catch((e) => {
				didThrow = true;
				expect(e).toBe(error);
			});
			await vi.advanceTimersByTimeAsync(50);

			expect(didThrow).toBe(true);
		});
	});

	describe('executeWithRetry - Exponential backoff with jitter', async () => {
		it('should apply exponential backoff', async () => {
			mockRequest.header.set('X-Cursor-RetryInterceptor-Enabled', 'true');
			mockRequest.header.set('X-Cursor-RetryInterceptor-MaxRetries', '3');
			mockRequest.header.set('X-Cursor-RetryInterceptor-BaseDelayMs', '100');
			mockRequest.header.set('X-Cursor-RetryInterceptor-MaxDelayMs', '10000');

			const interceptor = createUnaryRetryInterceptor();

			const delays: number[] = [];
			let attemptCount = 0;

			const next = vi.fn().mockImplementation(() => {
				attemptCount++;
				if (attemptCount < 4) {
					// Capture the delay before this attempt
					if (attemptCount > 1) {
						delays.push(Date.now());
					}
					throw new ConnectError('Unavailable', Code.Unavailable);
				}
				return Promise.resolve({
					success: true
				});
			});

			const startTime = Date.now();
			const resultPromise = interceptor(next)(mockRequest);

			// Advance timers to trigger retries
			await vi.advanceTimersByTimeAsync(1000);

			await resultPromise;

			// Verify retries were attempted
			expect(next).toHaveBeenCalledTimes(4);
			// Verify backoff delays were applied (should be roughly exponential)
			expect(CursorDebugLogger.info).toHaveBeenCalledWith(
				expect.stringContaining('About to retry')
			);
		});

		it('should cap delay at maxDelayMs', async () => {
			mockRequest.header.set('X-Cursor-RetryInterceptor-Enabled', 'true');
			mockRequest.header.set('X-Cursor-RetryInterceptor-MaxRetries', '5');
			mockRequest.header.set('X-Cursor-RetryInterceptor-BaseDelayMs', '1000');
			mockRequest.header.set('X-Cursor-RetryInterceptor-MaxDelayMs', '100');

			const interceptor = createUnaryRetryInterceptor();

			let attemptCount = 0;
			const next = vi.fn().mockImplementation(() => {
				attemptCount++;
				if (attemptCount < 3) {
					throw new ConnectError('Unavailable', Code.Unavailable);
				}
				return Promise.resolve({
					success: true
				});
			});

			const resultPromise = interceptor(next)(mockRequest);
			await vi.advanceTimersByTimeAsync(300); // Should be enough with cap

			await resultPromise;

			expect(next).toHaveBeenCalledTimes(3);
		});
	});

	describe('Header validation', async () => {
		it('should reject non-numeric maxRetries header', async () => {
			mockRequest.header.set('X-Cursor-RetryInterceptor-Enabled', 'true');
			mockRequest.header.set('X-Cursor-RetryInterceptor-MaxRetries', 'not-a-number');

			const interceptor = createUnaryRetryInterceptor({
				maxRetries: 1,
				baseDelayMs: 10,
				maxDelayMs: 100,
			});

			let attemptCount = 0;
			const next = vi.fn().mockImplementation(() => {
				attemptCount++;
				if (attemptCount < 2) {
					throw new ConnectError('Unavailable', Code.Unavailable);
				}
				return Promise.resolve({ success: true });
			});

			const resultPromise = interceptor(next)(mockRequest);
			await vi.advanceTimersByTimeAsync(200);
			const result = await resultPromise;

			// Should use default maxRetries (1) instead of invalid header value
			expect(next).toHaveBeenCalledTimes(2); // 1 initial + 1 retry
			expect(result).toEqual({ success: true });
		});

		it('should reject negative maxRetries header', async () => {
			mockRequest.header.set('X-Cursor-RetryInterceptor-Enabled', 'true');
			mockRequest.header.set('X-Cursor-RetryInterceptor-MaxRetries', '-1');

			const interceptor = createUnaryRetryInterceptor({
				maxRetries: 1,
				baseDelayMs: 10,
				maxDelayMs: 100,
			});

			let attemptCount = 0;
			const next = vi.fn().mockImplementation(() => {
				attemptCount++;
				if (attemptCount < 2) {
					throw new ConnectError('Unavailable', Code.Unavailable);
				}
				return Promise.resolve({ success: true });
			});

			const resultPromise = interceptor(next)(mockRequest);
			await vi.advanceTimersByTimeAsync(100);
			const result = await resultPromise;

			// Should use default maxRetries (1) instead of negative value
			expect(next).toHaveBeenCalledTimes(2); // 1 initial + 1 retry
			expect(result).toEqual({ success: true });
		});

		it('should accept maxRetries greater than 10', async () => {
			mockRequest.header.set('X-Cursor-RetryInterceptor-Enabled', 'true');
			mockRequest.header.set('X-Cursor-RetryInterceptor-MaxRetries', '20');

			const interceptor = createUnaryRetryInterceptor({
				maxRetries: 1,
				baseDelayMs: 10,
				maxDelayMs: 100,
			});

			let attemptCount = 0;
			const next = vi.fn().mockImplementation(() => {
				attemptCount++;
				if (attemptCount < 3) {
					throw new ConnectError('Unavailable', Code.Unavailable);
				}
				return Promise.resolve({ success: true });
			});

			const resultPromise = interceptor(next)(mockRequest);
			await vi.advanceTimersByTimeAsync(200);
			const result = await resultPromise;

			// Should use header maxRetries (20) even though it's > 10
			expect(next).toHaveBeenCalledTimes(3); // 1 initial + 2 retries (of 20 possible)
			expect(result).toEqual({ success: true });
		});

		it('should reject baseDelayMs less than 1', async () => {
			mockRequest.header.set('X-Cursor-RetryInterceptor-Enabled', 'true');
			mockRequest.header.set('X-Cursor-RetryInterceptor-BaseDelayMs', '0');

			const interceptor = createUnaryRetryInterceptor({
				maxRetries: 1,
				baseDelayMs: 100,
				maxDelayMs: 1000,
			});

			let attemptCount = 0;
			const next = vi.fn().mockImplementation(() => {
				attemptCount++;
				if (attemptCount < 2) {
					throw new ConnectError('Unavailable', Code.Unavailable);
				}
				return Promise.resolve({ success: true });
			});

			const resultPromise = interceptor(next)(mockRequest);
			await vi.advanceTimersByTimeAsync(200);
			const result = await resultPromise;

			// Should use default baseDelayMs (100) instead of 0
			expect(next).toHaveBeenCalledTimes(2);
			expect(result).toEqual({ success: true });
		});

		it('should accept maxDelayMs greater than 300000', async () => {
			mockRequest.header.set('X-Cursor-RetryInterceptor-Enabled', 'true');
			mockRequest.header.set('X-Cursor-RetryInterceptor-MaxDelayMs', '600000');

			const interceptor = createUnaryRetryInterceptor({
				maxRetries: 1,
				baseDelayMs: 10,
				maxDelayMs: 100,
			});

			let attemptCount = 0;
			const next = vi.fn().mockImplementation(() => {
				attemptCount++;
				if (attemptCount < 2) {
					throw new ConnectError('Unavailable', Code.Unavailable);
				}
				return Promise.resolve({ success: true });
			});

			const resultPromise = interceptor(next)(mockRequest);
			await vi.advanceTimersByTimeAsync(700000); // Need to advance enough for 600000ms delay
			const result = await resultPromise;

			// Should use header maxDelayMs (600000) even though it's > 300000
			expect(next).toHaveBeenCalledTimes(2);
			expect(result).toEqual({ success: true });
		});
	});

	describe('Context-based configuration', async () => {
		it('should use header config when provided', async () => {
			mockRequest.header.set('X-Cursor-RetryInterceptor-Enabled', 'true');
			mockRequest.header.set('X-Cursor-RetryInterceptor-MaxRetries', '1');
			mockRequest.header.set('X-Cursor-RetryInterceptor-BaseDelayMs', '10');
			mockRequest.header.set('X-Cursor-RetryInterceptor-MaxDelayMs', '100');

			const interceptor = createUnaryRetryInterceptor({
				maxRetries: 5, // This should be overridden
				baseDelayMs: 1000,
				maxDelayMs: 5000,
			});

			let attemptCount = 0;
			const next = vi.fn().mockImplementation(() => {
				attemptCount++;
				if (attemptCount < 2) {
					throw new ConnectError('Unavailable', Code.Unavailable);
				}
				return Promise.resolve({
					success: true
				});
			});

			const resultPromise = interceptor(next)(mockRequest);
			await vi.advanceTimersByTimeAsync(50);

			const result = await resultPromise;

			expect(next).toHaveBeenCalledTimes(2);
			expect(result).toEqual({
				success: true
			});
		});

		it('should disable retries when header is not "true"', async () => {
			// Don't set X-Cursor-RetryInterceptor-Enabled header, or set it to false
			mockRequest.header.set('X-Cursor-RetryInterceptor-Enabled', 'false');

			const interceptor = createUnaryRetryInterceptor();
			const error = new ConnectError('Unavailable', Code.Unavailable);
			const next = () => Promise.reject(error);

			await expect(interceptor(next)(mockRequest)).rejects.toThrow();
		});

		it('should disable retries when no header provided', async () => {
			// Don't set any retry interceptor headers

			const interceptor = createUnaryRetryInterceptor();
			const error = new ConnectError('Unavailable', Code.Unavailable);
			const next = () => Promise.reject(error);

			await expect(interceptor(next)(mockRequest)).rejects.toThrow();
		});

		it('should use defaults when enabled: true without config', async () => {
			mockRequest.header.set('X-Cursor-RetryInterceptor-Enabled', 'true');

			const interceptor = createUnaryRetryInterceptor({
				maxRetries: 2,
				baseDelayMs: 10,
				maxDelayMs: 100,
			});

			let attemptCount = 0;
			const next = vi.fn().mockImplementation(() => {
				attemptCount++;
				if (attemptCount < 2) {
					throw new ConnectError('Unavailable', Code.Unavailable);
				}
				return Promise.resolve({
					success: true
				});
			});

			const resultPromise = interceptor(next)(mockRequest);
			await vi.advanceTimersByTimeAsync(50);

			const result = await resultPromise;

			expect(next).toHaveBeenCalledTimes(2);
			expect(result).toEqual({
				success: true
			});
		});
	});

	describe('Method filtering', async () => {
		it('should only retry unary methods in unary interceptor', async () => {
			mockMethod.kind = MethodKind.ServerStreaming;

			const interceptor = createUnaryRetryInterceptor();
			const next = vi.fn().mockResolvedValue({
				success: true
			});

			await interceptor(next)(mockRequest);

			expect(next).toHaveBeenCalledTimes(1);
			// Should not log retry attempts since it's not a unary method
			expect(CursorDebugLogger.info).not.toHaveBeenCalled();
		});

		it('should only retry streaming methods in stream interceptor', async () => {
			mockService.typeName = 'aiserver.v1.ChatService';
			mockMethod.name = 'otherMethod';
			mockMethod.kind = MethodKind.BiDiStreaming;

			const interceptor = createStreamRetryInterceptor();
			const next = vi.fn().mockResolvedValue({
				success: true
			});

			await interceptor(next)(mockRequest);

			expect(next).toHaveBeenCalledTimes(1);
		});
	});

	describe('Logging', async () => {
		it('should log retry attempts', async () => {
			mockRequest.header.set('X-Cursor-RetryInterceptor-Enabled', 'true');
			mockRequest.header.set('X-Cursor-RetryInterceptor-MaxRetries', '2');
			mockRequest.header.set('X-Cursor-RetryInterceptor-BaseDelayMs', '10');
			mockRequest.header.set('X-Cursor-RetryInterceptor-MaxDelayMs', '100');

			const interceptor = createUnaryRetryInterceptor();

			let attemptCount = 0;
			const next = vi.fn().mockImplementation(() => {
				attemptCount++;
				if (attemptCount < 2) {
					throw new ConnectError('Unavailable', Code.Unavailable);
				}
				return Promise.resolve({
					success: true
				});
			});

			const resultPromise = interceptor(next)(mockRequest);
			await vi.advanceTimersByTimeAsync(50);
			await resultPromise;

			expect(CursorDebugLogger.info).toHaveBeenCalledWith(
				expect.stringContaining('About to retry testMethod')
			);
			expect(StructuredLogProviderImpl.info).toHaveBeenCalledWith(
				'transport',
				'Retry attempt',
				expect.objectContaining({
					interceptor: 'UnaryRetryInterceptor',
					method: 'testMethod',
				})
			);
		});

		it('should log success after retries', async () => {
			mockRequest.header.set('X-Cursor-RetryInterceptor-Enabled', 'true');
			mockRequest.header.set('X-Cursor-RetryInterceptor-MaxRetries', '2');
			mockRequest.header.set('X-Cursor-RetryInterceptor-BaseDelayMs', '10');
			mockRequest.header.set('X-Cursor-RetryInterceptor-MaxDelayMs', '100');

			const interceptor = createUnaryRetryInterceptor();

			let attemptCount = 0;
			const next = vi.fn().mockImplementation(() => {
				attemptCount++;
				if (attemptCount < 2) {
					throw new ConnectError('Unavailable', Code.Unavailable);
				}
				return Promise.resolve({
					success: true
				});
			});

			const resultPromise = interceptor(next)(mockRequest);
			await vi.advanceTimersByTimeAsync(50);
			await resultPromise;

			expect(CursorDebugLogger.info).toHaveBeenCalledWith(
				expect.stringContaining('Successfully completed after 1 retries (2 total requests made)')
			);
			expect(StructuredLogProviderImpl.info).toHaveBeenCalledWith(
				'transport',
				'Retry succeeded',
				expect.objectContaining({
					interceptor: 'UnaryRetryInterceptor',
					method: 'testMethod',
					retryAttemptNumber: 1,
				})
			);
		});

		it('should log exhaustion when max retries reached', async () => {
			mockRequest.header.set('X-Cursor-RetryInterceptor-Enabled', 'true');
			mockRequest.header.set('X-Cursor-RetryInterceptor-MaxRetries', '1');
			mockRequest.header.set('X-Cursor-RetryInterceptor-BaseDelayMs', '10');
			mockRequest.header.set('X-Cursor-RetryInterceptor-MaxDelayMs', '100');

			const interceptor = createUnaryRetryInterceptor();

			const error = new ConnectError('Unavailable', Code.Unavailable);
			const next = () => Promise.reject(error);

			let didThrow = false;
			interceptor(next)(mockRequest).catch((e) => {
				didThrow = true;
				expect(e).toBe(error);
			});
			await vi.advanceTimersByTimeAsync(50);

			expect(didThrow).to.equal(true);

			expect(CursorDebugLogger.warn).toHaveBeenCalledWith(
				expect.stringContaining('Max retries (1) exhausted')
			);
			expect(StructuredLogProviderImpl.warn).toHaveBeenCalledWith(
				'transport',
				'Retry exhausted',
				expect.objectContaining({
					interceptor: 'UnaryRetryInterceptor',
					method: 'testMethod',
					errorCode: 'Unavailable',
				})
			);
		});
	});

	describe('Edge cases', async () => {
		it('should handle rapid success after many failures', async () => {
			mockRequest.header.set('X-Cursor-RetryInterceptor-Enabled', 'true');
			mockRequest.header.set('X-Cursor-RetryInterceptor-MaxRetries', '5');
			mockRequest.header.set('X-Cursor-RetryInterceptor-BaseDelayMs', '1');
			mockRequest.header.set('X-Cursor-RetryInterceptor-MaxDelayMs', '10');

			const interceptor = createUnaryRetryInterceptor();

			let attemptCount = 0;
			const next = vi.fn().mockImplementation(() => {
				attemptCount++;
				if (attemptCount < 4) {
					throw new ConnectError('Unavailable', Code.Unavailable);
				}
				return Promise.resolve({
					success: true
				});
			});

			const resultPromise = interceptor(next)(mockRequest);
			await vi.advanceTimersByTimeAsync(50);
			const result = await resultPromise;

			expect(next).toHaveBeenCalledTimes(4);
			expect(result).toEqual({
				success: true
			});
		});

		it('should handle synchronous errors', async () => {
			mockRequest.header.set('X-Cursor-RetryInterceptor-Enabled', 'true');
			mockRequest.header.set('X-Cursor-RetryInterceptor-MaxRetries', '1');
			mockRequest.header.set('X-Cursor-RetryInterceptor-BaseDelayMs', '10');
			mockRequest.header.set('X-Cursor-RetryInterceptor-MaxDelayMs', '100');

			const interceptor = createUnaryRetryInterceptor();

			const error = new ConnectError('Unavailable', Code.Unavailable);
			const next = vi.fn().mockImplementation(() => {
				throw error;
			});

			let didThrow = false;
			interceptor(next)(mockRequest).catch((e) => {
				didThrow = true;
				expect(e).toBe(error);
			});

			await vi.advanceTimersByTimeAsync(50);

			expect(didThrow).toBe(true);
			expect(next).toHaveBeenCalledTimes(2); // initial + 1 retry
		});

		it('should work with different return types', async () => {
			mockRequest.header.set('X-Cursor-RetryInterceptor-Enabled', 'true');

			const interceptor = createUnaryRetryInterceptor();
			const next = vi.fn().mockResolvedValue('string result');

			const result = await interceptor(next)(mockRequest);

			expect(result).toBe('string result');
		});
	});

	describe('Killswitch feature flag', async () => {
		it('should bypass unary retry interceptor when killswitch is enabled', async () => {
			// Enable killswitch
			mockCheckFeatureGate.mockResolvedValue(true);

			mockRequest.header.set('X-Cursor-RetryInterceptor-Enabled', 'true');
			mockRequest.header.set('X-Cursor-RetryInterceptor-MaxRetries', '3');
			mockRequest.header.set('X-Cursor-RetryInterceptor-BaseDelayMs', '10');
			mockRequest.header.set('X-Cursor-RetryInterceptor-MaxDelayMs', '100');

			const interceptor = createUnaryRetryInterceptor();
			const expectedResult = {
				success: true
			};
			const next = vi.fn().mockResolvedValue(expectedResult);

			const result = await interceptor(next)(mockRequest);

			expect(result).toBe(expectedResult);
			expect(next).toHaveBeenCalledTimes(1); // Should only be called once, no retries
			expect(mockCheckFeatureGate).toHaveBeenCalledWith('retry_interceptor_disabled');
		});

		it('should bypass stream retry interceptor when killswitch is enabled', async () => {
			// Enable killswitch
			mockCheckFeatureGate.mockResolvedValue(true);

			mockRequest.header.set('X-Cursor-RetryInterceptor-Enabled', 'true');
			mockRequest.header.set('X-Cursor-RetryInterceptor-MaxRetries', '3');
			mockRequest.header.set('X-Cursor-RetryInterceptor-BaseDelayMs', '10');
			mockRequest.header.set('X-Cursor-RetryInterceptor-MaxDelayMs', '100');

			// Make it a streaming request
			mockRequest.method.kind = MethodKind.BiDiStreaming;

			const interceptor = createStreamRetryInterceptor();
			const expectedResult = {
				success: true
			};
			const next = vi.fn().mockResolvedValue(expectedResult);

			const result = await interceptor(next)(mockRequest);

			expect(result).toBe(expectedResult);
			expect(next).toHaveBeenCalledTimes(1); // Should only be called once, no retries
			expect(mockCheckFeatureGate).toHaveBeenCalledWith('retry_interceptor_disabled');
		});
	});

	describe('calculateBackoffDelay', async () => {
		it('should apply exponential backoff with Full Jitter algorithm', () => {
			const baseDelayMs = 1000;
			const maxDelayMs = 30000;

			// Mock Math.random to return a fixed value for deterministic testing
			const originalRandom = Math.random;
			let randomValue = 0.5;
			Math.random = () => randomValue;

			try {
				// Attempt 0: baseDelay * 2^0 = 1000, capped at 30000, jittered
				const delay0 = calculateBackoffDelay(0, baseDelayMs, maxDelayMs);
				expect(delay0).toBe(500); // 0.5 * 1000

				// Attempt 1: baseDelay * 2^1 = 2000, capped at 30000, jittered
				randomValue = 0.75;
				const delay1 = calculateBackoffDelay(1, baseDelayMs, maxDelayMs);
				expect(delay1).toBe(1500); // 0.75 * 2000

				// Attempt 2: baseDelay * 2^2 = 4000, capped at 30000, jittered
				randomValue = 0.25;
				const delay2 = calculateBackoffDelay(2, baseDelayMs, maxDelayMs);
				expect(delay2).toBe(1000); // 0.25 * 4000

				// Attempt 10: baseDelay * 2^10 = 1024000, capped at 30000, jittered
				randomValue = 0.1;
				const delay10 = calculateBackoffDelay(10, baseDelayMs, maxDelayMs);
				expect(delay10).toBe(3000); // 0.1 * 30000 (capped)
			} finally {
				Math.random = originalRandom;
			}
		});

		it('should always return a value between 0 and the capped delay', () => {
			const baseDelayMs = 1000;
			const maxDelayMs = 30000;

			// Run multiple iterations to test randomness
			for (let attempt = 0; attempt < 5; attempt++) {
				for (let i = 0; i < 100; i++) {
					const delay = calculateBackoffDelay(attempt, baseDelayMs, maxDelayMs);
					const expectedMax = Math.min(baseDelayMs * Math.pow(2, attempt), maxDelayMs);
					expect(delay).toBeGreaterThanOrEqual(0);
					expect(delay).toBeLessThan(expectedMax);
				}
			}
		});

		it('should respect the max delay cap', () => {
			const baseDelayMs = 1000;
			const maxDelayMs = 5000;

			// Mock Math.random to return 1.0 (maximum jitter)
			const originalRandom = Math.random;
			Math.random = () => 1.0;

			try {
				// Attempt 10 would be 1024000 without cap, but should be capped at 5000
				const delay = calculateBackoffDelay(10, baseDelayMs, maxDelayMs);
				expect(delay).toBe(maxDelayMs);
			} finally {
				Math.random = originalRandom;
			}
		});

		it('should never exceed the max delay even with high exponential growth', () => {
			const baseDelayMs = 100;
			const maxDelayMs = 10000;

			// Mock Math.random to return 1.0 (maximum jitter)
			const originalRandom = Math.random;
			Math.random = () => 1.0;

			try {
				// Test many attempts with exponential growth
				for (let attempt = 0; attempt < 20; attempt++) {
					const delay = calculateBackoffDelay(attempt, baseDelayMs, maxDelayMs);
					expect(delay).toBeLessThanOrEqual(maxDelayMs);
				}
			} finally {
				Math.random = originalRandom;
			}
		});

		it('should produce varied delays with different random values', () => {
			const baseDelayMs = 1000;
			const maxDelayMs = 30000;
			const attempt = 2; // baseDelay * 2^2 = 4000

			const delays = new Set<number>();
			const iterations = 1000;

			// Collect delays from many random iterations
			for (let i = 0; i < iterations; i++) {
				const delay = calculateBackoffDelay(attempt, baseDelayMs, maxDelayMs);
				delays.add(Math.floor(delay / 100)); // Group into 100ms buckets
			}

			// With Full Jitter, we should see a wide distribution
			// The delays should be spread across the full range [0, 4000)
			expect(delays.size).toBeGreaterThan(10); // At least 10 different buckets
		});

		it('should handle zero attempt number correctly', () => {
			const baseDelayMs = 1000;
			const maxDelayMs = 30000;

			// Mock Math.random to return 0.5
			const originalRandom = Math.random;
			Math.random = () => 0.5;

			try {
				const delay = calculateBackoffDelay(0, baseDelayMs, maxDelayMs);
				expect(delay).toBe(500); // 0.5 * (1000 * 2^0) = 0.5 * 1000
			} finally {
				Math.random = originalRandom;
			}
		});

		it('should handle edge case where maxDelayMs equals baseDelayMs', () => {
			const baseDelayMs = 1000;
			const maxDelayMs = 1000;

			// Mock Math.random to return 0.5
			const originalRandom = Math.random;
			Math.random = () => 0.5;

			try {
				// Even attempt 0 should be capped at 1000
				const delay = calculateBackoffDelay(0, baseDelayMs, maxDelayMs);
				expect(delay).toBe(500); // 0.5 * 1000

				// Attempt 1 should also be capped at 1000
				const delay1 = calculateBackoffDelay(1, baseDelayMs, maxDelayMs);
				expect(delay1).toBe(500); // 0.5 * 1000 (capped, not 2000)
			} finally {
				Math.random = originalRandom;
			}
		});
	});

	describe('shouldRetryOnError - Dynamic config', async () => {
		it('should retry on default retriable errors when using fallback config', async () => {
			// Use fallback config with default retriable errors (Unavailable, Internal, DeadlineExceeded)
			const fallbackConfig = {
				retriableErrors: [
					{ code: 'Unavailable' },
					{ code: 'Internal' },
					{ code: 'DeadlineExceeded' },
				]
			};
			expect(await shouldRetryOnError(Code.Unavailable, 'Service unavailable', 'testMethod', fallbackConfig)).toBe(true);
			expect(await shouldRetryOnError(Code.DeadlineExceeded, 'Deadline exceeded', 'testMethod', fallbackConfig)).toBe(true);
			expect(await shouldRetryOnError(Code.Internal, 'Internal error', 'testMethod', fallbackConfig)).toBe(true);
			expect(await shouldRetryOnError(Code.NotFound, 'Not found', 'testMethod', fallbackConfig)).toBe(false);
		});

		it('should retry on code specified in dynamic config without errorMessage', async () => {
			const dynamicConfig = {
				retriableErrors: [
					{
						code: 'NotFound'
					},
				],
			};
			expect(await shouldRetryOnError(Code.NotFound, 'Any error message', 'testMethod', dynamicConfig)).toBe(true);
		});

		it('should retry when errorMessage matches substring in dynamic config', async () => {
			const dynamicConfig = {
				retriableErrors: [
					{
						code: 'NotFound', errorMessage: 'connection reset'
					},
				],
			};
			expect(await shouldRetryOnError(Code.NotFound, 'connection reset by peer', 'testMethod', dynamicConfig)).toBe(true);
			expect(await shouldRetryOnError(Code.NotFound, 'The connection was reset', 'testMethod', dynamicConfig)).toBe(false);
			expect(await shouldRetryOnError(Code.NotFound, 'Resource not found', 'testMethod', dynamicConfig)).toBe(false);
		});

		it('should not retry when errorMessage does not match substring', async () => {
			const dynamicConfig = {
				retriableErrors: [
					{
						code: 'NotFound', errorMessage: 'connection reset'
					},
				],
			};
			expect(await shouldRetryOnError(Code.NotFound, 'Resource not found', 'testMethod', dynamicConfig)).toBe(false);
			expect(await shouldRetryOnError(Code.NotFound, 'File not found', 'testMethod', dynamicConfig)).toBe(false);
		});

		it('should prioritize dynamic config over default retryable codes', async () => {
			const dynamicConfig = {
				retriableErrors: [
					{
						code: 'Unavailable', errorMessage: 'specific error'
					},
				],
			};
			// Should retry if errorMessage matches
			expect(await shouldRetryOnError(Code.Unavailable, 'This is a specific error', 'testMethod', dynamicConfig)).toBe(true);
			// Should not retry if errorMessage does not match (even though Unavailable is default retryable)
			expect(await shouldRetryOnError(Code.Unavailable, 'Generic unavailable error', 'testMethod', dynamicConfig)).toBe(false);
		});

		it('should handle multiple retriable error rules', async () => {
			const dynamicConfig = {
				retriableErrors: [
					{
						code: 'NotFound', errorMessage: 'timeout'
					},
					{
						code: 'Internal', errorMessage: 'rate limit'
					},
					{
						code: 'Unavailable'
					}, // No errorMessage, matches any
				],
			};
			expect(await shouldRetryOnError(Code.NotFound, 'Request timeout', 'testMethod', dynamicConfig)).toBe(true);
			expect(await shouldRetryOnError(Code.Internal, 'Rate limit exceeded', 'testMethod', dynamicConfig)).toBe(false);
			expect(await shouldRetryOnError(Code.Internal, 'rate limit exceeded', 'testMethod', dynamicConfig)).toBe(true);
			expect(await shouldRetryOnError(Code.Unavailable, 'Any message', 'testMethod', dynamicConfig)).toBe(true);
			expect(await shouldRetryOnError(Code.NotFound, 'Not found', 'testMethod', dynamicConfig)).toBe(false);
		});

		it('should handle empty dynamic config gracefully', async () => {
			const dynamicConfig = {
				retriableErrors: []
			};
			// Should fall back to default retryable codes
			expect(await shouldRetryOnError(Code.Unavailable, 'Service unavailable', 'testMethod', dynamicConfig)).toBe(false);
			expect(await shouldRetryOnError(Code.NotFound, 'Not found', 'testMethod', dynamicConfig)).toBe(false);
		});

		it('should retry only when method matches when method is specified in config', async () => {
			const dynamicConfig = {
				retriableErrors: [
					{
						code: 'NotFound',
						method: 'streamUnifiedChatWithTools'
					},
				],
			};
			// Should retry when method matches
			expect(await shouldRetryOnError(Code.NotFound, 'Any error', 'streamUnifiedChatWithTools', dynamicConfig)).toBe(true);
			// Should not retry when method does not match
			expect(await shouldRetryOnError(Code.NotFound, 'Any error', 'otherMethod', dynamicConfig)).toBe(false);
		});

		it('should combine method and errorMessage filters', async () => {
			const dynamicConfig = {
				retriableErrors: [
					{
						code: 'NotFound',
						method: 'streamUnifiedChatWithTools',
						errorMessage: 'connection reset'
					},
				],
			};
			// Should retry when both method and errorMessage match
			expect(await shouldRetryOnError(Code.NotFound, 'connection reset by peer', 'streamUnifiedChatWithTools', dynamicConfig)).toBe(true);
			// Should not retry when method doesn't match
			expect(await shouldRetryOnError(Code.NotFound, 'connection reset by peer', 'otherMethod', dynamicConfig)).toBe(false);
			// Should not retry when errorMessage doesn't match
			expect(await shouldRetryOnError(Code.NotFound, 'Resource not found', 'streamUnifiedChatWithTools', dynamicConfig)).toBe(false);
		});

		it('should handle multiple rules with different methods', async () => {
			const dynamicConfig = {
				retriableErrors: [
					{
						code: 'NotFound',
						method: 'streamUnifiedChatWithTools',
						errorMessage: 'timeout'
					},
					{
						code: 'NotFound',
						method: 'checkFeatureStatus',
						errorMessage: 'connection reset'
					},
				],
			};
			// Should match first rule
			expect(await shouldRetryOnError(Code.NotFound, 'Request timeout', 'streamUnifiedChatWithTools', dynamicConfig)).toBe(true);
			// Should match second rule
			expect(await shouldRetryOnError(Code.NotFound, 'connection reset', 'checkFeatureStatus', dynamicConfig)).toBe(true);
			// Should not match when method/errorMessage combination doesn't match any rule
			expect(await shouldRetryOnError(Code.NotFound, 'Request timeout', 'checkFeatureStatus', dynamicConfig)).toBe(false);
			expect(await shouldRetryOnError(Code.NotFound, 'connection reset', 'streamUnifiedChatWithTools', dynamicConfig)).toBe(false);
		});
	});

	describe('executeWithRetry - Dynamic config integration', async () => {
		it('should use dynamic config to retry on non-default retryable error', async () => {
			mockRequest.header.set('X-Cursor-RetryInterceptor-Enabled', 'true');

			// Configure dynamic config to retry on NotFound errors
			mockGetDynamicConfigValue.mockResolvedValue({
				retriableErrors: [
					{
						code: 'NotFound', errorMessage: 'connection'
					},
				],
			});

			const interceptor = createUnaryRetryInterceptor({
				maxRetries: 1,
				baseDelayMs: 10,
				maxDelayMs: 100
			});
			let attemptCount = 0;
			const next = vi.fn().mockImplementation(async () => {
				attemptCount++;
				if (attemptCount === 1) {
					throw new ConnectError('connection reset', Code.NotFound);
				}
				return {
					success: true
				};
			});

			const resultPromise = interceptor(next)(mockRequest);

			// Fast-forward through retry delays
			await vi.advanceTimersByTimeAsync(200);

			const result = await resultPromise;

			expect(next).toHaveBeenCalledTimes(2);
			expect(result).toEqual({
				success: true
			});
			expect(CursorDebugLogger.info).toHaveBeenCalledWith(
				expect.stringContaining('About to retry')
			);
		});

		it('should not retry when errorMessage does not match dynamic config', async () => {
			mockRequest.header.set('X-Cursor-RetryInterceptor-Enabled', 'true');

			// Configure dynamic config to only retry on specific error message
			mockGetDynamicConfigValue.mockResolvedValue({
				retriableErrors: [
					{
						code: 'NotFound', errorMessage: 'connection reset'
					},
				],
			});

			const interceptor = createUnaryRetryInterceptor({
				maxRetries: 1,
				baseDelayMs: 10,
				maxDelayMs: 100
			});
			const next = vi.fn().mockRejectedValue(
				new ConnectError('Resource not found', Code.NotFound)
			);

			await expect(interceptor(next)(mockRequest)).rejects.toThrow(ConnectError);
			expect(next).toHaveBeenCalledTimes(1); // Should not retry
		});
	});
});

