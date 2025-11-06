"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// Global test setup
jest.setTimeout(10000);
// Mock console.log to reduce noise in tests unless debugging
if (!process.env.DEBUG_TESTS) {
    global.console = {
        ...console,
        log: jest.fn(),
        info: jest.fn(),
    };
}
//# sourceMappingURL=setup.js.map