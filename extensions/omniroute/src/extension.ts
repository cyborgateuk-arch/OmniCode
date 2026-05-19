/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as http from 'http';
import * as https from 'https';
import * as path from 'path';
import * as vm from 'vm';
import { execFileSync, spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import * as vscode from 'vscode';

type ProviderCategory =
	| 'free'
	| 'oauth'
	| 'web-cookie'
	| 'apikey'
	| 'local'
	| 'search'
	| 'audio'
	| 'upstream-proxy';

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
interface JsonObject {
	readonly [key: string]: JsonValue | undefined;
}

interface ProviderCatalogEntry {
	readonly id: string;
	readonly name: string;
	readonly color?: string;
	readonly category: ProviderCategory;
	readonly authHint?: string;
	readonly apiHint?: string;
	readonly website?: string;
	readonly deprecated?: boolean;
	readonly deprecationReason?: string;
}

interface ProviderSetupGuide {
	readonly title: string;
	readonly summary: string;
	readonly website?: string;
	readonly credentialPrompt?: string;
	readonly credentialPlaceholder?: string;
	readonly callbackPrompt?: string;
	readonly steps: readonly string[];
	readonly methods?: readonly ProviderSetupMethod[];
}

interface ProviderSetupMethod {
	readonly id: string;
	readonly label: string;
	readonly description: string;
	readonly detail?: string;
}

interface ListeningProcessInfo {
	readonly pid: number;
	readonly ppid?: number;
	readonly command?: string;
	readonly cwd?: string;
}

interface ProviderConnection {
	readonly id: string;
	readonly provider: string;
	readonly authType?: string;
	readonly name?: string;
	readonly email?: string;
	readonly displayName?: string;
	readonly defaultModel?: string | null;
	readonly isActive?: boolean;
	readonly testStatus?: string;
	readonly lastError?: string;
	readonly lastTested?: string;
	readonly rateLimitProtection?: boolean;
	readonly updatedAt?: string;
}

interface UsageStats {
	readonly totalRequests: number;
	readonly totalPromptTokens: number;
	readonly totalCompletionTokens: number;
	readonly totalCost: number;
	readonly byProvider: Record<string, {
			readonly requests: number;
			readonly promptTokens: number;
			readonly completionTokens: number;
			readonly cost: number;
		}>;
}

interface ProxyItem {
	readonly id: string;
	readonly name: string;
	readonly type: string;
	readonly host: string;
	readonly port: number;
	readonly status?: string;
}

interface ProxyAssignment {
	readonly scope: string;
	readonly scopeId?: string | null;
	readonly proxyId?: string | null;
}

interface ModelDescriptor {
	readonly id: string;
	readonly name?: string;
	readonly root?: string | null;
	readonly parent?: string | null;
	readonly owned_by?: string;
	readonly type?: string;
	readonly api_format?: string;
	readonly context_length?: number;
	readonly max_output_tokens?: number;
	readonly input_modalities?: readonly string[];
	readonly supported_endpoints?: readonly string[];
	readonly capabilities?: {
			readonly vision?: boolean;
		};
}

interface ProviderCatalogModel {
	readonly id: string;
	readonly name?: string;
	readonly owned_by?: string;
	readonly type?: string;
	readonly apiFormat?: string;
	readonly supportedEndpoints?: readonly string[];
	readonly context_length?: number;
	readonly inputTokenLimit?: number;
	readonly max_output_tokens?: number;
	readonly outputTokenLimit?: number;
	readonly input_modalities?: readonly string[];
	readonly capabilities?: {
			readonly vision?: boolean;
		};
}

interface ProviderModelsPayload {
	readonly provider?: string;
	readonly connectionId?: string;
	readonly source?: string;
	readonly warning?: string;
	readonly models?: readonly ProviderCatalogModel[];
}

interface RequireLoginStatus {
	readonly requireLogin: boolean;
	readonly hasPassword: boolean;
	readonly setupComplete: boolean;
	readonly nodeVersion?: string;
	readonly nodeCompatible?: boolean;
}

interface OverviewState {
	serverRunning: boolean;
	dependenciesInstalled: boolean;
	authUnlocked: boolean;
	autoStart: boolean;
	nodeVersion?: string;
	nodeCompatible?: boolean;
	totalConnections: number;
	totalProviders: number;
	modelCount: number;
	proxyCount: number;
	hasAccessKey: boolean;
	lastSync?: string;
	usage?: UsageStats;
	connections: readonly ProviderConnection[];
	proxies: readonly ProxyItem[];
	globalProxyName?: string;
}

interface OmniProxyDashboardProvider {
	readonly id: string;
	readonly name: string;
	readonly color?: string;
	readonly category: ProviderCategory;
	readonly authHint?: string;
	readonly apiHint?: string;
	readonly website?: string;
	readonly deprecated?: boolean;
	readonly deprecationReason?: string;
	readonly connectionCount: number;
	readonly isConnected: boolean;
	readonly connectionLabels: readonly string[];
	readonly lastError?: string;
}

interface OmniProxyDashboardData {
	readonly brandName: string;
	readonly runtime: {
		readonly baseUrl: string;
		readonly nodePath: string;
		readonly npmPath: string;
		readonly autoStart: boolean;
		readonly dependenciesInstalled: boolean;
		readonly serverRunning: boolean;
		readonly authUnlocked: boolean;
		readonly hasAccessKey: boolean;
		readonly nodeVersion?: string;
		readonly nodeCompatible?: boolean;
		readonly lastSync?: string;
	};
	readonly stats: {
		readonly totalConnections: number;
		readonly totalProviders: number;
		readonly modelCount: number;
		readonly proxyCount: number;
	};
	readonly usage?: UsageStats;
	readonly providers: readonly OmniProxyDashboardProvider[];
	readonly proxies: readonly ProxyItem[];
	readonly globalProxyName?: string;
	readonly sections: OmniProxySectionData;
}

interface OmniProxySectionData {
	readonly endpoints: {
		readonly machineId?: string;
		readonly apiPort?: number;
		readonly dashboardPort?: number;
		readonly cloudConfigured?: boolean;
		readonly cloudUrl?: string | null;
		readonly items: readonly OmniProxyEndpointItem[];
	};
	readonly apiManager: {
		readonly keys: readonly OmniProxyApiKeyItem[];
		readonly aliases: readonly OmniProxyModelAliasItem[];
	};
	readonly providers: {
		readonly connections: readonly OmniProxyProviderConnectionItem[];
		readonly nodes: readonly OmniProxyProviderNodeItem[];
		readonly metrics: readonly OmniProxyProviderMetricItem[];
		readonly tokenHealth?: OmniProxyTokenHealth;
	};
	readonly combos: {
		readonly items: readonly OmniProxyComboItem[];
		readonly mappings: readonly OmniProxyComboMappingItem[];
		readonly metrics: readonly OmniProxyComboMetricItem[];
	};
	readonly batchTesting: {
		readonly batches: readonly OmniProxyBatchItem[];
		readonly files: readonly OmniProxyFileItem[];
	};
	readonly costs: {
		readonly summary?: OmniProxyUsageAnalyticsSummary;
		readonly byProvider: readonly OmniProxyUsageBreakdownRow[];
		readonly byModel: readonly OmniProxyUsageBreakdownRow[];
	};
	readonly analytics: {
		readonly providerMetrics: readonly OmniProxyProviderMetricItem[];
		readonly tokenHealth?: OmniProxyTokenHealth;
		readonly compression?: JsonObject;
	};
	readonly cache: {
		readonly stats?: JsonObject;
		readonly metrics?: JsonObject;
		readonly config?: JsonObject;
	};
	readonly limits: {
		readonly quotas: readonly OmniProxyQuotaItem[];
		readonly rateLimits?: OmniProxyRateLimitsSummary;
		readonly sessions: readonly OmniProxySessionItem[];
	};
	readonly media: {
		readonly memorySettings?: JsonObject;
		readonly memoryHealth?: JsonObject;
		readonly memories: readonly OmniProxyMemoryItem[];
		readonly files: readonly OmniProxyFileItem[];
	};
}

type OmniProxyDashboardSectionId =
	| 'home'
	| 'providers'
	| 'combos'
	| 'batchTesting'
	| 'costs'
	| 'analytics'
	| 'cache'
	| 'limits'
	| 'media';

interface OmniProxyEndpointItem {
	readonly label: string;
	readonly path: string;
	readonly category: string;
	readonly fullUrl: string;
	readonly description?: string;
}

interface OmniProxyApiKeyItem {
	readonly id: string;
	readonly name: string;
	readonly key?: string;
	readonly noLog?: boolean;
	readonly isActive?: boolean;
	readonly isBanned?: boolean;
	readonly createdAt?: string | null;
	readonly expiresAt?: string | null;
	readonly maxSessions?: number | null;
}

interface OmniProxyModelAliasItem {
	readonly from: string;
	readonly to: string;
	readonly builtIn: boolean;
}

interface OmniProxyProviderConnectionItem {
	readonly id: string;
	readonly provider: string;
	readonly name?: string;
	readonly email?: string;
	readonly displayName?: string;
	readonly authType?: string;
	readonly isActive?: boolean;
	readonly defaultModel?: string | null;
	readonly testStatus?: string;
	readonly lastError?: string;
	readonly lastTested?: string;
	readonly rateLimitProtection?: boolean;
}

interface OmniProxyProviderNodeItem {
	readonly id: string;
	readonly name: string;
	readonly prefix?: string;
	readonly type?: string;
	readonly apiType?: string;
	readonly baseUrl?: string;
	readonly chatPath?: string | null;
	readonly modelsPath?: string | null;
}

interface OmniProxyProviderMetricItem {
	readonly provider: string;
	readonly totalRequests: number;
	readonly totalSuccesses: number;
	readonly successRate: number;
	readonly avgLatencyMs: number;
}

interface OmniProxyTokenHealth {
	readonly total: number;
	readonly healthy: number;
	readonly errored: number;
	readonly warning: number;
	readonly status?: string;
	readonly lastCheckAt?: string | null;
}

interface OmniProxyComboItem {
	readonly id: string;
	readonly name: string;
	readonly strategy?: string;
	readonly models?: readonly unknown[];
	readonly updatedAt?: string;
}

interface OmniProxyComboMappingItem {
	readonly id?: string;
	readonly pattern: string;
	readonly comboId: string;
	readonly priority?: number;
	readonly enabled?: boolean;
	readonly description?: string;
}

interface OmniProxyComboMetricItem {
	readonly comboName: string;
	readonly requests: number;
	readonly successRate: number;
	readonly avgLatencyMs: number;
}

interface OmniProxyBatchItem {
	readonly id: string;
	readonly status?: string;
	readonly endpoint?: string;
	readonly createdAt?: string;
	readonly completedAt?: string | null;
}

interface OmniProxyFileItem {
	readonly id: string;
	readonly filename?: string;
	readonly purpose?: string;
	readonly bytes?: number;
	readonly status?: string;
	readonly createdAt?: string;
}

interface OmniProxyUsageAnalyticsSummary {
	readonly totalCost: number;
	readonly totalRequests: number;
	readonly totalTokens: number;
	readonly promptTokens: number;
	readonly completionTokens: number;
	readonly uniqueModels?: number;
	readonly uniqueAccounts?: number;
	readonly fallbackRatePct?: number;
}

interface OmniProxyUsageBreakdownRow {
	readonly label: string;
	readonly requests: number;
	readonly totalTokens: number;
	readonly cost: number;
}

interface OmniProxyQuotaItem {
	readonly provider: string;
	readonly name: string;
	readonly connectionId: string;
	readonly quotaUsed: number;
	readonly quotaTotal?: number | null;
	readonly percentRemaining: number;
	readonly resetAt?: string | null;
	readonly tokenStatus?: string;
}

interface OmniProxyRateLimitConnectionItem {
	readonly connectionId: string;
	readonly provider: string;
	readonly name: string;
	readonly rateLimitProtection?: boolean;
	readonly rateLimited?: boolean;
	readonly rateLimitedUntil?: string | null;
}

interface OmniProxyRateLimitsSummary {
	readonly connections: readonly OmniProxyRateLimitConnectionItem[];
	readonly lockouts: readonly JsonObject[];
	readonly cacheStats?: JsonObject;
	readonly overview?: JsonObject;
}

interface OmniProxySessionItem {
	readonly sessionId: string;
	readonly ageMs: number;
	readonly requestCount: number;
	readonly connectionId?: string | null;
}

interface OmniProxyMemoryItem {
	readonly id: string;
	readonly key: string;
	readonly type: string;
	readonly content: string;
	readonly updatedAt?: string;
	readonly sessionId?: string | null;
}

interface TreeNode {
	readonly id: string;
	readonly label: string;
	readonly description?: string;
	readonly tooltip?: string;
	readonly icon?: vscode.ThemeIcon;
	readonly collapsibleState?: vscode.TreeItemCollapsibleState;
	readonly contextValue?: string;
	readonly command?: vscode.Command;
	readonly children?: readonly TreeNode[];
}

interface HttpResponse<T> {
	readonly statusCode: number;
	readonly headers: http.IncomingHttpHeaders;
	readonly data: T;
}

interface OmniProxyApiKeyResponse {
	readonly key: string;
	readonly id: string;
}

interface ModelsPayload {
	readonly data?: readonly ModelDescriptor[];
}

interface NextDevLockFile {
	readonly pid?: number;
	readonly port?: number;
	readonly hostname?: string;
	readonly appUrl?: string;
	readonly startedAt?: number;
}

const OMNIROUTE_GROUP_NAME = 'OmniProxy';
const OMNIPROXY_BRAND_NAME = 'OmniProxy';
const OMNIROUTE_SECRET_KEY = 'chat.lm.secret.omniroute.vscode';
const OMNIROUTE_ACCESS_KEY_ID_STORAGE = 'omniroute.accessKeyId';
const OMNIROUTE_LAST_SYNC_STORAGE = 'omniroute.lastSyncTime';
const OMNIROUTE_EMBEDDED_RUNTIME_DIR = 'omniroute-runtime';

const DEVICE_CODE_PROVIDERS = new Set(['github', 'qwen', 'kiro', 'amazon-q', 'kimi-coding', 'kilocode']);

const PROVIDER_GROUPS: ReadonlyArray<{ readonly category: ProviderCategory; readonly exportName: string }> = [
	{ category: 'free', exportName: 'FREE_PROVIDERS' },
	{ category: 'oauth', exportName: 'OAUTH_PROVIDERS' },
	{ category: 'web-cookie', exportName: 'WEB_COOKIE_PROVIDERS' },
	{ category: 'apikey', exportName: 'APIKEY_PROVIDERS' },
	{ category: 'local', exportName: 'LOCAL_PROVIDERS' },
	{ category: 'search', exportName: 'SEARCH_PROVIDERS' },
	{ category: 'audio', exportName: 'AUDIO_ONLY_PROVIDERS' },
	{ category: 'upstream-proxy', exportName: 'UPSTREAM_PROXY_PROVIDERS' },
];

export function activate(context: vscode.ExtensionContext): void {
	const service = new OmniRouteService(context);
	context.subscriptions.push(service);
}

class OmniRouteService implements vscode.Disposable, vscode.TreeDataProvider<TreeNode> {
	private readonly outputChannel = vscode.window.createOutputChannel(OMNIPROXY_BRAND_NAME);
	private readonly treeEmitter = new vscode.EventEmitter<TreeNode | undefined>();
	private readonly context: vscode.ExtensionContext;
	private readonly workspaceRoot: string;
	private readonly repoRoot: string;
	private readonly omniRouteRoot: string;
	private readonly providersFile: string;

	private providerCatalog?: readonly ProviderCatalogEntry[];
	private currentState?: OverviewState;
	private childProcess?: ChildProcessWithoutNullStreams;
	private startedChild = false;

	constructor(context: vscode.ExtensionContext) {
		this.context = context;
		const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
		this.workspaceRoot = workspaceFolder?.uri.fsPath ?? '';
		this.repoRoot = path.resolve(this.context.extensionUri.fsPath, '..', '..');
		this.omniRouteRoot = this.resolveOmniRouteRoot();
		this.providersFile = path.join(this.omniRouteRoot, 'src', 'shared', 'constants', 'providers.ts');

		this.registerCommands();
		void this.initialize();
	}

	dispose(): void {
		if (this.startedChild) {
			this.childProcess?.kill();
		}
		this.treeEmitter.dispose();
		this.outputChannel.dispose();
	}

	get onDidChangeTreeData(): vscode.Event<TreeNode | undefined | null> {
		return this.treeEmitter.event;
	}

	getTreeItem(element: TreeNode): vscode.TreeItem {
		const item = new vscode.TreeItem(element.label, element.collapsibleState ?? vscode.TreeItemCollapsibleState.None);
		item.id = element.id;
		item.description = element.description;
		item.tooltip = element.tooltip;
		item.iconPath = element.icon;
		item.contextValue = element.contextValue;
		item.command = element.command;
		return item;
	}

	async getChildren(element?: TreeNode): Promise<TreeNode[]> {
		if (element?.children) {
			return [...element.children];
		}

		const state = this.currentState ?? await this.refreshState();
		return [...this.buildRootNodes(state)];
	}

	private registerCommands(): void {
		this.context.subscriptions.push(
			this.outputChannel,
			this.treeEmitter,
			vscode.commands.registerCommand('omniroute.focus', async () => {
				await this.refresh();
				await this.openControlCenter();
			}),
			vscode.commands.registerCommand('omniroute.openControlCenter', async () => {
				await this.refresh();
				await this.openControlCenter();
			}),
			vscode.commands.registerCommand('omniroute.openModels', async () => {
				await vscode.commands.executeCommand('workbench.action.chat.manage');
			}),
			vscode.commands.registerCommand('omniroute.openSettings', async () => {
				await vscode.commands.executeCommand('workbench.action.openSettings', '@ext:vscode.omniroute');
			}),
			vscode.commands.registerCommand('omniroute.showOutput', async () => {
				this.outputChannel.show(true);
				await this.refresh();
			}),
			vscode.commands.registerCommand('omniroute.refresh', async () => {
				await this.refresh();
			}),
			vscode.commands.registerCommand('omniroute.installDependencies', async () => {
				await this.withProgress(vscode.l10n.t('Installing OmniProxy dependencies'), () => this.installDependencies());
				await this.refresh();
			}),
			vscode.commands.registerCommand('omniroute.connectProvider', async (providerId?: string) => {
				await this.connectProvider(providerId);
				await this.refresh();
			}),
			vscode.commands.registerCommand('omniroute.showProviderGuide', async (providerId?: string) => {
				await this.showProviderGuide(providerId);
			}),
			vscode.commands.registerCommand('omniroute.openProviderWebsite', async (providerId?: string) => {
				await this.openProviderWebsite(providerId);
			}),
			vscode.commands.registerCommand('omniroute.syncModels', async () => {
				await this.syncModels();
				await this.refresh();
			}),
			vscode.commands.registerCommand('omniroute.addProxy', async () => {
				await this.addProxy();
				await this.refresh();
			}),
			vscode.commands.registerCommand('omniroute.issueAccessKey', async () => {
				await this.issueAccessKey(true);
				await this.refresh();
			}),
			vscode.commands.registerCommand('omniroute.configureBaseUrl', async () => {
				await this.configureBaseUrl();
				await this.refresh();
			}),
			vscode.commands.registerCommand('omniroute.configureNodePath', async () => {
				await this.configureNodePath();
				await this.refresh();
			}),
			vscode.commands.registerCommand('omniroute.configureNpmPath', async () => {
				await this.configureNpmPath();
				await this.refresh();
			}),
			vscode.commands.registerCommand('omniroute.toggleAutoStart', async () => {
				await this.toggleAutoStart();
				await this.refresh();
			}),
			vscode.commands.registerCommand('omniroute.getDashboardData', async (section?: OmniProxyDashboardSectionId) => {
				return this.getDashboardData(section);
			}),
			vscode.commands.registerCommand('omniroute.createApiKey', async () => {
				await this.createApiKey();
				await this.refresh();
			}),
			vscode.commands.registerCommand('omniroute.deleteApiKey', async (id?: string) => {
				await this.deleteApiKey(id);
				await this.refresh();
			}),
			vscode.commands.registerCommand('omniroute.addModelAlias', async () => {
				await this.addModelAlias();
				await this.refresh();
			}),
			vscode.commands.registerCommand('omniroute.removeModelAlias', async (from?: string) => {
				await this.removeModelAlias(from);
				await this.refresh();
			}),
			vscode.commands.registerCommand('omniroute.createCombo', async () => {
				await this.createCombo();
				await this.refresh();
			}),
			vscode.commands.registerCommand('omniroute.deleteCombo', async (id?: string) => {
				await this.deleteCombo(id);
				await this.refresh();
			}),
			vscode.commands.registerCommand('omniroute.testCombo', async (comboName?: string) => {
				await this.testCombo(comboName);
				await this.refresh();
			}),
			vscode.commands.registerCommand('omniroute.testProvidersBatch', async (mode?: string) => {
				await this.testProvidersBatch(mode);
				await this.refresh();
			}),
			vscode.commands.registerCommand('omniroute.clearCache', async (scope?: { readonly model?: string }) => {
				await this.clearCache(scope);
				await this.refresh();
			}),
			vscode.commands.registerCommand('omniroute.resetCacheMetrics', async () => {
				await this.resetCacheMetrics();
				await this.refresh();
			}),
			vscode.commands.registerCommand('omniroute.refreshProviderLimits', async () => {
				await this.refreshProviderLimits();
				await this.refresh();
			}),
			vscode.commands.registerCommand('omniroute.toggleRateLimitProtection', async (payload?: { readonly connectionId?: string; readonly enabled?: boolean }) => {
				await this.toggleRateLimitProtection(payload);
				await this.refresh();
			}),
			vscode.commands.registerCommand('omniroute.addMemory', async () => {
				await this.addMemory();
				await this.refresh();
			}),
			vscode.commands.registerCommand('omniroute.deleteMemory', async (id?: string) => {
				await this.deleteMemory(id);
				await this.refresh();
			}),
		);
	}

	private async openControlCenter(): Promise<void> {
		await vscode.commands.executeCommand('workbench.action.omniProxy.manage');
	}

	private async initialize(): Promise<void> {
		this.outputChannel.appendLine(`[${OMNIPROXY_BRAND_NAME}] workspace root: ${this.workspaceRoot || '<none>'}`);
		this.outputChannel.appendLine(`[${OMNIPROXY_BRAND_NAME}] resolved runtime root: ${this.omniRouteRoot}`);
		await this.context.secrets.delete(OMNIROUTE_SECRET_KEY);
		await this.refresh();
	}

	private async refresh(): Promise<void> {
		this.currentState = await this.refreshState();
		this.treeEmitter.fire(undefined);
	}

	private async refreshState(): Promise<OverviewState> {
		const dependenciesInstalled = this.dependenciesInstalled();
		const autoStart = vscode.workspace.getConfiguration('omniroute').get<boolean>('autoStart', true);
		const serverRunning = await this.ensureServer({ silent: true });
		const lockStatus = serverRunning ? await this.ensureLoginDisabled() : undefined;
		const authUnlocked = !!serverRunning && (lockStatus?.requireLogin === false);

		const [
			connections,
			usage,
			proxies,
			assignments,
			modelCount,
			hasAccessKey,
			lastSync
		] = await Promise.all([
			authUnlocked ? this.withDashboardFallback('connections', () => this.fetchConnections(), [] as readonly ProviderConnection[], 5000) : Promise.resolve([]),
			authUnlocked ? this.withDashboardFallback('usage', () => this.fetchUsageStats(), undefined, 5000) : Promise.resolve(undefined),
			authUnlocked ? this.withDashboardFallback('proxies', () => this.fetchProxies(), [] as readonly ProxyItem[], 5000) : Promise.resolve([]),
			authUnlocked ? this.withDashboardFallback('proxy assignments', () => this.fetchProxyAssignments(), [] as readonly ProxyAssignment[], 5000) : Promise.resolve([]),
			serverRunning ? this.withDashboardFallback('model count', () => this.fetchModelCount(), 0, 5000) : Promise.resolve(0),
			this.context.secrets.get(OMNIROUTE_SECRET_KEY).then(value => !!value),
			Promise.resolve(this.context.globalState.get<string>(OMNIROUTE_LAST_SYNC_STORAGE))
		]);
		const globalProxyName = assignments
			.find(item => item.scope === 'global' && item.proxyId)
			?.proxyId;
		const globalProxy = globalProxyName ? proxies.find(item => item.id === globalProxyName)?.name : undefined;
		const providerCount = new Set(connections.map(connection => connection.provider)).size;

		return {
			serverRunning,
			dependenciesInstalled,
			authUnlocked,
			autoStart,
			nodeVersion: lockStatus?.nodeVersion,
			nodeCompatible: lockStatus?.nodeCompatible,
			totalConnections: connections.length,
			totalProviders: providerCount,
			modelCount,
			proxyCount: proxies.length,
			hasAccessKey,
			lastSync,
			usage,
			connections,
			proxies,
			globalProxyName: globalProxy,
		};
	}

	private async withDashboardFallback<T>(label: string, operation: () => Promise<T>, fallback: T, timeoutMs: number): Promise<T> {
		try {
			return await Promise.race([
				operation(),
				new Promise<T>((_, reject) => {
					setTimeout(() => reject(new Error(`Timed out after ${timeoutMs}ms`)), timeoutMs);
				})
			]);
		} catch (error) {
			this.outputChannel.appendLine(`[${OMNIPROXY_BRAND_NAME}] ${label} request failed during overview refresh: ${error instanceof Error ? error.message : String(error)}`);
			return fallback;
		}
	}

	private buildRootNodes(state: OverviewState): readonly TreeNode[] {
		const usage = state.usage;
		const accountChildren = this.buildAccountChildren(state.connections);
		const proxyChildren = this.buildProxyChildren(state.proxies, state.globalProxyName);

		return [
			{
				id: 'setup',
				label: 'Setup and Access',
				description: state.serverRunning ? 'OmniProxy is running inside OmniCode' : 'Complete setup to launch OmniProxy inside OmniCode',
				tooltip: state.nodeVersion ? `Node ${state.nodeVersion}` : this.getBaseUrl().toString(),
				icon: new vscode.ThemeIcon(state.serverRunning ? 'pass-filled' : 'tools'),
				collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
				children: [
					{
						id: 'setup.status',
						label: state.serverRunning ? 'Proxy engine ready' : 'Proxy engine offline',
						description: state.serverRunning ? this.getBaseUrl().toString() : 'Install dependencies or review runtime settings',
						icon: new vscode.ThemeIcon(state.serverRunning ? 'vm-active' : 'warning')
					},
					{
						id: 'setup.baseUrl',
						label: 'Base URL',
						description: this.getBaseUrl().toString(),
						icon: new vscode.ThemeIcon('link'),
						command: { command: 'omniroute.configureBaseUrl', title: 'Set OmniProxy Base URL' }
					},
					{
						id: 'setup.nodePath',
						label: 'Node runtime',
						description: this.getNodePath(),
						icon: new vscode.ThemeIcon('symbol-module'),
						command: { command: 'omniroute.configureNodePath', title: 'Set OmniProxy Node Runtime' }
					},
					{
						id: 'setup.npmPath',
						label: 'npm runtime',
						description: this.getNpmPath(),
						icon: new vscode.ThemeIcon('package'),
						command: { command: 'omniroute.configureNpmPath', title: 'Set OmniProxy npm Runtime' }
					},
					{
						id: 'setup.autoStart',
						label: 'Auto-start',
						description: state.autoStart ? 'Enabled' : 'Disabled',
						icon: new vscode.ThemeIcon(state.autoStart ? 'play-circle' : 'debug-pause'),
						command: { command: 'omniroute.toggleAutoStart', title: 'Toggle OmniProxy Auto Start' }
					},
					{
						id: 'setup.install',
						label: state.dependenciesInstalled ? 'Dependencies installed' : 'Install OmniProxy dependencies',
						description: state.dependenciesInstalled ? 'Runtime is ready on disk' : 'Required before starting OmniProxy',
						icon: new vscode.ThemeIcon(state.dependenciesInstalled ? 'package' : 'cloud-download'),
						command: state.dependenciesInstalled ? undefined : { command: 'omniroute.installDependencies', title: 'Install OmniProxy Dependencies' }
					},
					{
						id: 'setup.accessMode',
						label: 'Access mode',
						description: state.authUnlocked ? 'Local access enabled with no sign-in required' : 'Waiting for OmniProxy to enable local access',
						icon: new vscode.ThemeIcon(state.authUnlocked ? 'unlock' : 'loading')
					},
					{
						id: 'setup.key',
						label: state.hasAccessKey ? 'Access key ready' : 'Refresh access key',
						description: state.hasAccessKey ? 'Used for synced custom-endpoint models' : 'Required to drive model picker entries',
						icon: new vscode.ThemeIcon(state.hasAccessKey ? 'key' : 'key'),
						command: { command: 'omniroute.issueAccessKey', title: 'Refresh OmniProxy Access Key' }
					}
				]
			},
			{
				id: 'usage',
				label: 'Usage Overview',
				description: usage ? `${usage.totalRequests} requests` : 'Ready when OmniProxy traffic starts flowing',
				icon: new vscode.ThemeIcon('pulse'),
				collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
				children: usage ? [
					{
						id: 'usage.prompt',
						label: 'Prompt tokens',
						description: usage.totalPromptTokens.toLocaleString(),
						icon: new vscode.ThemeIcon('symbol-number')
					},
					{
						id: 'usage.completion',
						label: 'Completion tokens',
						description: usage.totalCompletionTokens.toLocaleString(),
						icon: new vscode.ThemeIcon('symbol-number')
					},
					{
						id: 'usage.cost',
						label: 'Estimated cost',
						description: `$${usage.totalCost.toFixed(4)}`,
						icon: new vscode.ThemeIcon('credit-card')
					},
					...Object.entries(usage.byProvider)
						.sort((left, right) => right[1].requests - left[1].requests)
						.slice(0, 5)
						.map(([provider, value]) => ({
							id: `usage.provider.${provider}`,
							label: provider,
							description: `${value.requests} req`,
							tooltip: `${provider}: ${value.promptTokens.toLocaleString()} prompt, ${value.completionTokens.toLocaleString()} completion`,
							icon: new vscode.ThemeIcon('graph')
						}))
				] : [
					{
						id: 'usage.empty',
						label: 'No usage overview yet',
						description: 'Connect providers and start routing requests',
						icon: new vscode.ThemeIcon('circle-slash')
					}
				]
			},
			{
				id: 'accounts',
				label: 'Provider Accounts',
				description: `${state.totalConnections} accounts across ${state.totalProviders} providers`,
				icon: new vscode.ThemeIcon('organization'),
				collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
				children: accountChildren
			},
			{
				id: 'models',
				label: 'Model Catalog',
				description: `${state.modelCount} models available`,
				tooltip: state.lastSync ? `Last synced ${state.lastSync}` : 'Never synced',
				icon: new vscode.ThemeIcon('hubot'),
				collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
				children: [
					{
						id: 'models.sync',
						label: 'Sync OmniProxy into Custom Endpoint',
						description: state.lastSync ? state.lastSync : 'Creates or updates the OmniProxy custom provider group',
						icon: new vscode.ThemeIcon('sync'),
						command: { command: 'omniroute.syncModels', title: 'Sync OmniProxy Models' }
					}
				]
			},
			{
				id: 'proxies',
				label: 'Proxy Mesh and RTK',
				description: state.proxyCount > 0 ? `${state.proxyCount} proxies` : 'No proxies configured',
				icon: new vscode.ThemeIcon('globe'),
				collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
				children: proxyChildren
			}
		];
	}

	private buildAccountChildren(connections: readonly ProviderConnection[]): readonly TreeNode[] {
		if (!connections.length) {
			return [{
				id: 'accounts.add',
				label: 'Connect Provider',
				description: 'Add OmniProxy accounts without leaving OmniCode',
				icon: new vscode.ThemeIcon('add'),
				command: { command: 'omniroute.connectProvider', title: 'Connect OmniProxy Provider' }
			}];
		}

		const grouped = new Map<string, ProviderConnection[]>();
		for (const connection of connections) {
			const list = grouped.get(connection.provider) ?? [];
			list.push(connection);
			grouped.set(connection.provider, list);
		}

		const nodes: TreeNode[] = Array.from(grouped.entries())
			.sort((left, right) => left[0].localeCompare(right[0]))
			.map(([provider, items]) => ({
				id: `accounts.${provider}`,
				label: provider,
				description: `${items.length} account${items.length === 1 ? '' : 's'}`,
				tooltip: items.map(item => item.name || item.email || item.id).join(', '),
				icon: new vscode.ThemeIcon('plug'),
				collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
				children: items.map(item => ({
					id: `account.${item.id}`,
					label: item.name || item.email || item.displayName || item.id,
					description: item.testStatus || (item.isActive ? 'active' : 'disabled'),
					tooltip: item.lastError || item.updatedAt || item.id,
					icon: new vscode.ThemeIcon(item.isActive ? 'account' : 'circle-slash')
				}))
			}));

		nodes.unshift({
			id: 'accounts.add',
			label: 'Connect Another Provider',
			description: 'Supports multiple OmniProxy accounts',
			icon: new vscode.ThemeIcon('add'),
			command: { command: 'omniroute.connectProvider', title: 'Connect OmniProxy Provider' }
		});

		return nodes;
	}

	private buildProxyChildren(proxies: readonly ProxyItem[], globalProxyName?: string): readonly TreeNode[] {
		const nodes: TreeNode[] = [
			{
				id: 'proxies.add',
				label: 'Add Proxy',
				description: 'Register a proxy for OmniProxy routing',
				icon: new vscode.ThemeIcon('add'),
				command: { command: 'omniroute.addProxy', title: 'Add OmniProxy Proxy' }
			}
		];

		if (globalProxyName) {
			nodes.push({
				id: 'proxies.global',
				label: 'Global proxy',
				description: globalProxyName,
				icon: new vscode.ThemeIcon('globe')
			});
		}

		for (const proxy of proxies.slice(0, 10)) {
			nodes.push({
				id: `proxy.${proxy.id}`,
				label: proxy.name,
				description: `${proxy.type}://${proxy.host}:${proxy.port}`,
				tooltip: proxy.status,
				icon: new vscode.ThemeIcon('server')
			});
		}

		if (proxies.length === 0) {
			nodes.push({
				id: 'proxies.none',
				label: 'No proxies configured',
				description: 'Add one to drive RTK traffic through OmniProxy',
				icon: new vscode.ThemeIcon('circle-slash')
			});
		}

		return nodes;
	}

	private async ensureProxyReady(): Promise<void> {
		const running = await this.ensureServer({ silent: false });
		if (!running) {
			throw new Error(`${OMNIPROXY_BRAND_NAME} is not running.`);
		}

		const status = await this.ensureLoginDisabled();
		if (status?.requireLogin) {
			throw new Error(`${OMNIPROXY_BRAND_NAME} local access could not be enabled.`);
		}
	}

	private async ensureLoginDisabled(): Promise<RequireLoginStatus> {
		const status = await this.fetchRequireLoginStatus();
		if (!status.requireLogin) {
			return status;
		}

		await this.requestJson('/api/settings/require-login', 'POST', { requireLogin: false });
		const refreshed = await this.fetchRequireLoginStatus();
		if (refreshed.requireLogin) {
			throw new Error(`${OMNIPROXY_BRAND_NAME} is still enforcing login.`);
		}
		return refreshed;
	}

	private async configureBaseUrl(): Promise<void> {
		const currentValue = this.getBaseUrl().toString();
		const nextValue = await vscode.window.showInputBox({
			prompt: vscode.l10n.t('Set the local {0} base URL', OMNIPROXY_BRAND_NAME),
			value: currentValue,
			ignoreFocusOut: true,
			validateInput: value => {
				try {
					new URL(value);
					return undefined;
				} catch {
					return 'Enter a valid URL.';
				}
			}
		});
		if (!nextValue || nextValue === currentValue) {
			return;
		}
		await vscode.workspace.getConfiguration('omniroute').update('baseUrl', nextValue, vscode.ConfigurationTarget.Global);
		await this.context.secrets.delete(OMNIROUTE_SECRET_KEY);
	}

	private async configureNodePath(): Promise<void> {
		const currentValue = vscode.workspace.getConfiguration('omniroute').get<string>('nodePath', '/tmp/vscode-run-bin/node');
		const nextValue = await vscode.window.showInputBox({
			prompt: vscode.l10n.t('Set the Node.js binary used by {0}', OMNIPROXY_BRAND_NAME),
			value: currentValue,
			ignoreFocusOut: true,
			validateInput: value => value.trim().length ? undefined : vscode.l10n.t('Enter a Node.js binary path.')
		});
		if (!nextValue || nextValue === currentValue) {
			return;
		}
		await vscode.workspace.getConfiguration('omniroute').update('nodePath', nextValue.trim(), vscode.ConfigurationTarget.Global);
	}

	private async configureNpmPath(): Promise<void> {
		const currentValue = vscode.workspace.getConfiguration('omniroute').get<string>('npmPath', '/tmp/vscode-run-bin/npm');
		const nextValue = await vscode.window.showInputBox({
			prompt: vscode.l10n.t('Set the npm binary used by {0}', OMNIPROXY_BRAND_NAME),
			value: currentValue,
			ignoreFocusOut: true,
			validateInput: value => value.trim().length ? undefined : vscode.l10n.t('Enter an npm binary path.')
		});
		if (!nextValue || nextValue === currentValue) {
			return;
		}
		await vscode.workspace.getConfiguration('omniroute').update('npmPath', nextValue.trim(), vscode.ConfigurationTarget.Global);
	}

	private async toggleAutoStart(): Promise<void> {
		const configuration = vscode.workspace.getConfiguration('omniroute');
		const currentValue = configuration.get<boolean>('autoStart', true);
		await configuration.update('autoStart', !currentValue, vscode.ConfigurationTarget.Global);
	}

	private async installDependencies(): Promise<void> {
		await this.runNpmCommand(['install', '--no-audit', '--no-fund']);
		await this.ensureNativeModuleCompatibility({ forceRebuild: true });
	}

	private async connectProvider(providerId?: string): Promise<void> {
		await this.ensureProxyReady();
		const providers = await this.getProviderCatalog();
		let targetProvider: ProviderCatalogEntry | undefined;
		if (providerId) {
			targetProvider = providers.find(provider => provider.id === providerId && !provider.deprecated);
			if (!targetProvider) {
				throw new Error(`Could not find OmniProxy provider '${providerId}'.`);
			}
		} else {
			const selection = await vscode.window.showQuickPick(
				providers
					.filter(provider => !provider.deprecated)
					.map(provider => ({
						label: provider.name,
						description: provider.category,
						detail: provider.authHint || provider.apiHint || provider.website,
						provider
					})),
				{
					title: vscode.l10n.t('Connect {0} Provider', OMNIPROXY_BRAND_NAME),
					placeHolder: vscode.l10n.t('Choose a provider to connect')
				}
			);
			if (!selection) {
				return;
			}
			targetProvider = selection.provider;
		}

		if (targetProvider.id === 'cursor') {
			await this.connectCursorProvider(targetProvider);
		} else if (targetProvider.id === 'kiro' || targetProvider.id === 'amazon-q') {
			await this.connectKiroCompatibleProvider(targetProvider);
		} else if (targetProvider.id === 'qoder') {
			await this.connectApiKeyProvider(targetProvider);
		} else if (targetProvider.category === 'free' || targetProvider.category === 'oauth') {
			await this.connectOAuthProvider(targetProvider);
		} else {
			await this.connectApiKeyProvider(targetProvider);
		}

		await this.syncModels();
	}

	private async showProviderGuide(providerId?: string): Promise<void> {
		const provider = await this.resolveProviderById(providerId);
		const guide = this.getProviderSetupGuide(provider);
		const methodLines = guide.methods?.flatMap(method => [
			`- **${method.label}**: ${method.description}`,
			method.detail ? `  - ${method.detail}` : undefined
		].filter((line): line is string => typeof line === 'string')) ?? [];
		const content = [
			`# ${guide.title}`,
			'',
			guide.summary,
			'',
			guide.website ? `Website: ${guide.website}` : undefined,
			methodLines.length ? '## Supported Setup Methods' : undefined,
			...methodLines,
			methodLines.length ? '' : undefined,
			'## Steps',
			...guide.steps.map((step, index) => `${index + 1}. ${step}`),
			guide.credentialPrompt ? ['', `Credential field: ${guide.credentialPrompt}`] : undefined,
			guide.callbackPrompt ? ['', `Callback field: ${guide.callbackPrompt}`] : undefined,
		].flat().filter((line): line is string => typeof line === 'string');
		const document = await vscode.workspace.openTextDocument({
			language: 'markdown',
			content: content.join('\n')
		});
		await vscode.window.showTextDocument(document, { preview: true, preserveFocus: false });
	}

	private async openProviderWebsite(providerId?: string): Promise<void> {
		const provider = await this.resolveProviderById(providerId);
		const guide = this.getProviderSetupGuide(provider);
		if (!guide.website) {
			throw new Error(`No website is configured for ${provider.name}.`);
		}
		await vscode.env.openExternal(vscode.Uri.parse(guide.website));
	}

	private async resolveProviderById(providerId?: string): Promise<ProviderCatalogEntry> {
		if (!providerId) {
			throw new Error('A provider id is required.');
		}
		const providers = await this.getProviderCatalog();
		const provider = providers.find(candidate => candidate.id === providerId);
		if (!provider) {
			throw new Error(`Could not find OmniProxy provider '${providerId}'.`);
		}
		return provider;
	}

	private async presentProviderSetupDialog(provider: ProviderCatalogEntry, finalActionLabel: string): Promise<void> {
		const guide = this.getProviderSetupGuide(provider);
		while (true) {
			const actions = [finalActionLabel, 'Show Detailed Guide'];
			if (guide.website) {
				actions.splice(1, 0, 'Open Website');
			}
			const choice = await vscode.window.showInformationMessage(
				guide.summary,
				{
					modal: true,
					detail: guide.steps.map((step, index) => `${index + 1}. ${step}`).join('\n\n')
				},
				...actions
			);
			if (!choice) {
				throw new Error(`Cancelled ${provider.name} setup.`);
			}
			if (choice === finalActionLabel) {
				return;
			}
			if (choice === 'Open Website' && guide.website) {
				await vscode.env.openExternal(vscode.Uri.parse(guide.website));
				continue;
			}
			if (choice === 'Show Detailed Guide') {
				await this.showProviderGuide(provider.id);
			}
		}
	}

	private getProviderSetupGuide(provider: ProviderCatalogEntry): ProviderSetupGuide {
		const website = provider.website;
		switch (provider.id) {
			case 'chatgpt-web':
				return {
					title: 'ChatGPT Web (Plus/Pro) Setup',
					summary: 'Link your ChatGPT web session by signing in at chatgpt.com and importing the same session cookie OmniRoute expects for ChatGPT Web access.',
					website,
					credentialPrompt: 'Paste the `__Secure-next-auth.session-token` cookie value from chatgpt.com. A full Cookie header also works.',
					credentialPlaceholder: '__Secure-next-auth.session-token=...',
					methods: [
						{
							id: 'web-cookie',
							label: 'Session Cookie / Cookie Header',
							description: 'Import the same web session value OmniRoute uses for the ChatGPT Web provider.',
							detail: 'Accepted values: `__Secure-next-auth.session-token` or the full Cookie header from chatgpt.com.'
						}
					],
					steps: [
						'Open chatgpt.com in a browser where your Plus or Pro account is already signed in.',
						'Open browser developer tools, then inspect the `chatgpt.com` cookies under Application/Storage.',
						'Copy the `__Secure-next-auth.session-token` cookie value. If your browser makes that easier, copy the whole Cookie header instead.',
						'Return to OmniCode, paste the cookie when asked, then give the connection a name you recognize.',
						'After the account is added, run model sync so ChatGPT-backed models appear in the model picker.'
					]
				};
			case 'perplexity-web':
				return {
					title: 'Perplexity Web (Pro/Max) Setup',
					summary: 'Link your Perplexity web account by copying the `__Secure-next-auth.session-token` cookie from perplexity.ai.',
					website,
					credentialPrompt: 'Paste the `__Secure-next-auth.session-token` cookie value from perplexity.ai. A full Cookie header also works.',
					credentialPlaceholder: '__Secure-next-auth.session-token=...',
					methods: [
						{
							id: 'web-cookie',
							label: 'Session Cookie / Cookie Header',
							description: 'Use the same web session value OmniRoute accepts for the Perplexity Web provider.',
							detail: 'Accepted values: `__Secure-next-auth.session-token` or the full Cookie header from perplexity.ai.'
						}
					],
					steps: [
						'Open perplexity.ai and confirm the Pro or Max account is already signed in.',
						'Use browser developer tools to inspect cookies for `perplexity.ai`.',
						'Copy the `__Secure-next-auth.session-token` value, or copy the full Cookie header if that is easier.',
						'Paste that value into OmniCode when prompted and save the connection.'
					]
				};
			case 'grok-web':
				return {
					title: 'Grok Web Setup',
					summary: 'Link your Grok subscription by copying the `sso` cookie value from grok.com.',
					website,
					credentialPrompt: 'Paste the `sso` cookie value from grok.com. A full Cookie header also works.',
					credentialPlaceholder: 'sso=...',
					methods: [
						{
							id: 'web-cookie',
							label: 'Session Cookie / Cookie Header',
							description: 'Use the browser session value OmniRoute expects for the Grok Web provider.',
							detail: 'Accepted values: `sso` or the full Cookie header from grok.com.'
						}
					],
					steps: [
						'Open grok.com in a browser where the subscribed account is signed in.',
						'Open browser developer tools and inspect cookies for `grok.com`.',
						'Copy the `sso` cookie value, or copy the full Cookie header.',
						'Paste that value into OmniCode and save the account.'
					]
				};
			case 'blackbox-web':
				return {
					title: 'Blackbox Web Setup',
					summary: 'Link your Blackbox subscription by copying the `__Secure-authjs.session-token` cookie from app.blackbox.ai.',
					website,
					credentialPrompt: 'Paste the `__Secure-authjs.session-token` cookie value from app.blackbox.ai. A full Cookie header also works.',
					credentialPlaceholder: '__Secure-authjs.session-token=...',
					methods: [
						{
							id: 'web-cookie',
							label: 'Session Cookie / Cookie Header',
							description: 'Import the Blackbox web session exactly the way OmniRoute expects it.',
							detail: 'Accepted values: `__Secure-authjs.session-token` or the full Cookie header from app.blackbox.ai.'
						}
					],
					steps: [
						'Open app.blackbox.ai and confirm the subscribed account is signed in.',
						'Inspect cookies for `app.blackbox.ai` in your browser developer tools.',
						'Copy the `__Secure-authjs.session-token` cookie value or the full Cookie header.',
						'Paste it into OmniCode when prompted and save the connection.'
					]
				};
			case 'muse-spark-web':
				return {
					title: 'Muse Spark Web (Meta AI) Setup',
					summary: 'Link Meta AI by copying the `abra_sess` cookie or full Cookie header from meta.ai.',
					website,
					credentialPrompt: 'Paste the `abra_sess` cookie value from meta.ai. A full Cookie header also works.',
					credentialPlaceholder: 'abra_sess=...',
					methods: [
						{
							id: 'web-cookie',
							label: 'Session Cookie / Cookie Header',
							description: 'Import the Meta AI web session value OmniRoute uses for Muse Spark Web.',
							detail: 'Accepted values: `abra_sess` or the full Cookie header from meta.ai.'
						}
					],
					steps: [
						'Open meta.ai in a browser where the target account is already signed in.',
						'Inspect cookies for `meta.ai` with developer tools.',
						'Copy the `abra_sess` cookie value, or copy the whole Cookie header if multiple session cookies are required.',
						'Paste that into OmniCode and save the connection.'
					]
				};
			case 'cursor':
				return {
					title: 'Cursor Setup',
					summary: 'OmniRoute supports both local Cursor token import and browser OAuth-style flows. OmniCode now exposes the same import-first methods.',
					website,
					callbackPrompt: 'Paste the full callback URL or the authorization code returned by Cursor.',
					methods: [
						{
							id: 'cursor-auto-import',
							label: 'Auto Import from Local Cursor',
							description: 'Read credentials from Cursor IDE state.vscdb or cursor-agent auth.json on this machine.',
							detail: 'Source paths come from OmniRoute: Cursor IDE global storage or `~/.config/cursor/auth.json`.'
						},
						{
							id: 'cursor-manual-import',
							label: 'Manual Token Import',
							description: 'Paste the Cursor access token and machine ID from the local Cursor database.',
							detail: 'OmniRoute expects `cursorAuth/accessToken` and `storage.serviceMachineId` from `state.vscdb`.'
						},
						{
							id: 'oauth-browser',
							label: 'Browser OAuth',
							description: 'Open the provider login page, approve access, and paste the callback URL or code back into OmniCode.'
						}
					],
					steps: [
						'If Cursor is installed locally, use Auto Import first so OmniCode reuses the same token Cursor IDE or cursor-agent already stores.',
						'If auto-import cannot find credentials, open Cursor and confirm you are signed in before trying again.',
						'For manual import, retrieve `cursorAuth/accessToken` and `storage.serviceMachineId` from the local `state.vscdb` file, then paste both values into OmniCode.',
						'Use Browser OAuth only if you explicitly want the interactive login flow instead of local credential import.',
						'After the account is saved, sync models so Cursor-backed models show up in the regular model picker.'
					]
				};
			case 'kiro':
				return {
					title: 'Kiro Setup',
					summary: 'OmniRoute supports AWS SSO token import, manual refresh-token import, Kiro social login, and the device-code login flow for Kiro.',
					website,
					callbackPrompt: 'Paste the full `kiro://...` callback URL or the authorization code returned by the Kiro social login flow.',
					methods: [
						{
							id: 'kiro-auto-import',
							label: 'Auto Import from AWS SSO Cache',
							description: 'Read the Kiro refresh token from `~/.aws/sso/cache` on this machine.',
							detail: 'OmniRoute checks `kiro-auth-token.json` first, then scans other AWS SSO cache files for a valid refresh token.'
						},
						{
							id: 'kiro-manual-import',
							label: 'Manual Refresh Token Import',
							description: 'Paste the Kiro refresh token yourself and let OmniRoute validate and exchange it.'
						},
						{
							id: 'kiro-social-google',
							label: 'Google Social Login',
							description: 'Open OmniRoute’s Kiro social-login URL, complete Google sign-in, and paste the final `kiro://...` callback.'
						},
						{
							id: 'kiro-social-github',
							label: 'GitHub Social Login',
							description: 'Open OmniRoute’s Kiro social-login URL, complete GitHub sign-in, and paste the final `kiro://...` callback.'
						},
						{
							id: 'device-code',
							label: 'Device Login',
							description: 'Use the OmniRoute device-code flow and finish the verification step in your browser.'
						}
					],
					steps: [
						'Use Auto Import first if Kiro is already logged in on this machine; OmniRoute reads the AWS SSO cache directly.',
						'If auto-import does not find a token, use Manual Refresh Token Import and paste the refresh token from the AWS SSO cache.',
						'For social login, choose Google or GitHub, let OmniCode open the OmniRoute authorization URL, then copy the final `kiro://kiro.kiroAgent/authenticate-success?...` callback URL back into OmniCode.',
						'Device Login remains available if you want a fully guided verification-code flow instead.',
						'When the connection succeeds, run model sync so the Kiro-backed models appear in the shared model picker.'
					]
				};
			case 'amazon-q':
				return {
					title: 'Amazon Q Setup',
					summary: 'Amazon Q uses the same OmniRoute Kiro-compatible import flow for AWS Builder ID / AWS SSO tokens, plus the device login flow.',
					website,
					methods: [
						{
							id: 'kiro-auto-import',
							label: 'Auto Import from AWS SSO Cache',
							description: 'Read the Amazon Q refresh token from `~/.aws/sso/cache` on this machine.',
							detail: 'OmniRoute looks for `amazon-q-auth-token.json` first, then scans the AWS SSO cache for a valid refresh token.'
						},
						{
							id: 'kiro-manual-import',
							label: 'Manual Refresh Token Import',
							description: 'Paste the Amazon Q refresh token and let OmniRoute validate it.'
						},
						{
							id: 'device-code',
							label: 'Device Login',
							description: 'Use the OmniRoute device-code flow and finish the verification step in your browser.'
						}
					],
					steps: [
						'If Amazon Q is already logged in locally, use Auto Import first so OmniCode can reuse the AWS SSO refresh token.',
						'If that fails, paste the refresh token manually from the AWS SSO cache.',
						'Device Login remains available when you want a fresh interactive flow.',
						'Sync models after connecting so Amazon Q-backed models show up in the shared model picker.'
					]
				};
			case 'qoder':
				return {
					title: 'Qoder Setup',
					summary: 'OmniRoute treats Qoder browser OAuth as experimental; the stable OmniCode path is to use a Personal Access Token.',
					website,
					credentialPrompt: 'Paste the Qoder Personal Access Token.',
					credentialPlaceholder: 'qdr_...',
					methods: [
						{
							id: 'pat',
							label: 'Personal Access Token',
							description: 'Use a PAT instead of browser OAuth. This is the stable OmniRoute path for Qoder today.',
							detail: 'OmniRoute disables Qoder browser OAuth unless the `QODER_OAUTH_*` environment variables are configured on the runtime.'
						}
					],
					steps: [
						'Open the Qoder account or token settings page and create a Personal Access Token.',
						'Copy the token into OmniCode when prompted.',
						'Save the connection and then sync models if you want the provider models available in the main model picker.'
					]
				};
			case 'github':
			case 'codex':
			case 'claude':
			case 'antigravity':
			case 'cline':
			case 'gitlab-duo':
				return {
					title: `${provider.name} OAuth Setup`,
					summary: `OmniCode will open the ${provider.name} authorization page, then you paste the callback URL or auth code back into the native setup flow.`,
					website,
					callbackPrompt: `Paste the full callback URL or the authorization code returned by ${provider.name}.`,
					methods: [
						{
							id: 'oauth-browser',
							label: 'Browser OAuth',
							description: 'Open the provider login page, approve access, and paste the callback URL or code back into OmniCode.'
						}
					],
					steps: [
						`Click ${provider.name} connect to let OmniCode open the provider login page.`,
						'Finish the sign-in and approval flow in your browser.',
						'If the provider redirects to a callback URL, copy the full final URL from the browser address bar.',
						'Paste the callback URL or the code value back into OmniCode when prompted.',
						'After the connection is created, run model sync so the provider models show up in the normal model picker.'
					]
				};
			case 'gemini-cli':
			case 'qwen':
			case 'kimi-coding':
			case 'kilocode':
				return {
					title: `${provider.name} Device Login Setup`,
					summary: `OmniCode will open the ${provider.name} verification page and give you a code to complete the device login flow.`,
					website,
					methods: [
						{
							id: 'device-code',
							label: 'Device Login',
							description: 'OmniCode asks OmniRoute for a device code, opens the verification URL, and polls until the provider approves the login.'
						}
					],
					steps: [
						`Click connect and wait for OmniCode to open the ${provider.name} verification page.`,
						'Copy the user code shown by OmniCode if the browser page asks for it.',
						'Finish the provider login in the browser, then return to OmniCode and confirm the flow is complete.',
						'OmniCode will poll the provider until the account is linked or the device code expires.'
					]
				};
			default: {
				const isApiStyle = provider.category === 'apikey' || provider.category === 'search' || provider.category === 'audio' || provider.category === 'upstream-proxy' || provider.category === 'local';
				return {
					title: `${provider.name} Setup`,
					summary: isApiStyle
						? `Provide the ${provider.name} credential in OmniCode and optionally override the base URL or provider JSON settings.`
						: `Connect ${provider.name} inside OmniCode using the native setup flow.`,
					website,
					credentialPrompt: provider.authHint || provider.apiHint || `Enter the credential for ${provider.name}.`,
					methods: isApiStyle
						? [
							{
								id: 'credential',
								label: 'Credential Entry',
								description: 'Paste the provider credential directly into OmniCode.',
								detail: provider.authHint || provider.apiHint
							}
						]
						: undefined,
					steps: isApiStyle
						? [
							website ? `Open ${website} and sign in or create the provider credential there.` : `Open the ${provider.name} provider dashboard and create the required credential.`,
							'Copy the API key, bearer token, session token, or local access secret requested by the provider.',
							'Paste it into OmniCode when prompted.',
							'If this provider uses a non-default endpoint, supply the base URL override in the next field.',
							'Use provider JSON overrides only when you need advanced options such as headers, reasoning defaults, or custom request settings.'
						]
						: [
							'Start the provider connection from OmniCode.',
							'Follow the provider login or credential flow.',
							'Complete any browser approval or copy-back step requested by the setup wizard.',
							'Sync models after connecting if you want them exposed in the standard model picker.'
						]
				};
			}
		}
	}

	private async chooseProviderSetupMethod(provider: ProviderCatalogEntry, methods: readonly ProviderSetupMethod[], placeHolder: string): Promise<ProviderSetupMethod | undefined> {
		type ProviderSetupMethodPick = vscode.QuickPickItem & {
			readonly actionKind: 'method' | 'guide' | 'website';
			readonly method?: ProviderSetupMethod;
		};
		while (true) {
			const items: ProviderSetupMethodPick[] = [
				...methods.map(method => ({
					label: method.label,
					description: method.description,
					detail: method.detail,
					actionKind: 'method' as const,
					method
				})),
				{
					label: 'Show Detailed Guide',
					description: 'Open the full provider setup instructions.',
					actionKind: 'guide' as const
				}
			];
			if (provider.website) {
				items.push({
					label: 'Open Website',
					description: provider.website,
					actionKind: 'website'
				});
			}
			const selection = await vscode.window.showQuickPick(items, {
				title: provider.name,
				placeHolder,
				ignoreFocusOut: true
			});
			if (!selection) {
				return undefined;
			}
			if (selection.actionKind === 'guide') {
				await this.showProviderGuide(provider.id);
				continue;
			}
			if (selection.actionKind === 'website' && provider.website) {
				await this.openProviderWebsite(provider.id);
				continue;
			}
			return selection.method;
		}
	}

	private async connectCursorProvider(provider: ProviderCatalogEntry): Promise<void> {
		const guide = this.getProviderSetupGuide(provider);
		const methods = guide.methods ?? [];
		const selected = await this.chooseProviderSetupMethod(
			provider,
			methods,
			'Choose how to connect Cursor'
		);
		if (!selected) {
			return;
		}

		if (selected.id === 'cursor-auto-import') {
			const autoImport = await this.requestJson<{
				readonly found?: boolean;
				readonly accessToken?: string;
				readonly machineId?: string;
				readonly source?: string;
				readonly error?: string;
			}>('/api/oauth/cursor/auto-import', 'GET', undefined);
			if (!autoImport.data.found || !autoImport.data.accessToken) {
				throw new Error(autoImport.data.error || 'No Cursor credentials were found on this machine.');
			}
			await this.requestJson('/api/oauth/cursor/import', 'POST', {
				accessToken: autoImport.data.accessToken,
				machineId: autoImport.data.machineId ?? ''
			});
			void vscode.window.showInformationMessage(
				autoImport.data.source
					? `Cursor credentials imported from ${autoImport.data.source}.`
					: 'Cursor credentials imported.'
			);
			return;
		}

		if (selected.id === 'cursor-manual-import') {
			const instructions = await this.requestJson<{
				readonly instructions?: {
					readonly title?: string;
					readonly steps?: readonly string[];
					readonly alternativeMethod?: readonly string[];
				};
			}>('/api/oauth/cursor/import', 'GET', undefined);
			const detailLines = [
				...(instructions.data.instructions?.steps ?? []),
				...(instructions.data.instructions?.alternativeMethod ?? [])
			];
			if (detailLines.length) {
				const readInstructions = await vscode.window.showInformationMessage(
					instructions.data.instructions?.title || 'Cursor import instructions are available.',
					{ modal: true, detail: detailLines.join('\n') },
					'Continue'
				);
				if (!readInstructions) {
					return;
				}
			}

			const accessToken = await vscode.window.showInputBox({
				title: provider.name,
				prompt: 'Paste Cursor access token (`cursorAuth/accessToken`).',
				password: true,
				ignoreFocusOut: true
			});
			if (!accessToken) {
				return;
			}
			const machineId = await vscode.window.showInputBox({
				title: provider.name,
				prompt: 'Paste Cursor machine ID (`storage.serviceMachineId`).',
				ignoreFocusOut: true
			});
			if (!machineId) {
				return;
			}
			await this.requestJson('/api/oauth/cursor/import', 'POST', {
				accessToken,
				machineId
			});
			return;
		}

		await this.connectOAuthProvider(provider);
	}

	private async connectKiroCompatibleProvider(provider: ProviderCatalogEntry): Promise<void> {
		const guide = this.getProviderSetupGuide(provider);
		const methods = guide.methods ?? [];
		const selected = await this.chooseProviderSetupMethod(
			provider,
			methods,
			provider.id === 'amazon-q' ? 'Choose how to connect Amazon Q' : 'Choose how to connect Kiro'
		);
		if (!selected) {
			return;
		}

		if (selected.id === 'kiro-auto-import') {
			const query = provider.id === 'amazon-q' ? '?targetProvider=amazon-q' : '';
			const autoImport = await this.requestJson<{
				readonly found?: boolean;
				readonly refreshToken?: string;
				readonly source?: string;
				readonly error?: string;
			}>(`/api/oauth/kiro/auto-import${query}`, 'GET', undefined);
			if (!autoImport.data.found || !autoImport.data.refreshToken) {
				throw new Error(autoImport.data.error || `No ${provider.name} credentials were found on this machine.`);
			}
			await this.requestJson(`/api/oauth/kiro/import${query}`, 'POST', {
				refreshToken: autoImport.data.refreshToken
			});
			void vscode.window.showInformationMessage(
				autoImport.data.source
					? `${provider.name} credentials imported from ${autoImport.data.source}.`
					: `${provider.name} credentials imported.`
			);
			return;
		}

		if (selected.id === 'kiro-manual-import') {
			const refreshToken = await vscode.window.showInputBox({
				title: provider.name,
				prompt: `Paste the ${provider.name} refresh token from the AWS SSO cache.`,
				password: true,
				ignoreFocusOut: true
			});
			if (!refreshToken) {
				return;
			}
			const query = provider.id === 'amazon-q' ? '?targetProvider=amazon-q' : '';
			await this.requestJson(`/api/oauth/kiro/import${query}`, 'POST', {
				refreshToken
			});
			return;
		}

		if (selected.id === 'kiro-social-google' || selected.id === 'kiro-social-github') {
			const socialProvider = selected.id.endsWith('google') ? 'google' : 'github';
			const authData = await this.requestJson<{
				readonly authUrl: string;
				readonly codeVerifier: string;
				readonly state: string;
			}>(`/api/oauth/kiro/social-authorize?provider=${encodeURIComponent(socialProvider)}`, 'GET', undefined);
			await vscode.env.openExternal(vscode.Uri.parse(authData.data.authUrl));
			const callbackInput = await vscode.window.showInputBox({
				title: provider.name,
				prompt: `Paste the full kiro:// callback URL or code returned by ${socialProvider}.`,
				ignoreFocusOut: true
			});
			if (!callbackInput) {
				return;
			}
			const parsed = this.parseOAuthCallbackInput(callbackInput, authData.data.state);
			if (!parsed.code) {
				throw new Error('No authorization code was found in the callback input.');
			}
			await this.requestJson('/api/oauth/kiro/social-exchange', 'POST', {
				code: parsed.code,
				codeVerifier: authData.data.codeVerifier,
				provider: socialProvider
			});
			return;
		}

		await this.connectOAuthProvider(provider);
	}

	private async connectOAuthProvider(provider: ProviderCatalogEntry): Promise<void> {
		await this.presentProviderSetupDialog(provider, 'Continue Setup');
		if (DEVICE_CODE_PROVIDERS.has(provider.id)) {
			const deviceData = await this.requestJson<{
				readonly device_code: string;
				readonly user_code: string;
				readonly verification_uri?: string;
				readonly verification_uri_complete?: string;
				readonly interval?: number;
				readonly codeVerifier?: string;
				readonly _clientId?: string;
				readonly _clientSecret?: string;
				readonly _region?: string;
			}>(`/api/oauth/${provider.id}/device-code`, 'GET', undefined);
			const verificationUrl = deviceData.data.verification_uri_complete || deviceData.data.verification_uri;
			if (verificationUrl) {
				await vscode.env.openExternal(vscode.Uri.parse(verificationUrl));
			}
			void vscode.window.showInformationMessage(`${provider.name}: ${deviceData.data.user_code}`, { modal: false });
			const ok = await vscode.window.showInformationMessage(
				vscode.l10n.t('{0}: complete the device login, then continue here.', provider.name),
				{ modal: true },
				vscode.l10n.t('Finish Login')
			);
			if (!ok) {
				return;
			}

			const extraData: JsonObject | undefined =
				provider.id === 'kiro' || provider.id === 'amazon-q'
					? {
						_clientId: deviceData.data._clientId ?? null,
						_clientSecret: deviceData.data._clientSecret ?? null,
						_region: deviceData.data._region ?? null
					}
					: undefined;

			await this.pollDeviceAuthorization(provider, deviceData.data.device_code, deviceData.data.codeVerifier, deviceData.data.interval ?? 5, extraData);
			return;
		}

		const redirectUri = this.getOAuthRedirectUri(provider.id);
		const authData = await this.requestJson<{
			readonly authUrl: string;
			readonly codeVerifier?: string;
			readonly state?: string;
		}>(`/api/oauth/${provider.id}/authorize?redirect_uri=${encodeURIComponent(redirectUri)}`, 'GET', undefined);
		await vscode.env.openExternal(vscode.Uri.parse(authData.data.authUrl));

		const callbackInput = await vscode.window.showInputBox({
			title: provider.name,
			prompt: this.getProviderSetupGuide(provider).callbackPrompt || vscode.l10n.t('Paste the callback URL or authentication code for {0}', provider.name),
			ignoreFocusOut: true
		});
		if (!callbackInput) {
			return;
		}

		const parsed = this.parseOAuthCallbackInput(callbackInput, authData.data.state);
		if (!parsed.code) {
			throw new Error('No authorization code was found in the callback input.');
		}

		await this.requestJson(`/api/oauth/${provider.id}/exchange`, 'POST', {
			code: parsed.code,
			redirectUri,
			codeVerifier: authData.data.codeVerifier,
			state: parsed.state ?? null
		});
	}

	private async connectApiKeyProvider(provider: ProviderCatalogEntry): Promise<void> {
		await this.presentProviderSetupDialog(provider, 'Continue Setup');
		const guide = this.getProviderSetupGuide(provider);
		const secret = await vscode.window.showInputBox({
			title: provider.name,
			prompt: guide.credentialPrompt || provider.authHint || provider.apiHint || vscode.l10n.t('Enter the credential for {0}', provider.name),
			placeHolder: guide.credentialPlaceholder,
			password: true,
			ignoreFocusOut: true
		});
		if (!secret) {
			return;
		}

		const name = await vscode.window.showInputBox({
			title: provider.name,
			prompt: vscode.l10n.t('Connection name for {0}', provider.name),
			value: provider.name,
			ignoreFocusOut: true
		});
		if (!name) {
			return;
		}

		const baseUrl = await vscode.window.showInputBox({
			title: provider.name,
			prompt: vscode.l10n.t('Optional base URL override for {0}', provider.name),
			ignoreFocusOut: true
		});
		const extraJson = await vscode.window.showInputBox({
			title: provider.name,
			prompt: vscode.l10n.t('Optional provider JSON overrides for {0}', provider.name),
			placeHolder: '{"requestDefaults":{"reasoningEffort":"medium"}}',
			ignoreFocusOut: true
		});

		const providerSpecificData = this.parseProviderSpecificData(baseUrl, extraJson);
		await this.requestJson('/api/providers', 'POST', {
			provider: provider.id,
			name,
			apiKey: secret,
			providerSpecificData
		});
	}

	private async pollDeviceAuthorization(provider: ProviderCatalogEntry, deviceCode: string, codeVerifier: string | undefined, intervalSeconds: number, extraData: JsonObject | undefined): Promise<void> {
		for (let attempt = 0; attempt < 60; attempt++) {
			await new Promise(resolve => setTimeout(resolve, intervalSeconds * 1000));
			const response = await this.requestJson<{
				readonly success?: boolean;
				readonly error?: string;
				readonly errorDescription?: string;
			}>(`/api/oauth/${provider.id}/poll`, 'POST', {
				deviceCode,
				codeVerifier,
				extraData
			});
			if (response.data.success) {
				return;
			}
			if (response.data.error && response.data.error !== 'authorization_pending' && response.data.error !== 'slow_down') {
				throw new Error(response.data.errorDescription || response.data.error);
			}
		}
		throw new Error(`Timed out waiting for ${provider.name} device authorization.`);
	}

	private async addProxy(): Promise<void> {
		await this.ensureProxyReady();

		const name = await vscode.window.showInputBox({
			prompt: vscode.l10n.t('Proxy name'),
			ignoreFocusOut: true
		});
		if (!name) {
			return;
		}
		const host = await vscode.window.showInputBox({
			prompt: vscode.l10n.t('Proxy host'),
			ignoreFocusOut: true
		});
		if (!host) {
			return;
		}
		const portValue = await vscode.window.showInputBox({
			prompt: vscode.l10n.t('Proxy port'),
			value: '8080',
			ignoreFocusOut: true,
			validateInput: value => /^\d+$/.test(value) ? undefined : vscode.l10n.t('Port must be numeric')
		});
		if (!portValue) {
			return;
		}
		const typePick = await vscode.window.showQuickPick([
			{ label: 'http' },
			{ label: 'https' },
			{ label: 'socks5' }
		], {
			title: vscode.l10n.t('Proxy type')
		});
		if (!typePick) {
			return;
		}
		const username = await vscode.window.showInputBox({
			prompt: vscode.l10n.t('Optional proxy username'),
			ignoreFocusOut: true
		});
		const password = username ? await vscode.window.showInputBox({
			prompt: vscode.l10n.t('Optional proxy password'),
			password: true,
			ignoreFocusOut: true
		}) : undefined;

		const created = await this.requestJson<ProxyItem>('/api/settings/proxies', 'POST', {
			name,
			host,
			port: Number(portValue),
			type: typePick.label,
			username: username || undefined,
			password: password || undefined
		});

		const useAsGlobal = await vscode.window.showInformationMessage(
			vscode.l10n.t('Use {0} as the global {1} proxy?', created.data.name, OMNIPROXY_BRAND_NAME),
			vscode.l10n.t('Use Globally')
		);
		if (useAsGlobal) {
			await this.requestJson('/api/settings/proxies/assignments', 'PUT', {
				scope: 'global',
				proxyId: created.data.id
			});
		}
	}

	private async syncModels(): Promise<void> {
		await this.ensureProxyReady();
		const connections = await this.fetchConnections();
		const models = await this.fetchSelectableModels(connections);
		const modelsFile = this.getLanguageModelsFilePath();
		const groups = await this.readLanguageModelGroups(modelsFile);
		const updatedGroups = this.upsertOmniProxyGroup(groups, models);
		await fs.promises.mkdir(path.dirname(modelsFile), { recursive: true });
		await fs.promises.writeFile(modelsFile, `${JSON.stringify(updatedGroups, undefined, '\t')}\n`, 'utf8');
		await this.context.globalState.update(OMNIROUTE_LAST_SYNC_STORAGE, new Date().toISOString());
	}

	private async createApiKey(): Promise<void> {
		await this.ensureProxyReady();
		const name = await vscode.window.showInputBox({
			title: vscode.l10n.t('Create {0} API Key', OMNIPROXY_BRAND_NAME),
			prompt: vscode.l10n.t('API key name'),
			value: `${OMNIPROXY_BRAND_NAME} Key`,
			ignoreFocusOut: true
		});
		if (!name?.trim()) {
			return;
		}

		const response = await this.requestJson<{ readonly key: string; readonly id: string; readonly name: string }>('/api/keys', 'POST', {
			name: name.trim()
		});
		await vscode.env.clipboard.writeText(response.data.key);
		void vscode.window.showInformationMessage(vscode.l10n.t('{0} created and copied to the clipboard.', response.data.name));
	}

	private async deleteApiKey(id: string | undefined): Promise<void> {
		if (!id) {
			return;
		}
		await this.ensureProxyReady();
		const confirmation = await vscode.window.showWarningMessage(
			vscode.l10n.t('Delete this API key?'),
			{ modal: true },
			vscode.l10n.t('Delete')
		);
		if (!confirmation) {
			return;
		}
		await this.requestJson(`/api/keys/${encodeURIComponent(id)}`, 'DELETE', undefined);
	}

	private async addModelAlias(): Promise<void> {
		await this.ensureProxyReady();
		const from = await vscode.window.showInputBox({
			title: vscode.l10n.t('Add Model Alias'),
			prompt: vscode.l10n.t('Existing model id'),
			ignoreFocusOut: true
		});
		if (!from?.trim()) {
			return;
		}
		const to = await vscode.window.showInputBox({
			title: vscode.l10n.t('Add Model Alias'),
			prompt: vscode.l10n.t('Replacement model id'),
			ignoreFocusOut: true
		});
		if (!to?.trim()) {
			return;
		}
		await this.requestJson('/api/settings/model-aliases', 'POST', { from: from.trim(), to: to.trim() });
	}

	private async removeModelAlias(from: string | undefined): Promise<void> {
		if (!from) {
			return;
		}
		await this.ensureProxyReady();
		await this.requestJson('/api/settings/model-aliases', 'DELETE', { from });
	}

	private async createCombo(): Promise<void> {
		await this.ensureProxyReady();
		const name = await vscode.window.showInputBox({
			title: vscode.l10n.t('Create Combo'),
			prompt: vscode.l10n.t('Combo name'),
			ignoreFocusOut: true
		});
		if (!name?.trim()) {
			return;
		}
		const strategy = await vscode.window.showQuickPick([
			{ label: 'priority' },
			{ label: 'weighted' },
			{ label: 'round-robin' },
			{ label: 'context-relay' },
			{ label: 'reset-aware' }
		], { title: vscode.l10n.t('Routing strategy') });
		if (!strategy) {
			return;
		}
		const modelsInput = await vscode.window.showInputBox({
			title: vscode.l10n.t('Create Combo'),
			prompt: vscode.l10n.t('Comma-separated model ids'),
			placeHolder: 'gemini-cli/gemini-3.1-pro-preview, antigravity/model',
			ignoreFocusOut: true
		});
		const models = (modelsInput ?? '')
			.split(',')
			.map(value => value.trim())
			.filter(Boolean)
			.map((modelId, index) => ({ model: modelId, priority: index + 1, weight: 1 }));
		if (!models.length) {
			return;
		}
		await this.requestJson('/api/combos', 'POST', {
			name: name.trim(),
			strategy: strategy.label,
			models
		});
	}

	private async deleteCombo(id: string | undefined): Promise<void> {
		if (!id) {
			return;
		}
		await this.ensureProxyReady();
		const confirmation = await vscode.window.showWarningMessage(
			vscode.l10n.t('Delete this combo?'),
			{ modal: true },
			vscode.l10n.t('Delete')
		);
		if (!confirmation) {
			return;
		}
		await this.requestJson(`/api/combos/${encodeURIComponent(id)}`, 'DELETE', undefined);
	}

	private async testCombo(comboName: string | undefined): Promise<void> {
		if (!comboName) {
			return;
		}
		await this.ensureProxyReady();
		const response = await this.requestJson<{ readonly resolvedBy?: string | null; readonly results?: readonly JsonObject[] }>('/api/combos/test', 'POST', { comboName });
		const resolvedBy = typeof response.data.resolvedBy === 'string' ? response.data.resolvedBy : 'none';
		void vscode.window.showInformationMessage(vscode.l10n.t('Combo test finished. Resolved by: {0}', resolvedBy));
	}

	private async testProvidersBatch(mode: string | undefined): Promise<void> {
		await this.ensureProxyReady();
		const selectedMode = mode ?? (await vscode.window.showQuickPick([
			{ label: 'all' },
			{ label: 'oauth' },
			{ label: 'apikey' },
			{ label: 'compatible' },
			{ label: 'free' }
		], { title: vscode.l10n.t('Batch test provider group') }))?.label;
		if (!selectedMode) {
			return;
		}
		const response = await this.requestJson<{ readonly summary?: { readonly total?: number; readonly passed?: number; readonly failed?: number } }>('/api/providers/test-batch', 'POST', { mode: selectedMode });
		const summary = response.data.summary;
		void vscode.window.showInformationMessage(vscode.l10n.t('Batch test complete: {0} passed, {1} failed.', summary?.passed ?? 0, summary?.failed ?? 0));
	}

	private async clearCache(scope: { readonly model?: string } | undefined): Promise<void> {
		await this.ensureProxyReady();
		if (scope?.model) {
			await this.requestJson(`/api/cache?model=${encodeURIComponent(scope.model)}`, 'DELETE', undefined);
			return;
		}
		await this.requestJson('/api/cache', 'DELETE', undefined);
	}

	private async resetCacheMetrics(): Promise<void> {
		await this.ensureProxyReady();
		await this.requestJson('/api/settings/cache-metrics', 'DELETE', undefined);
	}

	private async refreshProviderLimits(): Promise<void> {
		await this.ensureProxyReady();
		await this.requestJson('/api/usage/provider-limits', 'POST', undefined);
	}

	private async toggleRateLimitProtection(payload: { readonly connectionId?: string; readonly enabled?: boolean } | undefined): Promise<void> {
		if (!payload?.connectionId) {
			return;
		}
		await this.ensureProxyReady();
		await this.requestJson('/api/rate-limits', 'POST', {
			connectionId: payload.connectionId,
			enabled: payload.enabled === true
		});
	}

	private async addMemory(): Promise<void> {
		await this.ensureProxyReady();
		const key = await vscode.window.showInputBox({
			title: vscode.l10n.t('Add Memory'),
			prompt: vscode.l10n.t('Memory key'),
			ignoreFocusOut: true
		});
		if (!key?.trim()) {
			return;
		}
		const content = await vscode.window.showInputBox({
			title: vscode.l10n.t('Add Memory'),
			prompt: vscode.l10n.t('Memory content'),
			ignoreFocusOut: true
		});
		if (!content?.trim()) {
			return;
		}
		const type = await vscode.window.showQuickPick([
			{ label: 'factual' },
			{ label: 'episodic' },
			{ label: 'procedural' },
			{ label: 'semantic' }
		], { title: vscode.l10n.t('Memory type') });
		if (!type) {
			return;
		}
		await this.requestJson('/api/memory', 'POST', {
			key: key.trim(),
			content: content.trim(),
			type: type.label
		});
	}

	private async deleteMemory(id: string | undefined): Promise<void> {
		if (!id) {
			return;
		}
		await this.ensureProxyReady();
		await this.requestJson(`/api/memory/${encodeURIComponent(id)}`, 'DELETE', undefined);
	}

	private async issueAccessKey(force: boolean): Promise<string> {
		if (!force) {
			const existing = await this.context.secrets.get(OMNIROUTE_SECRET_KEY);
			if (existing) {
				return existing;
			}
		}

		await this.ensureProxyReady();
		const response = await this.requestJson<OmniProxyApiKeyResponse>('/api/keys', 'POST', {
			name: 'OmniCode OmniProxy',
			noLog: true,
			scopes: []
		});
		await this.context.secrets.store(OMNIROUTE_SECRET_KEY, response.data.key);
		await this.context.globalState.update(OMNIROUTE_ACCESS_KEY_ID_STORAGE, response.data.id);
		return response.data.key;
	}

	private async fetchModels(accessKey: string): Promise<readonly ModelDescriptor[]> {
		const response = await this.requestJson<ModelsPayload>('/v1/models', 'GET', undefined, accessKey);
		return Array.isArray(response.data.data) ? response.data.data : [];
	}

	private async fetchModelsWithRetry(): Promise<readonly ModelDescriptor[]> {
		let accessKey = await this.issueAccessKey(false);
		try {
			return await this.fetchModels(accessKey);
		} catch (error) {
			if (!this.isInvalidApiKeyError(error)) {
				throw error;
			}
			await this.context.secrets.delete(OMNIROUTE_SECRET_KEY);
			accessKey = await this.issueAccessKey(true);
			return this.fetchModels(accessKey);
		}
	}

	private async fetchSelectableModels(connections: readonly ProviderConnection[]): Promise<readonly ModelDescriptor[]> {
		let endpointModels: readonly ModelDescriptor[] = [];
		let endpointError: unknown;

		try {
			endpointModels = await this.fetchModelsWithRetry();
		} catch (error) {
			endpointError = error;
			this.outputChannel.appendLine(`[${OMNIPROXY_BRAND_NAME}] /v1/models fetch failed: ${error instanceof Error ? error.message : String(error)}`);
		}

		const connectionModels = await this.fetchConnectionBackedModels(connections);
		const merged = this.mergeSelectableModels(endpointModels, connectionModels);
		if (merged.length > 0) {
			return merged;
		}
		if (endpointError) {
			throw endpointError;
		}
		return [];
	}

	private async fetchConnectionBackedModels(connections: readonly ProviderConnection[]): Promise<readonly ModelDescriptor[]> {
		const activeConnections = connections.filter(connection => connection.isActive !== false && typeof connection.id === 'string' && typeof connection.provider === 'string');
		if (activeConnections.length === 0) {
			return [];
		}

		const results = await Promise.allSettled(activeConnections.map(connection => this.fetchConnectionCatalog(connection)));
		const models: ModelDescriptor[] = [];
		for (const result of results) {
			if (result.status === 'fulfilled') {
				models.push(...result.value);
				continue;
			}
			this.outputChannel.appendLine(`[${OMNIPROXY_BRAND_NAME}] provider catalog fetch failed: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`);
		}
		return models;
	}

	private async fetchConnectionCatalog(connection: ProviderConnection): Promise<readonly ModelDescriptor[]> {
		const response = await this.requestJson<ProviderModelsPayload>(`/api/providers/${encodeURIComponent(connection.id)}/models?excludeHidden=true`, 'GET', undefined);
		const providerId = typeof response.data.provider === 'string' && response.data.provider.trim().length ? response.data.provider : connection.provider;
		const models = Array.isArray(response.data.models) ? response.data.models : [];
		return models
			.map(model => this.toConnectionBackedModel(providerId, model))
			.filter((model): model is ModelDescriptor => Boolean(model));
	}

	private toConnectionBackedModel(providerId: string, model: ProviderCatalogModel): ModelDescriptor | undefined {
		if (!this.isChatModel(model)) {
			return undefined;
		}

		const rawId = typeof model.id === 'string' ? model.id.trim() : '';
		if (!rawId) {
			return undefined;
		}

		const id = this.qualifyOmniProxyModelId(providerId, rawId);
		const vision = model.capabilities?.vision === true || model.input_modalities?.includes('image') === true;
		return {
			id,
			name: model.name || rawId,
			owned_by: providerId,
			root: rawId.includes('/') ? rawId.slice(rawId.lastIndexOf('/') + 1) : rawId,
			type: model.type,
			api_format: model.apiFormat,
			context_length: model.context_length ?? model.inputTokenLimit,
			max_output_tokens: model.max_output_tokens ?? model.outputTokenLimit,
			input_modalities: vision ? ['text', 'image'] : model.input_modalities,
			capabilities: vision ? { vision: true } : model.capabilities
		};
	}

	private mergeSelectableModels(endpointModels: readonly ModelDescriptor[], connectionModels: readonly ModelDescriptor[]): readonly ModelDescriptor[] {
		const merged = new Map<string, ModelDescriptor>();
		for (const model of endpointModels) {
			if (!this.isChatModel(model)) {
				continue;
			}
			const normalized = this.normalizeOmniProxyModel(model);
			if (!merged.has(normalized.id)) {
				merged.set(normalized.id, normalized);
			}
		}
		for (const model of connectionModels) {
			if (!this.isChatModel(model)) {
				continue;
			}
			const normalized = this.normalizeOmniProxyModel(model);
			if (!merged.has(normalized.id)) {
				merged.set(normalized.id, normalized);
			}
		}
		return [...merged.values()].sort((left, right) => (left.name || left.id).localeCompare(right.name || right.id));
	}

	private normalizeOmniProxyModel(model: ModelDescriptor): ModelDescriptor {
		const id = this.qualifyOmniProxyModelId(model.owned_by, model.id, model.root);
		const vision = model.capabilities?.vision === true || model.input_modalities?.includes('image') === true;
		return {
			...model,
			id,
			name: model.name || model.root || model.id,
			root: model.root ?? (id.includes('/') ? id.slice(id.lastIndexOf('/') + 1) : id),
			input_modalities: vision ? ['text', 'image'] : model.input_modalities,
			capabilities: vision ? { vision: true } : model.capabilities
		};
	}

	private qualifyOmniProxyModelId(providerId: string | undefined, modelId: string, rootId?: string | null): string {
		const trimmedModelId = modelId.trim();
		if (!trimmedModelId) {
			return trimmedModelId;
		}

		const effectiveProviderId = typeof providerId === 'string' ? providerId.trim() : '';
		if (!effectiveProviderId || effectiveProviderId === 'combo') {
			return trimmedModelId;
		}

		const effectiveRootId = typeof rootId === 'string' && rootId.trim().length
			? rootId.trim()
			: trimmedModelId.includes('/')
				? trimmedModelId.slice(trimmedModelId.lastIndexOf('/') + 1)
				: trimmedModelId;

		if (!effectiveRootId || trimmedModelId === effectiveRootId || !trimmedModelId.includes('/')) {
			return `${effectiveProviderId}/${effectiveRootId}`;
		}

		const prefix = trimmedModelId.slice(0, trimmedModelId.indexOf('/'));
		if (prefix !== effectiveProviderId) {
			return `${effectiveProviderId}/${effectiveRootId}`;
		}

		return trimmedModelId;
	}

	private isChatModel(model: Pick<ModelDescriptor, 'type' | 'api_format' | 'supported_endpoints'> | Pick<ProviderCatalogModel, 'type' | 'apiFormat' | 'supportedEndpoints'>): boolean {
		const endpoints = this.readModelEndpoints(model);
		if (Array.isArray(endpoints) && endpoints.length > 0 && !endpoints.includes('chat')) {
			return false;
		}

		const type = 'type' in model ? model.type : undefined;
		if (typeof type === 'string' && type !== 'chat') {
			return false;
		}

		const apiFormat = this.readModelApiFormat(model);
		if (typeof apiFormat === 'string' && apiFormat.length > 0 && apiFormat !== 'chat-completions') {
			return false;
		}

		return true;
	}

	private readModelEndpoints(model: Pick<ModelDescriptor, 'supported_endpoints'> | Pick<ProviderCatalogModel, 'supportedEndpoints'>): readonly string[] | undefined {
		const record = model as { readonly supported_endpoints?: readonly string[]; readonly supportedEndpoints?: readonly string[] };
		return record.supported_endpoints ?? record.supportedEndpoints;
	}

	private readModelApiFormat(model: Pick<ModelDescriptor, 'api_format'> | Pick<ProviderCatalogModel, 'apiFormat'>): string | undefined {
		const record = model as { readonly api_format?: string; readonly apiFormat?: string };
		return record.api_format ?? record.apiFormat;
	}

	private upsertOmniProxyGroup(groups: readonly JsonValue[], models: readonly ModelDescriptor[]): readonly JsonValue[] {
		const secretReference = `\${input:${OMNIROUTE_SECRET_KEY}}`;
		const baseUrl = this.getBaseUrl().toString();
		const mappedModels = models.map(model => ({
			id: model.id,
			name: model.name || model.id,
			url: `${baseUrl}/v1`,
			apiType: 'chat-completions',
			toolCalling: true,
			vision: model.capabilities?.vision === true || model.input_modalities?.includes('image') === true,
			maxInputTokens: model.context_length ?? 128000,
			maxOutputTokens: model.max_output_tokens ?? 16000
		}));

		const group = {
			vendor: 'customendpoint',
			name: OMNIROUTE_GROUP_NAME,
			apiKey: secretReference,
			apiType: 'chat-completions',
			models: mappedModels
		};

		const nextGroups: JsonValue[] = [];
		let updated = false;
		for (const item of groups) {
			if (!this.isJsonObject(item)) {
				nextGroups.push(item);
				continue;
			}
			if (item.vendor === 'customendpoint' && item.name === OMNIROUTE_GROUP_NAME) {
				nextGroups.push(group);
				updated = true;
				continue;
			}
			nextGroups.push(item);
		}

		if (!updated) {
			nextGroups.push(group);
		}

		return nextGroups;
	}

	private async readLanguageModelGroups(filePath: string): Promise<readonly JsonValue[]> {
		try {
			const raw = await fs.promises.readFile(filePath, 'utf8');
			const parsed = JSON.parse(raw) as JsonValue;
			return Array.isArray(parsed) ? parsed : [];
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
				return [];
			}
			throw error;
		}
	}

	private getLanguageModelsFilePath(): string {
		const globalStoragePath = this.context.globalStorageUri.fsPath;
		const profilePath = path.dirname(path.dirname(globalStoragePath));
		return path.join(profilePath, 'chatLanguageModels.json');
	}

	private async fetchConnections(): Promise<readonly ProviderConnection[]> {
		const response = await this.requestJson<{ readonly connections?: readonly ProviderConnection[] }>('/api/providers', 'GET', undefined);
		return response.data.connections ?? [];
	}

	private async fetchUsageStats(): Promise<UsageStats | undefined> {
		const response = await this.requestJson<UsageStats>('/api/usage/history', 'GET', undefined);
		return response.data;
	}

	private async fetchProxies(): Promise<readonly ProxyItem[]> {
		const response = await this.requestJson<{ readonly items?: readonly ProxyItem[] }>('/api/settings/proxies', 'GET', undefined);
		return response.data.items ?? [];
	}

	private async fetchProxyAssignments(): Promise<readonly ProxyAssignment[]> {
		const response = await this.requestJson<{ readonly items?: readonly ProxyAssignment[] }>('/api/settings/proxies/assignments?scope=global', 'GET', undefined);
		return response.data.items ?? [];
	}

	private async fetchModelCount(): Promise<number> {
		const status = await this.ensureLoginDisabled();
		if (status.requireLogin) {
			return 0;
		}
		try {
			const connections = await this.fetchConnections();
			const models = await this.fetchSelectableModels(connections);
			return models.length;
		} catch (error) {
			if (this.isInvalidApiKeyError(error)) {
				try {
					await this.context.secrets.delete(OMNIROUTE_SECRET_KEY);
					const connections = await this.fetchConnections();
					const models = await this.fetchSelectableModels(connections);
					return models.length;
				} catch (retryError) {
					if (this.isInvalidApiKeyError(retryError)) {
						return 0;
					}
					throw retryError;
				}
			}
			throw error;
		}
	}

	private async fetchRequireLoginStatus(): Promise<RequireLoginStatus> {
		const response = await this.requestJson<RequireLoginStatus>('/api/settings/require-login', 'GET', undefined, undefined, false);
		return response.data;
	}

	private async getProviderCatalog(): Promise<readonly ProviderCatalogEntry[]> {
		if (this.providerCatalog) {
			return this.providerCatalog;
		}

		const source = await fs.promises.readFile(this.providersFile, 'utf8');
		const catalog: ProviderCatalogEntry[] = [];
		for (const group of PROVIDER_GROUPS) {
			const literal = this.extractObjectLiteral(source, group.exportName);
			const value = vm.runInNewContext(`(${literal})`) as Record<string, JsonObject>;
			for (const provider of Object.values(value)) {
				if (!this.isJsonObject(provider) || typeof provider.id !== 'string' || typeof provider.name !== 'string') {
					continue;
				}
				catalog.push({
					id: provider.id,
					name: provider.name,
					color: typeof provider.color === 'string' ? provider.color : undefined,
					category: group.category,
					authHint: typeof provider.authHint === 'string' ? provider.authHint : undefined,
					apiHint: typeof provider.apiHint === 'string' ? provider.apiHint : undefined,
					website: typeof provider.website === 'string' ? provider.website : undefined,
					deprecated: provider.deprecated === true,
					deprecationReason: typeof provider.deprecationReason === 'string' ? provider.deprecationReason : undefined
				});
			}
		}

		this.providerCatalog = catalog.sort((left, right) => left.name.localeCompare(right.name));
		return this.providerCatalog;
	}

	private extractObjectLiteral(source: string, exportName: string): string {
		const marker = `export const ${exportName} =`;
		const markerIndex = source.indexOf(marker);
		if (markerIndex < 0) {
			throw new Error(`Could not find ${exportName} in the OmniProxy provider catalog.`);
		}

		const start = source.indexOf('{', markerIndex);
		if (start < 0) {
			throw new Error(`Could not parse ${exportName}.`);
		}

		let depth = 0;
		let inSingleQuote = false;
		let inDoubleQuote = false;
		let escaped = false;
		for (let index = start; index < source.length; index++) {
			const character = source[index];
			if (escaped) {
				escaped = false;
				continue;
			}
			if (character === '\\') {
				escaped = true;
				continue;
			}
			if (!inDoubleQuote && character === '\'') {
				inSingleQuote = !inSingleQuote;
				continue;
			}
			if (!inSingleQuote && character === '"') {
				inDoubleQuote = !inDoubleQuote;
				continue;
			}
			if (inSingleQuote || inDoubleQuote) {
				continue;
			}
			if (character === '{') {
				depth += 1;
			} else if (character === '}') {
				depth -= 1;
				if (depth === 0) {
					return source.slice(start, index + 1);
				}
			}
		}

		throw new Error(`Could not find the end of ${exportName}.`);
	}

	private parseProviderSpecificData(baseUrl: string | undefined, extraJson: string | undefined): JsonObject | undefined {
		let value: JsonObject = {};
		if (baseUrl && baseUrl.trim()) {
			value = { ...value, baseUrl: baseUrl.trim() };
		}
		if (extraJson && extraJson.trim()) {
			const parsed = JSON.parse(extraJson) as JsonValue;
			if (!this.isJsonObject(parsed)) {
				throw new Error('Provider overrides must be a JSON object.');
			}
			value = { ...value, ...parsed };
		}
		return Object.keys(value).length ? value : undefined;
	}

	private parseOAuthCallbackInput(input: string, fallbackState: string | undefined): { readonly code?: string; readonly state?: string } {
		try {
			const url = new URL(input);
			return {
				code: url.searchParams.get('code') ?? undefined,
				state: url.searchParams.get('state') ?? fallbackState
			};
		} catch {
			const [code, state] = input.split('#', 2);
			return {
				code: code || undefined,
				state: state || fallbackState
			};
		}
	}

	private getOAuthRedirectUri(providerId: string): string {
		const port = String(this.getBaseUrl().port || '20128');
		if (providerId === 'codex') {
			return 'http://localhost:1455/auth/callback';
		}
		return `http://localhost:${port}/callback`;
	}

	private resolveOmniRouteRoot(): string {
		const candidates = [
			this.workspaceRoot ? path.join(this.workspaceRoot, OMNIROUTE_EMBEDDED_RUNTIME_DIR) : undefined,
			path.join(this.repoRoot, OMNIROUTE_EMBEDDED_RUNTIME_DIR),
			path.join(process.cwd(), OMNIROUTE_EMBEDDED_RUNTIME_DIR),
			this.workspaceRoot ? path.join(this.workspaceRoot, 'OmniRoute-main') : undefined,
			path.join(this.repoRoot, 'OmniRoute-main'),
			path.join(process.cwd(), 'OmniRoute-main'),
		].filter((candidate): candidate is string => typeof candidate === 'string');

		for (const candidate of candidates) {
			if (this.isOmniRouteRuntimeRoot(candidate)) {
				return candidate;
			}
		}

		return candidates[0] ?? path.join(this.repoRoot, OMNIROUTE_EMBEDDED_RUNTIME_DIR);
	}

	private isOmniRouteRuntimeRoot(candidate: string): boolean {
		return fs.existsSync(path.join(candidate, 'package.json'))
			&& fs.existsSync(path.join(candidate, 'src', 'shared', 'constants', 'providers.ts'))
			&& fs.existsSync(path.join(candidate, 'scripts'));
	}

	private dependenciesInstalled(): boolean {
		return fs.existsSync(path.join(this.omniRouteRoot, 'node_modules'));
	}

	private getBaseUrl(): URL {
		const configured = vscode.workspace.getConfiguration('omniroute').get<string>('baseUrl', 'http://127.0.0.1:20128');
		return new URL(configured);
	}

	private getNodePath(): string {
		const configured = vscode.workspace.getConfiguration('omniroute').get<string>('nodePath', '/tmp/vscode-run-bin/node');
		if (configured && fs.existsSync(configured)) {
			return configured;
		}

		const codexRuntimeNodePath = this.getCodexRuntimeNodePath();
		if (codexRuntimeNodePath) {
			return codexRuntimeNodePath;
		}

		const embeddedNodePath = this.getEmbeddedNodePath();
		if (embeddedNodePath) {
			return this.ensureEmbeddedNodeShim(embeddedNodePath);
		}

		return 'node';
	}

	private getNpmPath(): string {
		const configured = vscode.workspace.getConfiguration('omniroute').get<string>('npmPath', '/tmp/vscode-run-bin/npm');
		return configured && fs.existsSync(configured) ? configured : 'npm';
	}

	private resolveRuntimeSecretOverrides(): NodeJS.ProcessEnv {
		const overrides: NodeJS.ProcessEnv = {
			DATA_DIR: this.getRuntimeDataDir()
		};
		const storageEncryptionKey = this.resolveEnvValue('STORAGE_ENCRYPTION_KEY');
		if (storageEncryptionKey) {
			overrides.STORAGE_ENCRYPTION_KEY = storageEncryptionKey;
		}

		const storageEncryptionKeyVersion = this.resolveEnvValue('STORAGE_ENCRYPTION_KEY_VERSION');
		if (storageEncryptionKeyVersion) {
			overrides.STORAGE_ENCRYPTION_KEY_VERSION = storageEncryptionKeyVersion;
		}

		return overrides;
	}

	private resolveEnvValue(key: string): string | undefined {
		const fromProcess = process.env[key]?.trim();
		if (fromProcess) {
			return fromProcess;
		}

		for (const candidate of this.getRuntimeEnvCandidateFiles()) {
			const value = this.readEnvFileValue(candidate, key);
			if (value) {
				return value;
			}
		}

		return undefined;
	}

	private getRuntimeEnvCandidateFiles(): readonly string[] {
		const homeDir = process.env.HOME;
		const runtimeDataDir = this.getRuntimeDataDir();
		return [
			path.join(runtimeDataDir, 'server.env'),
			path.join(runtimeDataDir, '.env'),
			path.join(this.omniRouteRoot, '.env'),
			this.workspaceRoot ? path.join(this.workspaceRoot, 'OmniRoute-main', '.env') : undefined,
			path.join(this.repoRoot, 'OmniRoute-main', '.env'),
			homeDir ? path.join(homeDir, '.omniroute', 'server.env') : undefined,
			homeDir ? path.join(homeDir, '.omniroute', '.env') : undefined,
		].filter((candidate): candidate is string => typeof candidate === 'string');
	}

	private readEnvFileValue(filePath: string, key: string): string | undefined {
		if (!fs.existsSync(filePath)) {
			return undefined;
		}

		const pattern = new RegExp(`^${key}=(.*)$`, 'm');
		const match = fs.readFileSync(filePath, 'utf8').match(pattern);
		if (!match) {
			return undefined;
		}

		const rawValue = match[1].trim();
		if (!rawValue) {
			return undefined;
		}

		return rawValue.replace(/^['"]|['"]$/g, '');
	}

	private getRuntimeDataDir(): string {
		return path.join(this.context.globalStorageUri.fsPath, 'runtime-data');
	}

	private createEmptySectionData(): OmniProxySectionData {
		return {
			endpoints: {
				items: []
			},
			apiManager: { keys: [], aliases: [] },
			providers: { connections: [], nodes: [], metrics: [] },
			combos: { items: [], mappings: [], metrics: [] },
			batchTesting: { batches: [], files: [] },
			costs: { byProvider: [], byModel: [] },
			analytics: { providerMetrics: [] },
			cache: {},
			limits: { quotas: [], sessions: [] },
			media: { memories: [], files: [] }
		};
	}

	private async fetchSectionData(state: OverviewState, section: OmniProxyDashboardSectionId | undefined): Promise<OmniProxySectionData> {
		const sections = this.createEmptySectionData();
		if (!state.authUnlocked) {
			return sections;
		}

		switch (section) {
			case undefined:
			case 'home':
				return sections;
			case 'providers': {
				const [nodesResult, providerMetricsResult, tokenHealthResult] = await Promise.allSettled([
					this.requestData<{ readonly nodes?: readonly OmniProxyProviderNodeItem[] }>('/api/provider-nodes', 8000),
					this.requestData<{ readonly metrics?: Record<string, OmniProxyProviderMetricItem> }>('/api/provider-metrics', 8000),
					this.requestData<OmniProxyTokenHealth>('/api/token-health', 8000)
				]);
				return {
					...sections,
					providers: {
					connections: state.connections.map(connection => ({
						id: connection.id,
						provider: connection.provider,
						name: connection.name,
						email: connection.email,
						displayName: connection.displayName,
						authType: connection.authType,
						isActive: connection.isActive,
						defaultModel: connection.defaultModel,
						testStatus: connection.testStatus,
						lastError: connection.lastError,
						lastTested: connection.lastTested,
						rateLimitProtection: (connection as ProviderConnection & { readonly rateLimitProtection?: boolean }).rateLimitProtection
					})),
					nodes: this.getSettledValue(nodesResult)?.nodes ?? [],
					metrics: this.toProviderMetricItems(this.getSettledValue(providerMetricsResult)),
					tokenHealth: this.getSettledValue(tokenHealthResult)
					}
				};
			}
			case 'combos': {
				const [combosResult, mappingsResult, comboMetricsResult] = await Promise.allSettled([
					this.requestData<{ readonly combos?: readonly OmniProxyComboItem[] }>('/api/combos', 8000),
					this.requestData<{ readonly mappings?: readonly OmniProxyComboMappingItem[] }>('/api/model-combo-mappings', 8000),
					this.requestData<{ readonly metrics?: Record<string, JsonObject> }>('/api/combos/metrics', 8000)
				]);
				return {
					...sections,
					combos: {
						items: this.getSettledValue(combosResult)?.combos ?? [],
						mappings: this.getSettledValue(mappingsResult)?.mappings ?? [],
						metrics: this.toComboMetricItems(this.getSettledValue(comboMetricsResult))
					}
				};
			}
			case 'batchTesting': {
				const [batchesResult, filesResult] = await Promise.allSettled([
					this.requestData<{ readonly batches?: readonly OmniProxyBatchItem[] }>('/api/batches?limit=20', 8000),
					this.requestData<{ readonly files?: readonly OmniProxyFileItem[] }>('/api/files?limit=20', 8000)
				]);
				return {
					...sections,
					batchTesting: {
						batches: this.getSettledValue(batchesResult)?.batches ?? [],
						files: this.getSettledValue(filesResult)?.files ?? []
					}
				};
			}
			case 'costs': {
				const costsResult = await this.requestData<{
					readonly summary?: OmniProxyUsageAnalyticsSummary;
					readonly byProvider?: readonly { readonly provider: string; readonly requests: number; readonly totalTokens: number; readonly cost: number }[];
					readonly byModel?: readonly { readonly model: string; readonly requests: number; readonly totalTokens: number; readonly cost: number }[];
				}>('/api/usage/analytics?range=30d&presets=1d,7d,30d', 8000);
				return {
					...sections,
					costs: {
						summary: costsResult?.summary,
						byProvider: (costsResult?.byProvider ?? []).map(item => ({
							label: item.provider,
							requests: item.requests,
							totalTokens: item.totalTokens,
							cost: item.cost
						})),
						byModel: (costsResult?.byModel ?? []).map(item => ({
							label: item.model,
							requests: item.requests,
							totalTokens: item.totalTokens,
							cost: item.cost
						}))
					}
				};
			}
			case 'analytics': {
				const [providerMetricsResult, tokenHealthResult, compressionResult] = await Promise.allSettled([
					this.requestData<{ readonly metrics?: Record<string, OmniProxyProviderMetricItem> }>('/api/provider-metrics', 8000),
					this.requestData<OmniProxyTokenHealth>('/api/token-health', 8000),
					this.requestData<JsonObject>('/api/analytics/compression?since=7d', 8000)
				]);
				return {
					...sections,
					analytics: {
						providerMetrics: this.toProviderMetricItems(this.getSettledValue(providerMetricsResult)),
						tokenHealth: this.getSettledValue(tokenHealthResult),
						compression: this.getSettledValue(compressionResult)
					}
				};
			}
			case 'cache': {
				const [cacheResult, cacheMetricsResult, cacheConfigResult] = await Promise.allSettled([
					this.requestData<JsonObject>('/api/cache?trendHours=24', 8000),
					this.requestData<JsonObject>('/api/settings/cache-metrics', 8000),
					this.requestData<JsonObject>('/api/settings/cache-config', 8000)
				]);
				return {
					...sections,
					cache: {
						stats: this.getSettledValue(cacheResult),
						metrics: this.getSettledValue(cacheMetricsResult),
						config: this.getSettledValue(cacheConfigResult)
					}
				};
			}
			case 'limits': {
				const [quotaResult, rateLimitsResult, sessionsResult] = await Promise.allSettled([
					this.requestData<{ readonly providers?: readonly OmniProxyQuotaItem[] }>('/api/usage/quota', 8000),
					this.requestData<{
						readonly connections?: readonly OmniProxyRateLimitConnectionItem[];
						readonly lockouts?: readonly JsonObject[];
						readonly cacheStats?: JsonObject;
						readonly overview?: JsonObject;
					}>('/api/rate-limits', 8000),
					this.requestData<{ readonly sessions?: readonly OmniProxySessionItem[] }>('/api/sessions', 8000)
				]);
				return {
					...sections,
					limits: {
						quotas: this.getSettledValue(quotaResult)?.providers ?? [],
						rateLimits: {
							connections: this.getSettledValue(rateLimitsResult)?.connections ?? [],
							lockouts: this.getSettledValue(rateLimitsResult)?.lockouts ?? [],
							cacheStats: this.getSettledValue(rateLimitsResult)?.cacheStats,
							overview: this.getSettledValue(rateLimitsResult)?.overview
						},
						sessions: this.getSettledValue(sessionsResult)?.sessions ?? []
					}
				};
			}
			case 'media': {
				const [filesResult, memorySettingsResult, memoryHealthResult, memoriesResult] = await Promise.allSettled([
					this.requestData<{ readonly files?: readonly OmniProxyFileItem[] }>('/api/files?limit=20', 8000),
					this.requestData<JsonObject>('/api/settings/memory', 8000),
					this.requestData<JsonObject>('/api/memory/health', 8000),
					this.requestData<{ readonly data?: readonly OmniProxyMemoryItem[] }>('/api/memory?limit=20', 8000)
				]);
				return {
					...sections,
					media: {
						memorySettings: this.getSettledValue(memorySettingsResult),
						memoryHealth: this.getSettledValue(memoryHealthResult),
						memories: this.getSettledValue(memoriesResult)?.data ?? [],
						files: this.getSettledValue(filesResult)?.files ?? []
					}
				};
			}
		}
	}

	private async requestData<T>(routePath: string, timeoutMs = 30000): Promise<T | undefined> {
		try {
			const response = await this.requestJson<T>(routePath, 'GET', undefined, undefined, false, timeoutMs);
			return response.data;
		} catch (error) {
			this.outputChannel.appendLine(`[${OMNIPROXY_BRAND_NAME}] data request failed for ${routePath}: ${error instanceof Error ? error.message : String(error)}`);
			return undefined;
		}
	}

	private getSettledValue<T>(result: PromiseSettledResult<T | undefined>): T | undefined {
		return result.status === 'fulfilled' ? result.value : undefined;
	}

	private toProviderMetricItems(result: { readonly metrics?: Record<string, OmniProxyProviderMetricItem> } | undefined): readonly OmniProxyProviderMetricItem[] {
		const metrics = result?.metrics ?? {};
		return Object.entries(metrics).map(([provider, item]) => ({
			provider,
			totalRequests: item.totalRequests ?? 0,
			totalSuccesses: item.totalSuccesses ?? 0,
			successRate: item.successRate ?? 0,
			avgLatencyMs: item.avgLatencyMs ?? 0
		})).sort((left, right) => right.totalRequests - left.totalRequests);
	}

	private toComboMetricItems(result: { readonly metrics?: Record<string, JsonObject> } | undefined): readonly OmniProxyComboMetricItem[] {
		const metrics = result?.metrics ?? {};
		return Object.entries(metrics).map(([comboName, value]) => ({
			comboName,
			requests: typeof value.requests === 'number' ? value.requests : 0,
			successRate: typeof value.successRate === 'number' ? value.successRate : 0,
			avgLatencyMs: typeof value.avgLatencyMs === 'number' ? value.avgLatencyMs : 0
		})).sort((left, right) => right.requests - left.requests);
	}

	private async getDashboardData(section?: OmniProxyDashboardSectionId): Promise<OmniProxyDashboardData> {
		const state = this.currentState ?? await this.refreshState();
		const catalog = await this.getProviderCatalog();
		const sections = await this.fetchSectionData(state, section);
		const providerSummaries = catalog.map(provider => {
			const connections = state.connections.filter(connection => connection.provider === provider.id);
			const labels = connections.map(connection => this.getConnectionLabel(connection)).filter((value, index, array) => !!value && array.indexOf(value) === index);
			return {
				id: provider.id,
				name: provider.name,
				color: provider.color,
				category: provider.category,
				authHint: provider.authHint,
				apiHint: provider.apiHint,
				website: provider.website,
				deprecated: provider.deprecated,
				deprecationReason: provider.deprecationReason,
				connectionCount: connections.length,
				isConnected: connections.some(connection => connection.isActive !== false),
				connectionLabels: labels,
				lastError: connections.find(connection => !!connection.lastError)?.lastError
			} satisfies OmniProxyDashboardProvider;
		});

		return {
			brandName: OMNIPROXY_BRAND_NAME,
			runtime: {
				baseUrl: this.getBaseUrl().toString(),
				nodePath: this.getNodePath(),
				npmPath: this.getNpmPath(),
				autoStart: state.autoStart,
				dependenciesInstalled: state.dependenciesInstalled,
				serverRunning: state.serverRunning,
				authUnlocked: state.authUnlocked,
				hasAccessKey: state.hasAccessKey,
				nodeVersion: state.nodeVersion,
				nodeCompatible: state.nodeCompatible,
				lastSync: state.lastSync
			},
			stats: {
				totalConnections: state.totalConnections,
				totalProviders: state.totalProviders,
				modelCount: state.modelCount,
				proxyCount: state.proxyCount
			},
			usage: state.usage,
			providers: providerSummaries,
			proxies: state.proxies,
			globalProxyName: state.globalProxyName,
			sections
		};
	}

	private getConnectionLabel(connection: ProviderConnection): string {
		return connection.displayName || connection.name || connection.email || connection.provider;
	}

	private getEmbeddedNodePath(): string | undefined {
		if (typeof process.versions?.electron === 'string' && fs.existsSync(process.execPath)) {
			return process.execPath;
		}

		const appBinary = path.join(this.repoRoot, '.build', 'electron', 'Code - OSS.app', 'Contents', 'MacOS', 'Code - OSS');
		return fs.existsSync(appBinary) ? appBinary : undefined;
	}

	private getCodexRuntimeNodePath(): string | undefined {
		const homeDir = process.env.HOME;
		if (!homeDir) {
			return undefined;
		}

		const candidate = path.join(homeDir, '.cache', 'codex-runtimes', 'codex-primary-runtime', 'dependencies', 'node', 'bin', 'node');
		return fs.existsSync(candidate) ? candidate : undefined;
	}

	private ensureEmbeddedNodeShim(embeddedNodePath: string): string {
		const shimDir = path.join(this.context.globalStorageUri.fsPath, 'runtime-shims');
		const shimPath = process.platform === 'win32'
			? path.join(shimDir, 'node.cmd')
			: path.join(shimDir, 'node');

		fs.mkdirSync(shimDir, { recursive: true });
		const shimContents = process.platform === 'win32'
			? `@echo off\r\nset ELECTRON_RUN_AS_NODE=1\r\n"${embeddedNodePath}" %*\r\n`
			: `#!/bin/sh\nexport ELECTRON_RUN_AS_NODE=1\nexec "${embeddedNodePath}" "$@"\n`;

		if (!fs.existsSync(shimPath) || fs.readFileSync(shimPath, 'utf8') !== shimContents) {
			fs.writeFileSync(shimPath, shimContents, 'utf8');
			if (process.platform !== 'win32') {
				fs.chmodSync(shimPath, 0o755);
			}
		}

		return shimPath;
	}

	private async ensureServer(options: { readonly silent: boolean }): Promise<boolean> {
		if (await this.isServerReachable()) {
			return true;
		}

		await this.recoverStalePortListener();

		const autoStart = vscode.workspace.getConfiguration('omniroute').get<boolean>('autoStart', true);
		if (!autoStart && options.silent) {
			return false;
		}
		if (!this.dependenciesInstalled()) {
			return false;
		}
		if (this.childProcess) {
			return this.waitForServer();
		}

		await this.recoverStaleNextDevServer();
		await this.ensureNativeModuleCompatibility();
		const runtimeSecretOverrides = this.resolveRuntimeSecretOverrides();
		fs.mkdirSync(this.getRuntimeDataDir(), { recursive: true });
		if (runtimeSecretOverrides.STORAGE_ENCRYPTION_KEY) {
			this.outputChannel.appendLine(`[${OMNIPROXY_BRAND_NAME}] reusing existing storage encryption key for embedded runtime`);
		}

		const env = {
			...process.env,
			...runtimeSecretOverrides,
			PATH: `${path.dirname(this.getNodePath())}${path.delimiter}${process.env.PATH ?? ''}`,
			HOST: this.getBaseUrl().hostname,
			PORT: this.getBaseUrl().port,
			BASE_URL: this.getBaseUrl().toString(),
			NEXT_PUBLIC_BASE_URL: this.getBaseUrl().toString(),
		};

		this.outputChannel.appendLine(`[${OMNIPROXY_BRAND_NAME}] starting local server`);
		this.childProcess = spawn(this.getNpmPath(), ['run', 'dev'], {
			cwd: this.omniRouteRoot,
			env,
			stdio: 'pipe'
		});
		this.startedChild = true;

		this.childProcess.stdout.on('data', chunk => {
			this.outputChannel.append(chunk.toString());
		});
		this.childProcess.stderr.on('data', chunk => {
			this.outputChannel.append(chunk.toString());
		});
		this.childProcess.on('exit', code => {
			this.outputChannel.appendLine(`[${OMNIPROXY_BRAND_NAME}] exited with code ${code ?? -1}`);
			this.childProcess = undefined;
			this.startedChild = false;
			this.treeEmitter.fire(undefined);
		});

		return this.waitForServer();
	}

	private async waitForServer(): Promise<boolean> {
		for (let attempt = 0; attempt < 60; attempt++) {
			if (await this.isServerReachable()) {
				return true;
			}
			await new Promise(resolve => setTimeout(resolve, 1000));
		}
		return false;
	}

	private async ensureNativeModuleCompatibility(options?: { readonly forceRebuild?: boolean }): Promise<void> {
		if (!this.dependenciesInstalled()) {
			return;
		}

		if (!options?.forceRebuild && await this.canLoadBetterSqlite()) {
			return;
		}

		this.outputChannel.appendLine(`[${OMNIPROXY_BRAND_NAME}] rebuilding better-sqlite3 for ${this.getNodePath()}`);
		await this.runNpmCommand(['rebuild', 'better-sqlite3']);

		if (!await this.canLoadBetterSqlite()) {
			throw new Error(`Failed to rebuild better-sqlite3 for ${OMNIPROXY_BRAND_NAME}.`);
		}
	}

	private async canLoadBetterSqlite(): Promise<boolean> {
		const exitCode = await this.runNodeCommand(['-e', 'require("better-sqlite3");'], { logOutput: false });
		return exitCode === 0;
	}

	private async runNodeCommand(args: readonly string[], options?: { readonly logOutput?: boolean }): Promise<number> {
		return new Promise<number>(resolve => {
			const processHandle = spawn(this.getNodePath(), args, {
				cwd: this.omniRouteRoot,
				env: {
					...process.env,
					...this.resolveRuntimeSecretOverrides(),
					PATH: `${path.dirname(this.getNodePath())}${path.delimiter}${process.env.PATH ?? ''}`
				},
				stdio: 'pipe'
			});

			const logOutput = options?.logOutput !== false;
			processHandle.stdout.on('data', chunk => {
				if (logOutput) {
					this.outputChannel.append(chunk.toString());
				}
			});
			processHandle.stderr.on('data', chunk => {
				if (logOutput) {
					this.outputChannel.append(chunk.toString());
				}
			});
			processHandle.on('error', error => {
				if (logOutput) {
					this.outputChannel.appendLine(`[${OMNIPROXY_BRAND_NAME}] ${error instanceof Error ? error.message : String(error)}`);
				}
				resolve(-1);
			});
			processHandle.on('exit', code => {
				resolve(code ?? -1);
			});
		});
	}

	private async isServerReachable(): Promise<boolean> {
		try {
			await this.requestJson('/api/auth/status', 'GET', undefined, undefined, false);
			return true;
		} catch {
			return false;
		}
	}

	private async recoverStaleNextDevServer(): Promise<void> {
		const lock = await this.readNextDevLock();
		if (!lock?.pid || lock.port !== Number(this.getBaseUrl().port)) {
			return;
		}

		if (!this.isProcessAlive(lock.pid)) {
			return;
		}

		this.outputChannel.appendLine(`[${OMNIPROXY_BRAND_NAME}] found unresponsive Next dev server ${lock.pid} on port ${lock.port}; restarting it`);
		await this.terminateProcess(lock.pid);
		await this.removeNextDevLock();
	}

	private async recoverStalePortListener(): Promise<void> {
		const info = this.findListeningProcessInfo(Number(this.getBaseUrl().port));
		if (!info?.pid) {
			return;
		}

		const command = info.command ?? '';
		const cwd = info.cwd ?? '';
		const looksLikeOmniRuntime = /run-next\.mjs|npm run dev/.test(command) || /OmniRoute-main|omniroute-runtime/.test(cwd);
		if (!looksLikeOmniRuntime) {
			return;
		}

		this.outputChannel.appendLine(`[${OMNIPROXY_BRAND_NAME}] reclaiming port ${this.getBaseUrl().port} from stale runtime pid ${info.pid}${cwd ? ` (${cwd})` : ''}`);
		await this.terminateProcess(info.pid);
		if (info.ppid && info.ppid !== info.pid) {
			await this.terminateProcess(info.ppid);
		}
		await this.removeNextDevLock();
	}

	private async readNextDevLock(): Promise<NextDevLockFile | undefined> {
		const lockPath = path.join(this.omniRouteRoot, '.next', 'dev', 'lock');
		try {
			const raw = await fs.promises.readFile(lockPath, 'utf8');
			const parsed = JSON.parse(raw) as NextDevLockFile;
			return parsed;
		} catch {
			return undefined;
		}
	}

	private async removeNextDevLock(): Promise<void> {
		const lockPath = path.join(this.omniRouteRoot, '.next', 'dev', 'lock');
		try {
			await fs.promises.unlink(lockPath);
		} catch {
			// Ignore missing lock files. Next will recreate this on a clean boot.
		}
	}

	private findListeningProcessInfo(port: number): ListeningProcessInfo | undefined {
		if (process.platform === 'win32') {
			return undefined;
		}

		try {
			const pidOutput = execFileSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-Fp'], { encoding: 'utf8' }).trim();
			const pid = Number.parseInt(pidOutput.split('\n').find(line => line.startsWith('p'))?.slice(1) ?? '', 10);
			if (!Number.isFinite(pid) || pid <= 0) {
				return undefined;
			}

			const cwdOutput = execFileSync('lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-Fn'], { encoding: 'utf8' }).trim();
			const cwd = cwdOutput.split('\n').find(line => line.startsWith('n'))?.slice(1);
			const command = execFileSync('ps', ['-p', String(pid), '-o', 'command='], { encoding: 'utf8' }).trim() || undefined;
			const ppidRaw = execFileSync('ps', ['-p', String(pid), '-o', 'ppid='], { encoding: 'utf8' }).trim();
			const ppid = Number.parseInt(ppidRaw, 10);

			return {
				pid,
				ppid: Number.isFinite(ppid) && ppid > 0 ? ppid : undefined,
				command,
				cwd: cwd?.trim() || undefined
			};
		} catch {
			return undefined;
		}
	}

	private isProcessAlive(pid: number): boolean {
		try {
			process.kill(pid, 0);
			return true;
		} catch {
			return false;
		}
	}

	private async terminateProcess(pid: number): Promise<void> {
		try {
			process.kill(pid, 'SIGTERM');
		} catch {
			return;
		}

		for (let attempt = 0; attempt < 20; attempt++) {
			if (!this.isProcessAlive(pid)) {
				return;
			}
			await new Promise(resolve => setTimeout(resolve, 250));
		}

		try {
			process.kill(pid, 'SIGKILL');
		} catch {
			return;
		}

		for (let attempt = 0; attempt < 20; attempt++) {
			if (!this.isProcessAlive(pid)) {
				return;
			}
			await new Promise(resolve => setTimeout(resolve, 250));
		}
	}

	private async runNpmCommand(args: readonly string[]): Promise<void> {
		await new Promise<void>((resolve, reject) => {
			const processHandle = spawn(this.getNpmPath(), args, {
				cwd: this.omniRouteRoot,
				env: {
					...process.env,
					PATH: `${path.dirname(this.getNodePath())}${path.delimiter}${process.env.PATH ?? ''}`
				},
				stdio: 'pipe'
			});

			processHandle.stdout.on('data', chunk => {
				this.outputChannel.append(chunk.toString());
			});
			processHandle.stderr.on('data', chunk => {
				this.outputChannel.append(chunk.toString());
			});
			processHandle.on('error', reject);
			processHandle.on('exit', code => {
				if (code === 0) {
					resolve();
					return;
				}
				reject(new Error(`npm ${args.join(' ')} exited with code ${code ?? -1}`));
			});
		});
	}

	private async requestJson<T>(routePath: string, method: string, body: JsonValue | undefined, bearerToken?: string, _allowSetCookie = false, timeoutMs = 30000): Promise<HttpResponse<T>> {
		const url = new URL(routePath, this.getBaseUrl().toString());
		const isHttps = url.protocol === 'https:';
		const requestModule = isHttps ? https : http;
		const payload = body === undefined ? undefined : JSON.stringify(body);

		const headers: http.OutgoingHttpHeaders = {
			Accept: 'application/json'
		};
		if (payload !== undefined) {
			headers['Content-Type'] = 'application/json';
			headers['Content-Length'] = Buffer.byteLength(payload);
		}
		if (bearerToken) {
			headers.Authorization = `Bearer ${bearerToken}`;
		}

		return new Promise<HttpResponse<T>>((resolve, reject) => {
			const request = requestModule.request(url, { method, headers }, response => {
				const chunks: Buffer[] = [];
				response.on('data', chunk => {
					chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
				});
				response.on('end', () => {
					const text = Buffer.concat(chunks).toString('utf8');
					let data: T;
					try {
						data = text.length ? JSON.parse(text) as T : {} as T;
					} catch (error) {
						reject(new Error(`Failed to parse JSON from ${routePath}: ${String(error)}`));
						return;
					}
					if ((response.statusCode ?? 500) >= 400) {
						const message = this.extractErrorMessage(data);
						reject(new Error(message));
						return;
					}
					resolve({
						statusCode: response.statusCode ?? 200,
						headers: response.headers,
						data
					});
				});
			});

			request.on('error', reject);
			request.setTimeout(timeoutMs, () => {
				request.destroy(new Error(`Request timed out for ${routePath}`));
			});
			if (payload !== undefined) {
				request.write(payload);
			}
			request.end();
		});
	}

	private extractErrorMessage(value: unknown): string {
		if (!this.isJsonObject(value)) {
			return `${OMNIPROXY_BRAND_NAME} request failed.`;
		}
		const error = value.error;
		if (typeof error === 'string') {
			return error;
		}
		if (this.isJsonObject(error) && typeof error.message === 'string') {
			return error.message;
		}
		return `${OMNIPROXY_BRAND_NAME} request failed.`;
	}

	private isInvalidApiKeyError(error: unknown): boolean {
		return error instanceof Error && /invalid api key/i.test(error.message);
	}

	private isJsonObject(value: JsonValue | ProviderConnection | UsageStats | ProxyItem | ProxyAssignment | ModelDescriptor | RequireLoginStatus | unknown): value is JsonObject {
		return typeof value === 'object' && value !== null && !Array.isArray(value);
	}

	private async withProgress<T>(title: string, task: () => Promise<T>): Promise<T> {
		return vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			title
		}, async () => task());
	}
}
