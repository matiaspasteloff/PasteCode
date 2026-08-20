export { isRpcRequest, isRpcResponse, RPC_TIMEOUT_MS } from './protocol.js';
export type { RpcError, RpcMessage, RpcRequest, RpcResponse } from './protocol.js';
export { createRpcEndpoint } from './rpc.js';
export type { RpcEndpoint, RpcEndpointConfig, RpcHandler } from './rpc.js';
export { ExtensionManifestSchema } from './manifest.js';
export type { ValidatedManifest } from './manifest.js';
export { matchesActivation } from './activation.js';
export type { ActivationTrigger } from './activation.js';
export { assertCapability } from './capabilities.js';
export { createExtensionApi, forgetExtensionCommands, runRegisteredCommand } from './api.js';
export type { ApiContext, EditorSnapshot } from './api.js';
export { createExtensionRuntime } from './runtime.js';
export type {
  ExtensionReport,
  ExtensionRuntime,
  ExtensionState,
  LoadResult,
} from './runtime.js';
export { readThemes } from './themes.js';
export type { LoadedTheme } from './themes.js';
export { HOST_METHODS, MAIN_METHODS } from './protocol.js';
export { scanExtensions } from './scan.js';
export type { DiscoveredExtension, ExtensionFailure, ScanResult } from './scan.js';
