/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/omniProxyManagementEditor.css';
import * as DOM from '../../../../../base/browser/dom.js';
import { Dimension } from '../../../../../base/browser/dom.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { getErrorMessage } from '../../../../../base/common/errors.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize } from '../../../../../nls.js';
import { IContextKey, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IEditorOptions } from '../../../../../platform/editor/common/editor.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { EditorPane } from '../../../../browser/parts/editor/editorPane.js';
import { IEditorOpenContext } from '../../../../common/editor.js';
import { IEditorGroup } from '../../../../services/editor/common/editorGroupsService.js';
import { OmniProxyManagementEditorInput } from './omniProxyManagementEditorInput.js';
import { CONTEXT_OMNI_PROXY_MANAGEMENT_EDITOR, OMNI_PROXY_MANAGEMENT_EDITOR_ID, OMNI_PROXY_SELECTED_SECTION_STORAGE_KEY, OmniProxyManagementSection } from './omniProxyManagement.js';

const $ = DOM.$;

type ProviderCategory =
	| 'free'
	| 'oauth'
	| 'web-cookie'
	| 'apikey'
	| 'local'
	| 'search'
	| 'audio'
	| 'upstream-proxy';

interface UsageStats {
	readonly totalRequests: number;
	readonly totalPromptTokens: number;
	readonly totalCompletionTokens: number;
	readonly totalCost: number;
}

interface ProxyItem {
	readonly id: string;
	readonly name: string;
	readonly type: string;
	readonly host: string;
	readonly port: number;
	readonly status?: string;
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
		readonly compression?: Record<string, unknown>;
	};
	readonly cache: {
		readonly stats?: Record<string, unknown>;
		readonly metrics?: Record<string, unknown>;
		readonly config?: Record<string, unknown>;
	};
	readonly limits: {
		readonly quotas: readonly OmniProxyQuotaItem[];
		readonly rateLimits?: OmniProxyRateLimitsSummary;
		readonly sessions: readonly OmniProxySessionItem[];
	};
	readonly media: {
		readonly memorySettings?: Record<string, unknown>;
		readonly memoryHealth?: Record<string, unknown>;
		readonly memories: readonly OmniProxyMemoryItem[];
		readonly files: readonly OmniProxyFileItem[];
	};
}

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
	readonly lockouts: readonly Record<string, unknown>[];
	readonly cacheStats?: Record<string, unknown>;
	readonly overview?: Record<string, unknown>;
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

interface OmniProxySectionItem {
	readonly id: OmniProxyManagementSection;
	readonly label: string;
	readonly description: string;
	readonly icon: ThemeIcon;
}

const SECTION_ITEMS: readonly OmniProxySectionItem[] = [
	{ id: OmniProxyManagementSection.Home, label: localize('omniProxy.section.home', 'Home'), description: localize('omniProxy.section.home.description', 'Overview of the local OmniProxy runtime, usage, and model sync status.'), icon: Codicon.home },
	{ id: OmniProxyManagementSection.Providers, label: localize('omniProxy.section.providers', 'Providers'), description: localize('omniProxy.section.providers.description', 'Connect and manage OmniProxy provider accounts.'), icon: Codicon.serverEnvironment },
	{ id: OmniProxyManagementSection.Combos, label: localize('omniProxy.section.combos', 'Combos'), description: localize('omniProxy.section.combos.description', 'Multi-account routing and provider mix strategy.'), icon: Codicon.layers },
	{ id: OmniProxyManagementSection.BatchTesting, label: localize('omniProxy.section.batchTesting', 'Batch Testing'), description: localize('omniProxy.section.batchTesting.description', 'Quick validation for providers, proxies, and model availability.'), icon: Codicon.beaker },
	{ id: OmniProxyManagementSection.Costs, label: localize('omniProxy.section.costs', 'Costs'), description: localize('omniProxy.section.costs.description', 'Requests, token usage, and cost totals.'), icon: Codicon.creditCard },
	{ id: OmniProxyManagementSection.Analytics, label: localize('omniProxy.section.analytics', 'Analytics'), description: localize('omniProxy.section.analytics.description', 'Provider-level usage and health indicators.'), icon: Codicon.graph },
	{ id: OmniProxyManagementSection.Cache, label: localize('omniProxy.section.cache', 'Cache'), description: localize('omniProxy.section.cache.description', 'Model cache, connection cache, and runtime readiness.'), icon: Codicon.sync },
	{ id: OmniProxyManagementSection.Limits, label: localize('omniProxy.section.limits', 'Limits & Quotas'), description: localize('omniProxy.section.limits.description', 'Context limits, output limits, and request headroom.'), icon: Codicon.listSelection },
	{ id: OmniProxyManagementSection.Media, label: localize('omniProxy.section.media', 'Media'), description: localize('omniProxy.section.media.description', 'Vision-capable models and related media support.'), icon: Codicon.deviceCameraVideo },
];

const PROVIDER_GROUPS: readonly { readonly id: string; readonly label: string; readonly categories: readonly ProviderCategory[] }[] = [
	{ id: 'oauth', label: localize('omniProxy.providers.oauthGroup', 'OAuth Providers'), categories: ['oauth', 'free', 'web-cookie'] },
	{ id: 'apikey', label: localize('omniProxy.providers.apiKeyGroup', 'API Key Providers'), categories: ['apikey', 'upstream-proxy'] },
	{ id: 'other', label: localize('omniProxy.providers.otherGroup', 'Other Providers'), categories: ['local', 'search', 'audio'] },
];

export class OmniProxyManagementEditor extends EditorPane {

	static readonly ID = OMNI_PROXY_MANAGEMENT_EDITOR_ID;

	private readonly editorDisposables = this._register(new DisposableStore());
	private readonly inOmniProxyEditorContextKey: IContextKey<boolean>;

	private dimension: Dimension | undefined;
	private bodyContainer: HTMLElement | undefined;
	private sidebarContainer: HTMLElement | undefined;
	private contentContainer: HTMLElement | undefined;
	private selectedSection: OmniProxyManagementSection;
	private dashboardData: OmniProxyDashboardData | undefined;
	private errorMessage: string | undefined;
	private isLoading = false;
	private providerSearchValue = '';
	private configuredOnly = false;

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService private readonly storageService: IStorageService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ICommandService private readonly commandService: ICommandService,
	) {
		super(OmniProxyManagementEditor.ID, group, telemetryService, themeService, storageService);
		this.inOmniProxyEditorContextKey = CONTEXT_OMNI_PROXY_MANAGEMENT_EDITOR.bindTo(contextKeyService);
		this.selectedSection = this.restoreSelectedSection(storageService);
	}

	protected override createEditor(parent: HTMLElement): void {
		this.bodyContainer = DOM.append(parent, $('.omni-proxy-management-editor'));
		this.sidebarContainer = DOM.append(this.bodyContainer, $('.omni-proxy-management-editor-sidebar'));
		this.contentContainer = DOM.append(this.bodyContainer, $('.omni-proxy-management-editor-content'));
		this.render();
	}

	override async setInput(input: OmniProxyManagementEditorInput, options: IEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		this.inOmniProxyEditorContextKey.set(true);
		await super.setInput(input, options, context, token);
		await this.refreshDashboard();
		if (this.dimension) {
			this.layout(this.dimension);
		}
	}

	override layout(dimension: Dimension): void {
		this.dimension = dimension;
	}

	override focus(): void {
		super.focus();
		this.sidebarContainer?.querySelector<HTMLElement>('.omni-proxy-sidebar-item.active')?.focus();
	}

	override clearInput(): void {
		this.inOmniProxyEditorContextKey.set(false);
		super.clearInput();
	}

	async refreshDashboard(): Promise<void> {
		this.isLoading = true;
		this.errorMessage = undefined;
		this.render();
		try {
			this.dashboardData = await this.commandService.executeCommand<OmniProxyDashboardData>('omniroute.getDashboardData');
		} catch (error) {
			this.dashboardData = undefined;
			this.errorMessage = getErrorMessage(error);
		} finally {
			this.isLoading = false;
			this.render();
		}
	}

	private restoreSelectedSection(storageService: IStorageService): OmniProxyManagementSection {
		const stored = storageService.get(OMNI_PROXY_SELECTED_SECTION_STORAGE_KEY, StorageScope.APPLICATION, OmniProxyManagementSection.Providers);
		return SECTION_ITEMS.some(item => item.id === stored) ? stored as OmniProxyManagementSection : OmniProxyManagementSection.Providers;
	}

	private storeSelectedSection(section: OmniProxyManagementSection): void {
		this.selectedSection = section;
		this.storageService.store(OMNI_PROXY_SELECTED_SECTION_STORAGE_KEY, section, StorageScope.APPLICATION, StorageTarget.USER);
		this.render();
	}

	private render(): void {
		if (!this.sidebarContainer || !this.contentContainer) {
			return;
		}

		this.editorDisposables.clear();
		DOM.clearNode(this.sidebarContainer);
		DOM.clearNode(this.contentContainer);

		this.renderSidebar();
		this.renderContent();
	}

	private renderSidebar(): void {
		if (!this.sidebarContainer) {
			return;
		}

		const brand = DOM.append(this.sidebarContainer, $('.omni-proxy-sidebar-brand'));
		DOM.append(brand, $('div.omni-proxy-sidebar-brand-label', {}, this.dashboardData?.brandName ?? localize('omniProxy.brand.default', 'OmniProxy')));
		DOM.append(brand, $('div.omni-proxy-sidebar-brand-description', {}, localize('omniProxy.brand.description', 'Local provider routing and model control')));

		const nav = DOM.append(this.sidebarContainer, $('.omni-proxy-sidebar-nav'));
		for (const section of SECTION_ITEMS) {
			const button = DOM.append(nav, $('button.omni-proxy-sidebar-item', {
				type: 'button',
				'aria-label': section.label,
				title: section.description,
			}));
			if (section.id === this.selectedSection) {
				button.classList.add('active');
			}
			DOM.append(button, $('span.omni-proxy-sidebar-item-icon'));
			button.firstElementChild?.classList.add(...ThemeIcon.asClassNameArray(section.icon));
			DOM.append(button, $('span.omni-proxy-sidebar-item-label', {}, section.label));
			this.editorDisposables.add(DOM.addDisposableListener(button, DOM.EventType.CLICK, () => this.storeSelectedSection(section.id)));
		}
	}

	private renderContent(): void {
		if (!this.contentContainer) {
			return;
		}

		if (this.isLoading) {
			this.renderHeader(localize('omniProxy.loading.title', 'Loading OmniProxy'), localize('omniProxy.loading.description', 'Refreshing local runtime, providers, and model sync status.'));
			this.renderEmptyState(this.contentContainer, Codicon.loading, localize('omniProxy.loading.empty', 'Loading OmniProxy dashboard…'));
			return;
		}

		if (this.errorMessage) {
			this.renderHeader(localize('omniProxy.error.title', 'OmniProxy'), localize('omniProxy.error.description', 'The native dashboard could not load OmniProxy state.'));
			this.renderErrorState(this.errorMessage);
			return;
		}

		const data = this.dashboardData;
		if (!data) {
			this.renderHeader(localize('omniProxy.unavailable.title', 'OmniProxy'), localize('omniProxy.unavailable.description', 'The OmniProxy extension has not returned dashboard data yet.'));
			this.renderEmptyState(this.contentContainer, Codicon.info, localize('omniProxy.unavailable.empty', 'Open OmniProxy again after the extension finishes activating.'));
			return;
		}

		switch (this.selectedSection) {
			case OmniProxyManagementSection.Home:
				this.renderHomeSection(data);
				break;
			case OmniProxyManagementSection.Providers:
				this.renderProvidersSection(data);
				break;
			case OmniProxyManagementSection.Combos:
				this.renderCombosSection(data);
				break;
			case OmniProxyManagementSection.BatchTesting:
				this.renderBatchTestingSection(data);
				break;
			case OmniProxyManagementSection.Costs:
				this.renderCostsSection(data);
				break;
			case OmniProxyManagementSection.Analytics:
				this.renderAnalyticsSection(data);
				break;
			case OmniProxyManagementSection.Cache:
				this.renderCacheSection(data);
				break;
			case OmniProxyManagementSection.Limits:
				this.renderLimitsSection(data);
				break;
			case OmniProxyManagementSection.Media:
				this.renderMediaSection(data);
				break;
		}
	}

	private renderHeader(title: string, description: string): HTMLElement {
		const header = DOM.append(this.contentContainer!, $('.omni-proxy-header'));
		const heading = DOM.append(header, $('.omni-proxy-header-copy'));
		DOM.append(heading, $('h1.omni-proxy-title', {}, title));
		DOM.append(heading, $('p.omni-proxy-subtitle', {}, description));
		const actions = DOM.append(header, $('.omni-proxy-header-actions'));
		this.appendCommandButton(actions, localize('omniProxy.action.refresh', 'Refresh'), Codicon.refresh, 'omniroute.refresh', undefined, true);
		this.appendCommandButton(actions, localize('omniProxy.action.syncModels', 'Sync Models'), Codicon.sync, 'omniroute.syncModels', undefined, true);
		this.appendCommandButton(actions, localize('omniProxy.action.manageModels', 'Manage Models'), Codicon.settingsGear, 'omniroute.openModels');
		return header;
	}

	private renderHomeSection(data: OmniProxyDashboardData): void {
		this.renderHeader(localize('omniProxy.home.title', 'OmniProxy Dashboard'), localize('omniProxy.home.description', 'Overview of the local runtime, provider connectivity, and model routing state.'));
		const hero = DOM.append(this.contentContainer!, $('.omni-proxy-hero'));
		const heroCopy = DOM.append(hero, $('.omni-proxy-hero-copy'));
		DOM.append(heroCopy, $('div.omni-proxy-eyebrow', {}, localize('omniProxy.home.eyebrow', 'Local Access Enabled')));
		DOM.append(heroCopy, $('h2.omni-proxy-hero-title', {}, data.runtime.serverRunning ? localize('omniProxy.home.ready', 'OmniProxy is ready inside OmniCode') : localize('omniProxy.home.offline', 'Finish runtime setup to start OmniProxy')));
		DOM.append(heroCopy, $('p.omni-proxy-hero-description', {}, data.runtime.serverRunning
			? localize('omniProxy.home.readyDescription', 'Use this dashboard to connect providers, sync models into Custom Endpoint, and route requests through the local proxy.')
			: localize('omniProxy.home.offlineDescription', 'Install dependencies and confirm the runtime paths before connecting providers.')));
		const heroActions = DOM.append(hero, $('.omni-proxy-hero-actions'));
		this.appendCommandButton(heroActions, data.runtime.dependenciesInstalled ? localize('omniProxy.home.connectProvider', 'Connect Provider') : localize('omniProxy.home.installDependencies', 'Install Dependencies'), data.runtime.dependenciesInstalled ? Codicon.plug : Codicon.package, data.runtime.dependenciesInstalled ? 'omniroute.connectProvider' : 'omniroute.installDependencies', undefined, true);
		this.appendCommandButton(heroActions, localize('omniProxy.home.showOutput', 'Show Output'), Codicon.output, 'omniroute.showOutput');

		const metrics = DOM.append(this.contentContainer!, $('.omni-proxy-card-grid metrics'));
		this.appendMetricCard(metrics, localize('omniProxy.metric.accounts', 'Connected Accounts'), String(data.stats.totalConnections), `${data.stats.totalProviders} ${localize('omniProxy.metric.providers', 'providers')}`);
		this.appendMetricCard(metrics, localize('omniProxy.metric.models', 'Synced Models'), String(data.stats.modelCount), data.runtime.lastSync ? localize('omniProxy.metric.lastSync', 'Last sync {0}', this.formatTimestamp(data.runtime.lastSync)) : localize('omniProxy.metric.notSynced', 'Not synced yet'));
		this.appendMetricCard(metrics, localize('omniProxy.metric.requests', 'Requests'), String(data.usage?.totalRequests ?? 0), localize('omniProxy.metric.tokens', '{0} tokens', this.formatNumber((data.usage?.totalPromptTokens ?? 0) + (data.usage?.totalCompletionTokens ?? 0))));
		this.appendMetricCard(metrics, localize('omniProxy.metric.proxies', 'Proxy Routes'), String(data.stats.proxyCount), data.globalProxyName ? localize('omniProxy.metric.globalProxy', 'Global proxy: {0}', data.globalProxyName) : localize('omniProxy.metric.noGlobalProxy', 'No global proxy assigned'));

		const cards = DOM.append(this.contentContainer!, $('.omni-proxy-card-grid'));
		const runtimeCard = this.appendCard(cards, localize('omniProxy.home.runtimeCard', 'Runtime and Access'), data.runtime.serverRunning ? localize('omniProxy.home.runtimeReady', 'Server running on {0}', data.runtime.baseUrl) : localize('omniProxy.home.runtimeOffline', 'Server is not running yet'));
		this.appendDetail(runtimeCard, localize('omniProxy.detail.node', 'Node Runtime'), data.runtime.nodePath);
		this.appendDetail(runtimeCard, localize('omniProxy.detail.npm', 'npm Runtime'), data.runtime.npmPath);
		this.appendDetail(runtimeCard, localize('omniProxy.detail.accessMode', 'Access Mode'), data.runtime.authUnlocked ? localize('omniProxy.detail.localAccess', 'Local access with no sign-in') : localize('omniProxy.detail.waiting', 'Waiting for local access'));
		this.appendCommandButton(runtimeCard, localize('omniProxy.action.openSettings', 'Open Settings'), Codicon.settingsGear, 'omniroute.openSettings');

		const providerCard = this.appendCard(cards, localize('omniProxy.home.providersCard', 'Provider Accounts'), localize('omniProxy.home.providersDescription', 'Connect multiple OAuth and API-key providers without leaving OmniCode.'));
		this.appendDetail(providerCard, localize('omniProxy.detail.connectedProviders', 'Connected Providers'), String(data.providers.filter(provider => provider.connectionCount > 0).length));
		this.appendDetail(providerCard, localize('omniProxy.detail.connectedAccounts', 'Connected Accounts'), String(data.stats.totalConnections));
		this.appendCommandButton(providerCard, localize('omniProxy.action.providers', 'Open Providers'), Codicon.serverEnvironment, undefined, undefined, false, () => this.storeSelectedSection(OmniProxyManagementSection.Providers));

		const modelCard = this.appendCard(cards, localize('omniProxy.home.modelCard', 'Custom Endpoint Sync'), localize('omniProxy.home.modelDescription', 'Push OmniProxy-managed models into the native Language Models system.'));
		this.appendDetail(modelCard, localize('omniProxy.detail.modelCount', 'Available Models'), String(data.stats.modelCount));
		this.appendDetail(modelCard, localize('omniProxy.detail.accessKey', 'Access Key'), data.runtime.hasAccessKey ? localize('omniProxy.detail.available', 'Available') : localize('omniProxy.detail.missing', 'Missing'));
		this.appendCommandButton(modelCard, localize('omniProxy.action.refreshKey', 'Refresh Access Key'), Codicon.key, 'omniroute.issueAccessKey', undefined, true);

		const proxyCard = this.appendCard(cards, localize('omniProxy.home.proxyCard', 'Proxy Mesh and RTK'), localize('omniProxy.home.proxyDescription', 'Set upstream proxies and use OmniProxy as the local routing layer.'));
		this.appendDetail(proxyCard, localize('omniProxy.detail.proxyCount', 'Configured Proxies'), String(data.stats.proxyCount));
		this.appendDetail(proxyCard, localize('omniProxy.detail.globalProxyName', 'Global Proxy'), data.globalProxyName ?? localize('omniProxy.detail.none', 'None'));
		this.appendCommandButton(proxyCard, localize('omniProxy.action.addProxy', 'Add Proxy'), Codicon.globe, 'omniroute.addProxy', undefined, true);
	}

	private renderProvidersSection(data: OmniProxyDashboardData): void {
		this.renderHeader(localize('omniProxy.providers.title', 'Providers'), localize('omniProxy.providers.description', 'Manage your AI provider connections inside a native OmniCode editor.'));

		const controls = DOM.append(this.contentContainer!, $('.omni-proxy-toolbar'));
		const searchWrapper = DOM.append(controls, $('.omni-proxy-search'));
		const searchInput = DOM.append(searchWrapper, $('input.omni-proxy-search-input', {
			type: 'search',
			placeholder: localize('omniProxy.providers.searchPlaceholder', 'Search Providers'),
			value: this.providerSearchValue,
		})) as HTMLInputElement;
		this.editorDisposables.add(DOM.addDisposableListener(searchInput, DOM.EventType.INPUT, () => {
			this.providerSearchValue = searchInput.value;
			this.render();
		}));

		const toggle = DOM.append(controls, $('label.omni-proxy-toggle'));
		const toggleInput = DOM.append(toggle, $('input', { type: 'checkbox' })) as HTMLInputElement;
		toggleInput.checked = this.configuredOnly;
		this.editorDisposables.add(DOM.addDisposableListener(toggleInput, DOM.EventType.CHANGE, () => {
			this.configuredOnly = toggleInput.checked;
			this.render();
		}));
		DOM.append(toggle, $('span', {}, localize('omniProxy.providers.configuredOnly', 'Configured only')));

		const toolbarActions = DOM.append(controls, $('.omni-proxy-toolbar-actions'));
		this.appendCommandButton(toolbarActions, localize('omniProxy.providers.connectProvider', 'Connect Provider'), Codicon.plug, 'omniroute.connectProvider', undefined, true);
		this.appendCommandButton(toolbarActions, localize('omniProxy.providers.syncModels', 'Sync Models'), Codicon.sync, 'omniroute.syncModels', undefined, true);

		const filteredProviders = this.filterProviders(data.providers);
		for (const group of PROVIDER_GROUPS) {
			const providers = filteredProviders.filter(provider => group.categories.includes(provider.category));
			if (!providers.length) {
				continue;
			}
			const connectedCount = providers.filter(provider => provider.connectionCount > 0).length;
			const section = DOM.append(this.contentContainer!, $('.omni-proxy-provider-section'));
			const sectionHeader = DOM.append(section, $('.omni-proxy-provider-section-header'));
			DOM.append(sectionHeader, $('h2.omni-proxy-provider-section-title', {}, group.label));
			DOM.append(sectionHeader, $('span.omni-proxy-provider-section-count', {}, `${connectedCount}/${providers.length}`));
			const grid = DOM.append(section, $('.omni-proxy-provider-grid'));
			for (const provider of providers) {
				this.appendProviderCard(grid, provider);
			}
		}

		if (!filteredProviders.length) {
			this.renderEmptyState(this.contentContainer!, Codicon.searchStop, localize('omniProxy.providers.noMatches', 'No providers match the current filters.'));
		}

		const connectionsCard = this.appendCard(this.contentContainer!, localize('omniProxy.providers.connectionsList', 'Connected Accounts'), localize('omniProxy.providers.connectionsDescription', 'Individual provider connections, their default model, health, and limit-protection state.'));
		if (!data.sections.providers.connections.length) {
			this.appendEmptyNote(connectionsCard, localize('omniProxy.providers.noConnections', 'No provider accounts connected yet.'));
		} else {
			for (const connection of data.sections.providers.connections) {
				const label = connection.displayName || connection.name || connection.email || connection.provider;
				const row = this.appendListRow(connectionsCard, label, `${connection.provider} · ${connection.authType ?? 'unknown'}`);
				this.appendTagRow(row, [
					connection.isActive === false ? localize('omniProxy.providers.inactive', 'Inactive') : localize('omniProxy.providers.active', 'Active'),
					connection.testStatus,
					connection.defaultModel ?? undefined,
					connection.rateLimitProtection ? localize('omniProxy.providers.limitProtection', 'Limit protection') : undefined
				]);
				if (connection.lastError) {
					DOM.append(row.querySelector('.omni-proxy-list-row-copy') as HTMLElement, $('div.omni-proxy-list-row-note', {}, connection.lastError));
				}
			}
		}

		const nodesAndMetrics = DOM.append(this.contentContainer!, $('.omni-proxy-card-grid'));
		const nodesCard = this.appendCard(nodesAndMetrics, localize('omniProxy.providers.nodesCard', 'Compatible Provider Nodes'), localize('omniProxy.providers.nodesDescription', 'OpenAI-compatible and Anthropic-compatible nodes imported from OmniRoute.'));
		this.appendDetail(nodesCard, localize('omniProxy.providers.nodesCount', 'Nodes'), String(data.sections.providers.nodes.length));
		for (const node of data.sections.providers.nodes.slice(0, 8)) {
			this.appendListRow(nodesCard, node.name, `${node.prefix ?? node.id} · ${node.baseUrl ?? ''}`);
		}

		const tokenCard = this.appendCard(nodesAndMetrics, localize('omniProxy.providers.tokenHealthCard', 'OAuth Token Health'), localize('omniProxy.providers.tokenHealthDescription', 'Aggregate state of OAuth tokens tracked by OmniRoute.'));
		this.appendDetail(tokenCard, localize('omniProxy.providers.totalTokens', 'Tracked Accounts'), String(data.sections.providers.tokenHealth?.total ?? 0));
		this.appendDetail(tokenCard, localize('omniProxy.providers.healthyTokens', 'Healthy'), String(data.sections.providers.tokenHealth?.healthy ?? 0));
		this.appendDetail(tokenCard, localize('omniProxy.providers.erroredTokens', 'Errored'), String(data.sections.providers.tokenHealth?.errored ?? 0));

		const metricsCard = this.appendCard(this.contentContainer!, localize('omniProxy.providers.metricsCard', 'Provider Metrics'), localize('omniProxy.providers.metricsDescription', 'Per-provider request volume, success rate, and latency aggregated from call logs.'));
		if (!data.sections.providers.metrics.length) {
			this.appendEmptyNote(metricsCard, localize('omniProxy.providers.noMetrics', 'No provider metrics recorded yet.'));
		} else {
			for (const metric of data.sections.providers.metrics.slice(0, 12)) {
				const row = this.appendListRow(metricsCard, metric.provider, `${metric.totalRequests} req · ${metric.successRate}% success`);
				this.appendTagRow(row, [
					`${metric.avgLatencyMs}ms`,
					`${metric.totalSuccesses} ok`
				]);
			}
		}
	}

	private renderCombosSection(data: OmniProxyDashboardData): void {
		this.renderHeader(localize('omniProxy.combos.title', 'Combos'), localize('omniProxy.combos.description', 'Combos mirror OmniRoute’s routing layer: composition, pattern mappings, and per-combo metrics all stay visible here.'));
		const cards = DOM.append(this.contentContainer!, $('.omni-proxy-card-grid'));
		const comboCard = this.appendCard(cards, localize('omniProxy.combos.routingCard', 'Routing Overview'), localize('omniProxy.combos.routingDescription', 'Use multi-model and multi-account routing strategies from the same native OmniProxy window.'));
		this.appendDetail(comboCard, localize('omniProxy.combos.count', 'Combos'), String(data.sections.combos.items.length));
		this.appendDetail(comboCard, localize('omniProxy.combos.mappings', 'Model Mappings'), String(data.sections.combos.mappings.length));
		this.appendCommandButton(comboCard, localize('omniProxy.combos.createCombo', 'Create Combo'), Codicon.add, 'omniroute.createCombo', undefined, true);

		const syncCard = this.appendCard(cards, localize('omniProxy.combos.syncCard', 'Picker Integration'), localize('omniProxy.combos.syncDescription', 'After sync, OmniProxy-managed models appear in the same native model picker as every other provider.'));
		this.appendDetail(syncCard, localize('omniProxy.combos.modelCount', 'Synced Models'), String(data.stats.modelCount));
		this.appendCommandButton(syncCard, localize('omniProxy.combos.syncModels', 'Sync Models'), Codicon.sync, 'omniroute.syncModels', undefined, true);

		const combosList = this.appendCard(this.contentContainer!, localize('omniProxy.combos.itemsList', 'Configured Combos'), localize('omniProxy.combos.itemsDescription', 'Existing combo definitions from OmniRoute.'));
		if (!data.sections.combos.items.length) {
			this.appendEmptyNote(combosList, localize('omniProxy.combos.noCombos', 'No combos configured yet.'));
		} else {
			for (const combo of data.sections.combos.items) {
				const row = this.appendListRow(combosList, combo.name, `${combo.strategy ?? 'priority'} · ${Array.isArray(combo.models) ? combo.models.length : 0} models`);
				if (combo.updatedAt) {
					this.appendTagRow(row, [this.formatTimestamp(combo.updatedAt)]);
				}
				this.appendInlineCommand(row, localize('omniProxy.combos.test', 'Test'), Codicon.beaker, 'omniroute.testCombo', combo.name, true);
				this.appendInlineCommand(row, localize('omniProxy.combos.delete', 'Delete'), Codicon.trash, 'omniroute.deleteCombo', combo.id, true);
			}
		}

		const mappingAndMetrics = DOM.append(this.contentContainer!, $('.omni-proxy-card-grid'));
		const mappingCard = this.appendCard(mappingAndMetrics, localize('omniProxy.combos.mappingCard', 'Model to Combo Mappings'), localize('omniProxy.combos.mappingDescription', 'Pattern-based routing rules registered in OmniRoute.'));
		if (!data.sections.combos.mappings.length) {
			this.appendEmptyNote(mappingCard, localize('omniProxy.combos.noMappings', 'No model mappings configured.'));
		} else {
			for (const mapping of data.sections.combos.mappings.slice(0, 10)) {
				const row = this.appendListRow(mappingCard, mapping.pattern, `${mapping.comboId} · priority ${mapping.priority ?? 0}`);
				this.appendTagRow(row, [mapping.enabled === false ? localize('omniProxy.combos.disabled', 'Disabled') : localize('omniProxy.combos.enabled', 'Enabled')]);
			}
		}

		const metricsCard = this.appendCard(mappingAndMetrics, localize('omniProxy.combos.metricsCard', 'Combo Metrics'), localize('omniProxy.combos.metricsDescription', 'Recorded runtime stats for combo execution.'));
		if (!data.sections.combos.metrics.length) {
			this.appendEmptyNote(metricsCard, localize('omniProxy.combos.noMetrics', 'No combo metrics recorded yet.'));
		} else {
			for (const metric of data.sections.combos.metrics.slice(0, 10)) {
				const row = this.appendListRow(metricsCard, metric.comboName, `${metric.requests} req · ${metric.successRate}% success`);
				this.appendTagRow(row, [`${metric.avgLatencyMs}ms`]);
			}
		}
	}

	private renderBatchTestingSection(data: OmniProxyDashboardData): void {
		this.renderHeader(localize('omniProxy.batchTesting.title', 'Batch Testing'), localize('omniProxy.batchTesting.description', 'Run the same bulk provider checks and inspect the same batches/files OmniRoute exposes in its dashboard.'));
		const toolbar = DOM.append(this.contentContainer!, $('.omni-proxy-toolbar'));
		const actions = DOM.append(toolbar, $('.omni-proxy-toolbar-actions'));
		this.appendCommandButton(actions, localize('omniProxy.batchTesting.testAll', 'Test All Providers'), Codicon.beaker, 'omniroute.testProvidersBatch', 'all', true);
		this.appendCommandButton(actions, localize('omniProxy.batchTesting.testOauth', 'Test OAuth'), Codicon.pass, 'omniroute.testProvidersBatch', 'oauth', true);
		this.appendCommandButton(actions, localize('omniProxy.batchTesting.testApiKey', 'Test API Keys'), Codicon.key, 'omniroute.testProvidersBatch', 'apikey', true);

		const cards = DOM.append(this.contentContainer!, $('.omni-proxy-card-grid'));
		const healthCard = this.appendCard(cards, localize('omniProxy.batchTesting.healthCard', 'Runtime Health'), data.runtime.serverRunning ? localize('omniProxy.batchTesting.healthReady', 'Local server is reachable.') : localize('omniProxy.batchTesting.healthOffline', 'Local server is offline.'));
		this.appendDetail(healthCard, localize('omniProxy.batchTesting.auth', 'Access Mode'), data.runtime.authUnlocked ? localize('omniProxy.batchTesting.unlocked', 'Unlocked') : localize('omniProxy.batchTesting.locked', 'Waiting'));
		this.appendDetail(healthCard, localize('omniProxy.batchTesting.batches', 'Recent Batches'), String(data.sections.batchTesting.batches.length));
		this.appendCommandButton(healthCard, localize('omniProxy.batchTesting.refreshState', 'Refresh State'), Codicon.refresh, 'omniroute.refresh', undefined, true);

		const proxyCard = this.appendCard(cards, localize('omniProxy.batchTesting.proxyCard', 'Proxy Mesh'), localize('omniProxy.batchTesting.proxyDescription', 'Inspect proxy routes before using OmniProxy for RTK or external tunnels.'));
		this.appendDetail(proxyCard, localize('omniProxy.batchTesting.proxyCount', 'Configured Proxies'), String(data.stats.proxyCount));
		this.appendDetail(proxyCard, localize('omniProxy.batchTesting.globalProxy', 'Global Proxy'), data.globalProxyName ?? localize('omniProxy.batchTesting.none', 'None'));
		this.appendCommandButton(proxyCard, localize('omniProxy.batchTesting.addProxy', 'Add Proxy'), Codicon.globe, 'omniroute.addProxy', undefined, true);

		const batchLists = DOM.append(this.contentContainer!, $('.omni-proxy-card-grid'));
		const batchesCard = this.appendCard(batchLists, localize('omniProxy.batchTesting.batchesCard', 'Recent Batches'), localize('omniProxy.batchTesting.batchesDescription', 'Latest batch jobs tracked by OmniRoute.'));
		if (!data.sections.batchTesting.batches.length) {
			this.appendEmptyNote(batchesCard, localize('omniProxy.batchTesting.noBatches', 'No batches recorded yet.'));
		} else {
			for (const batch of data.sections.batchTesting.batches.slice(0, 10)) {
				const row = this.appendListRow(batchesCard, batch.id, `${batch.status ?? 'unknown'} · ${batch.endpoint ?? '-'}`);
				this.appendTagRow(row, [batch.createdAt ? this.formatTimestamp(batch.createdAt) : undefined]);
			}
		}

		const filesCard = this.appendCard(batchLists, localize('omniProxy.batchTesting.filesCard', 'Uploaded Files'), localize('omniProxy.batchTesting.filesDescription', 'Files available to batch and file-backed routes.'));
		if (!data.sections.batchTesting.files.length) {
			this.appendEmptyNote(filesCard, localize('omniProxy.batchTesting.noFiles', 'No files tracked yet.'));
		} else {
			for (const file of data.sections.batchTesting.files.slice(0, 10)) {
				const row = this.appendListRow(filesCard, file.filename ?? file.id, `${file.purpose ?? 'file'} · ${this.formatNumber(file.bytes ?? 0)} bytes`);
				this.appendTagRow(row, [file.status, file.createdAt ? this.formatTimestamp(file.createdAt) : undefined]);
			}
		}
	}

	private renderCostsSection(data: OmniProxyDashboardData): void {
		this.renderHeader(localize('omniProxy.costs.title', 'Costs'), localize('omniProxy.costs.description', 'Summaries here come from OmniRoute usage analytics, including provider and model breakdowns.'));
		const summary = data.sections.costs.summary;
		const cards = DOM.append(this.contentContainer!, $('.omni-proxy-card-grid metrics'));
		this.appendMetricCard(cards, localize('omniProxy.costs.requests', 'Requests'), String(summary?.totalRequests ?? data.usage?.totalRequests ?? 0), localize('omniProxy.costs.totalRequestsDescription', 'Total requests routed through OmniProxy'));
		this.appendMetricCard(cards, localize('omniProxy.costs.promptTokens', 'Prompt Tokens'), this.formatNumber(summary?.promptTokens ?? data.usage?.totalPromptTokens ?? 0), localize('omniProxy.costs.promptTokensDescription', 'Prompt token usage'));
		this.appendMetricCard(cards, localize('omniProxy.costs.completionTokens', 'Completion Tokens'), this.formatNumber(summary?.completionTokens ?? data.usage?.totalCompletionTokens ?? 0), localize('omniProxy.costs.completionTokensDescription', 'Completion token usage'));
		this.appendMetricCard(cards, localize('omniProxy.costs.totalCost', 'Total Cost'), this.formatCurrency(summary?.totalCost ?? data.usage?.totalCost ?? 0), localize('omniProxy.costs.totalCostDescription', 'Aggregate reported cost'));

		const lists = DOM.append(this.contentContainer!, $('.omni-proxy-card-grid'));
		const providerCard = this.appendCard(lists, localize('omniProxy.costs.providerSpend', 'Top Providers'), localize('omniProxy.costs.providerSpendDescription', 'Provider cost and token share for the current range.'));
		if (!data.sections.costs.byProvider.length) {
			this.appendEmptyNote(providerCard, localize('omniProxy.costs.noProviderSpend', 'No provider cost data yet.'));
		} else {
			for (const row of data.sections.costs.byProvider.slice(0, 10)) {
				const item = this.appendListRow(providerCard, row.label, `${this.formatCurrency(row.cost)} · ${row.requests} req`);
				this.appendTagRow(item, [`${this.formatNumber(row.totalTokens)} tokens`]);
			}
		}

		const modelCard = this.appendCard(lists, localize('omniProxy.costs.modelSpend', 'Top Models'), localize('omniProxy.costs.modelSpendDescription', 'Model-level spend and request concentration.'));
		if (!data.sections.costs.byModel.length) {
			this.appendEmptyNote(modelCard, localize('omniProxy.costs.noModelSpend', 'No model cost data yet.'));
		} else {
			for (const row of data.sections.costs.byModel.slice(0, 10)) {
				const item = this.appendListRow(modelCard, row.label, `${this.formatCurrency(row.cost)} · ${row.requests} req`);
				this.appendTagRow(item, [`${this.formatNumber(row.totalTokens)} tokens`]);
			}
		}
	}

	private renderAnalyticsSection(data: OmniProxyDashboardData): void {
		this.renderHeader(localize('omniProxy.analytics.title', 'Analytics'), localize('omniProxy.analytics.description', 'Operational analytics from provider logs, token health, and compression telemetry.'));
		const cards = DOM.append(this.contentContainer!, $('.omni-proxy-card-grid'));
		const connectivityCard = this.appendCard(cards, localize('omniProxy.analytics.connectivityCard', 'Connectivity'), localize('omniProxy.analytics.connectivityDescription', 'How many provider cards currently have at least one connected account.'));
		this.appendDetail(connectivityCard, localize('omniProxy.analytics.connectedProviders', 'Connected Providers'), String(data.providers.filter(provider => provider.connectionCount > 0).length));
		this.appendDetail(connectivityCard, localize('omniProxy.analytics.availableProviders', 'Available Providers'), String(data.providers.length));

		const tokenCard = this.appendCard(cards, localize('omniProxy.analytics.tokenCard', 'Token Health'), localize('omniProxy.analytics.tokenDescription', 'OAuth token state exported by OmniRoute.'));
		this.appendDetail(tokenCard, localize('omniProxy.analytics.healthy', 'Healthy'), String(data.sections.analytics.tokenHealth?.healthy ?? 0));
		this.appendDetail(tokenCard, localize('omniProxy.analytics.errored', 'Errored'), String(data.sections.analytics.tokenHealth?.errored ?? 0));
		this.appendDetail(tokenCard, localize('omniProxy.analytics.warning', 'Warning'), String(data.sections.analytics.tokenHealth?.warning ?? 0));

		const metricsCard = this.appendCard(this.contentContainer!, localize('omniProxy.analytics.metricsCard', 'Provider Utilization'), localize('omniProxy.analytics.metricsDescription', 'Provider request volume and latency from OmniRoute metrics.'));
		if (!data.sections.analytics.providerMetrics.length) {
			this.appendEmptyNote(metricsCard, localize('omniProxy.analytics.noMetrics', 'No analytics recorded yet.'));
		} else {
			for (const metric of data.sections.analytics.providerMetrics.slice(0, 12)) {
				const row = this.appendListRow(metricsCard, metric.provider, `${metric.totalRequests} req · ${metric.successRate}% success`);
				this.appendTagRow(row, [`${metric.avgLatencyMs}ms`, `${metric.totalSuccesses} ok`]);
			}
		}

		const compressionCard = this.appendCard(this.contentContainer!, localize('omniProxy.analytics.compressionCard', 'Compression Analytics'), localize('omniProxy.analytics.compressionDescription', 'High-level fields returned by OmniRoute compression analytics.'));
		this.appendRecordDetails(compressionCard, data.sections.analytics.compression);
	}

	private renderCacheSection(data: OmniProxyDashboardData): void {
		this.renderHeader(localize('omniProxy.cache.title', 'Cache'), localize('omniProxy.cache.description', 'Prompt cache, semantic cache, and cache metrics are surfaced here with native actions.'));
		const cards = DOM.append(this.contentContainer!, $('.omni-proxy-card-grid'));
		const stateCard = this.appendCard(cards, localize('omniProxy.cache.stateCard', 'Cache State'), localize('omniProxy.cache.stateDescription', 'The dashboard reads live cache state from the extension and local OmniProxy process.'));
		this.appendDetail(stateCard, localize('omniProxy.cache.dependencies', 'Dependencies'), data.runtime.dependenciesInstalled ? localize('omniProxy.cache.ready', 'Ready') : localize('omniProxy.cache.pending', 'Pending'));
		this.appendDetail(stateCard, localize('omniProxy.cache.server', 'Server'), data.runtime.serverRunning ? localize('omniProxy.cache.online', 'Online') : localize('omniProxy.cache.offline', 'Offline'));
		this.appendCommandButton(stateCard, localize('omniProxy.cache.refresh', 'Refresh State'), Codicon.refresh, 'omniroute.refresh', undefined, true);
		this.appendCommandButton(stateCard, localize('omniProxy.cache.clearAll', 'Clear Cache'), Codicon.clearAll, 'omniroute.clearCache', undefined, true);

		const configCard = this.appendCard(cards, localize('omniProxy.cache.configCard', 'Cache Config'), localize('omniProxy.cache.configDescription', 'Current settings for semantic, prompt, and idempotency caching.'));
		this.appendRecordDetails(configCard, data.sections.cache.config, 6);

		const metricsCard = this.appendCard(this.contentContainer!, localize('omniProxy.cache.metricsCard', 'Cache Metrics'), localize('omniProxy.cache.metricsDescription', 'Stored prompt-cache metrics and runtime cache counters.'));
		this.appendCommandButton(metricsCard, localize('omniProxy.cache.resetMetrics', 'Reset Cache Metrics'), Codicon.discard, 'omniroute.resetCacheMetrics', undefined, true);
		this.appendRecordDetails(metricsCard, data.sections.cache.metrics, 8);
		this.appendRecordDetails(metricsCard, data.sections.cache.stats, 8);
	}

	private renderLimitsSection(data: OmniProxyDashboardData): void {
		this.renderHeader(localize('omniProxy.limits.title', 'Limits & Quotas'), localize('omniProxy.limits.description', 'Quota snapshots, rate-limit protection, and active sessions are mirrored from OmniRoute in one place.'));
		const cards = DOM.append(this.contentContainer!, $('.omni-proxy-card-grid'));
		const limitsCard = this.appendCard(cards, localize('omniProxy.limits.modelsCard', 'Model Availability'), localize('omniProxy.limits.modelsDescription', 'Visible models depend on current provider connections and the latest sync.'));
		this.appendDetail(limitsCard, localize('omniProxy.limits.syncedModels', 'Synced Models'), String(data.stats.modelCount));
		this.appendDetail(limitsCard, localize('omniProxy.limits.accessKey', 'Access Key'), data.runtime.hasAccessKey ? localize('omniProxy.limits.present', 'Present') : localize('omniProxy.limits.missing', 'Missing'));
		this.appendCommandButton(limitsCard, localize('omniProxy.limits.syncModels', 'Sync Models'), Codicon.sync, 'omniroute.syncModels', undefined, true);
		this.appendCommandButton(limitsCard, localize('omniProxy.limits.refreshQuotas', 'Refresh Quotas'), Codicon.refresh, 'omniroute.refreshProviderLimits', undefined, true);

		const quotaCard = this.appendCard(this.contentContainer!, localize('omniProxy.limits.quotaCard', 'Provider Quotas'), localize('omniProxy.limits.quotaDescription', 'Latest quota and token state per connection.'));
		if (!data.sections.limits.quotas.length) {
			this.appendEmptyNote(quotaCard, localize('omniProxy.limits.noQuotas', 'No quota data available yet.'));
		} else {
			for (const quota of data.sections.limits.quotas.slice(0, 16)) {
				const label = `${quota.name} (${quota.provider})`;
				const detail = `${quota.percentRemaining.toFixed(1)}% remaining · ${this.formatNumber(quota.quotaUsed)} used`;
				const row = this.appendListRow(quotaCard, label, detail);
				this.appendTagRow(row, [quota.tokenStatus, quota.resetAt ? this.formatTimestamp(quota.resetAt) : undefined]);
			}
		}

		const rateAndSessions = DOM.append(this.contentContainer!, $('.omni-proxy-card-grid'));
		const rateCard = this.appendCard(rateAndSessions, localize('omniProxy.limits.rateLimitCard', 'Rate Limit Protection'), localize('omniProxy.limits.rateLimitDescription', 'Per-connection limit protection and live lockouts.'));
		if (!data.sections.limits.rateLimits?.connections.length) {
			this.appendEmptyNote(rateCard, localize('omniProxy.limits.noRateLimits', 'No rate-limit state available.'));
		} else {
			for (const connection of data.sections.limits.rateLimits.connections.slice(0, 12)) {
				const row = this.appendListRow(rateCard, connection.name, `${connection.provider} · ${connection.rateLimited ? 'limited' : 'ready'}`);
				this.appendTagRow(row, [connection.rateLimitProtection ? localize('omniProxy.limits.protectionOn', 'Protection on') : localize('omniProxy.limits.protectionOff', 'Protection off')]);
				this.appendInlineCommand(row, connection.rateLimitProtection ? localize('omniProxy.limits.disableProtection', 'Disable') : localize('omniProxy.limits.enableProtection', 'Enable'), Codicon.shield, 'omniroute.toggleRateLimitProtection', { connectionId: connection.connectionId, enabled: !connection.rateLimitProtection }, true);
			}
		}

		const sessionsCard = this.appendCard(rateAndSessions, localize('omniProxy.limits.sessionsCard', 'Active Sessions'), localize('omniProxy.limits.sessionsDescription', 'Session IDs and request counts currently live in OmniRoute.'));
		if (!data.sections.limits.sessions.length) {
			this.appendEmptyNote(sessionsCard, localize('omniProxy.limits.noSessions', 'No active sessions.'));
		} else {
			for (const session of data.sections.limits.sessions.slice(0, 12)) {
				const row = this.appendListRow(sessionsCard, session.sessionId.slice(0, 12), `${session.requestCount} req · ${this.formatDuration(session.ageMs)}`);
				this.appendTagRow(row, [session.connectionId ?? undefined]);
			}
		}
	}

	private renderMediaSection(data: OmniProxyDashboardData): void {
		this.renderHeader(localize('omniProxy.media.title', 'Media'), localize('omniProxy.media.description', 'Memory, recent files, and vision-capable usage are surfaced through the native OmniProxy window.'));
		const cards = DOM.append(this.contentContainer!, $('.omni-proxy-card-grid'));
		const mediaCard = this.appendCard(cards, localize('omniProxy.media.visionCard', 'Vision and File Surface'), localize('omniProxy.media.visionDescription', 'Vision-capable models stay visible through the same synced Custom Endpoint group.'));
		this.appendDetail(mediaCard, localize('omniProxy.media.providers', 'Connected Providers'), String(data.providers.filter(provider => provider.isConnected).length));
		this.appendDetail(mediaCard, localize('omniProxy.media.modelCount', 'Visible Models'), String(data.stats.modelCount));
		this.appendDetail(mediaCard, localize('omniProxy.media.files', 'Tracked Files'), String(data.sections.media.files.length));
		this.appendCommandButton(mediaCard, localize('omniProxy.media.openProviders', 'Open Providers'), Codicon.serverEnvironment, undefined, undefined, false, () => this.storeSelectedSection(OmniProxyManagementSection.Providers));

		const memoryCard = this.appendCard(cards, localize('omniProxy.media.memoryCard', 'Memory Settings'), localize('omniProxy.media.memoryDescription', 'Semantic/recent memory settings and pipeline health from OmniRoute.'));
		this.appendRecordDetails(memoryCard, data.sections.media.memorySettings, 6);
		this.appendRecordDetails(memoryCard, data.sections.media.memoryHealth, 4);
		this.appendCommandButton(memoryCard, localize('omniProxy.media.addMemory', 'Add Memory'), Codicon.add, 'omniroute.addMemory', undefined, true);

		const lists = DOM.append(this.contentContainer!, $('.omni-proxy-card-grid'));
		const memoriesCard = this.appendCard(lists, localize('omniProxy.media.memoriesCard', 'Recent Memories'), localize('omniProxy.media.memoriesDescription', 'Recent memory records stored by OmniRoute.'));
		if (!data.sections.media.memories.length) {
			this.appendEmptyNote(memoriesCard, localize('omniProxy.media.noMemories', 'No memories stored yet.'));
		} else {
			for (const memory of data.sections.media.memories.slice(0, 12)) {
				const row = this.appendListRow(memoriesCard, memory.key, `${memory.type} · ${memory.content.slice(0, 72)}`);
				this.appendTagRow(row, [memory.updatedAt ? this.formatTimestamp(memory.updatedAt) : undefined, memory.sessionId ?? undefined]);
				this.appendInlineCommand(row, localize('omniProxy.media.deleteMemory', 'Delete'), Codicon.trash, 'omniroute.deleteMemory', memory.id, true);
			}
		}

		const filesCard = this.appendCard(lists, localize('omniProxy.media.filesCard', 'Recent Files'), localize('omniProxy.media.filesDescription', 'File records visible to batch, media, and other OmniRoute flows.'));
		if (!data.sections.media.files.length) {
			this.appendEmptyNote(filesCard, localize('omniProxy.media.noFiles', 'No files tracked yet.'));
		} else {
			for (const file of data.sections.media.files.slice(0, 12)) {
				const row = this.appendListRow(filesCard, file.filename ?? file.id, `${file.purpose ?? 'file'} · ${this.formatNumber(file.bytes ?? 0)} bytes`);
				this.appendTagRow(row, [file.status, file.createdAt ? this.formatTimestamp(file.createdAt) : undefined]);
			}
		}
	}

	private appendListRow(container: HTMLElement, title: string, detail: string): HTMLElement {
		const row = DOM.append(container, $('.omni-proxy-list-row'));
		const copy = DOM.append(row, $('.omni-proxy-list-row-copy'));
		DOM.append(copy, $('div.omni-proxy-list-row-title', {}, title));
		DOM.append(copy, $('div.omni-proxy-list-row-detail', {}, detail));
		DOM.append(row, $('.omni-proxy-list-row-actions'));
		return row;
	}

	private appendTagRow(row: HTMLElement, values: readonly (string | undefined)[]): void {
		const target = row.querySelector<HTMLElement>('.omni-proxy-list-row-copy');
		if (!target) {
			return;
		}
		const validValues = values.filter((value): value is string => !!value);
		if (!validValues.length) {
			return;
		}
		const tags = DOM.append(target, $('.omni-proxy-tags'));
		for (const value of validValues) {
			DOM.append(tags, $('span.omni-proxy-pill.connected', {}, value));
		}
	}

	private appendInlineCommand(row: HTMLElement, label: string, icon: ThemeIcon, commandId: string, argument?: unknown, refreshAfterCommand?: boolean): void {
		const actions = row.querySelector<HTMLElement>('.omni-proxy-list-row-actions');
		if (!actions) {
			return;
		}
		this.appendCommandButton(actions, label, icon, commandId, argument, refreshAfterCommand);
	}

	private appendRecordDetails(container: HTMLElement, value: Record<string, unknown> | undefined, limit = 10): void {
		if (!value) {
			this.appendEmptyNote(container, localize('omniProxy.empty.record', 'No data available.'));
			return;
		}
		const entries = Object.entries(value).slice(0, limit);
		if (!entries.length) {
			this.appendEmptyNote(container, localize('omniProxy.empty.record', 'No data available.'));
			return;
		}
		for (const [key, entryValue] of entries) {
			this.appendDetail(container, this.humanizeKey(key), this.formatUnknown(entryValue));
		}
	}

	private appendEmptyNote(container: HTMLElement, label: string): void {
		DOM.append(container, $('div.omni-proxy-card-description', {}, label));
	}

	private appendProviderCard(container: HTMLElement, provider: OmniProxyDashboardProvider): void {
		const card = DOM.append(container, $('.omni-proxy-provider-card'));
		const icon = DOM.append(card, $('.omni-proxy-provider-icon'));
		icon.textContent = provider.name.split(/\s+/).slice(0, 2).map(part => part.charAt(0).toUpperCase()).join('').slice(0, 2);

		const content = DOM.append(card, $('.omni-proxy-provider-card-content'));
		const titleRow = DOM.append(content, $('.omni-proxy-provider-card-title-row'));
		DOM.append(titleRow, $('div.omni-proxy-provider-card-title', {}, provider.name));
		if (provider.deprecated) {
			this.appendPill(titleRow, localize('omniProxy.provider.deprecated', 'Deprecated'), 'deprecated');
		} else if (provider.connectionCount > 0) {
			this.appendPill(titleRow, provider.connectionCount === 1 ? localize('omniProxy.provider.oneConnection', '1 Connected') : localize('omniProxy.provider.manyConnections', '{0} Connected', provider.connectionCount), 'connected');
		}
		DOM.append(content, $('div.omni-proxy-provider-card-subtitle', {}, provider.connectionCount > 0
			? provider.connectionLabels.join(', ')
			: localize('omniProxy.provider.noConnections', 'No connections')));
		const detail = provider.lastError || provider.authHint || provider.apiHint || provider.website || provider.category;
		DOM.append(content, $('div.omni-proxy-provider-card-detail', {}, detail));

		const footer = DOM.append(card, $('.omni-proxy-provider-card-footer'));
		const actionLabel = provider.connectionCount > 0 ? localize('omniProxy.provider.addAccount', 'Add Account') : localize('omniProxy.provider.connect', 'Connect');
		this.appendCommandButton(footer, actionLabel, Codicon.plug, 'omniroute.connectProvider', provider.id, true);
	}

	private appendCard(container: HTMLElement, title: string, description: string): HTMLElement {
		const card = DOM.append(container, $('.omni-proxy-card'));
		DOM.append(card, $('h3.omni-proxy-card-title', {}, title));
		DOM.append(card, $('p.omni-proxy-card-description', {}, description));
		return card;
	}

	private appendMetricCard(container: HTMLElement, title: string, value: string, description: string): void {
		const card = DOM.append(container, $('.omni-proxy-card.metric'));
		DOM.append(card, $('div.omni-proxy-card-label', {}, title));
		DOM.append(card, $('div.omni-proxy-card-metric', {}, value));
		DOM.append(card, $('div.omni-proxy-card-description', {}, description));
	}

	private appendDetail(container: HTMLElement, label: string, value: string): void {
		const row = DOM.append(container, $('.omni-proxy-detail-row'));
		DOM.append(row, $('span.omni-proxy-detail-label', {}, label));
		DOM.append(row, $('span.omni-proxy-detail-value', {}, value));
	}

	private appendPill(container: HTMLElement, label: string, kind: 'connected' | 'deprecated'): void {
		DOM.append(container, $(`span.omni-proxy-pill.${kind}`, {}, label));
	}

	private appendCommandButton(container: HTMLElement, label: string, icon: ThemeIcon, commandId?: string, argument?: unknown, refreshAfterCommand?: boolean, handler?: () => void): void {
		const button = DOM.append(container, $('button.omni-proxy-action-button', { type: 'button' }));
		const iconEl = DOM.append(button, $('span.omni-proxy-action-button-icon'));
		iconEl.classList.add(...ThemeIcon.asClassNameArray(icon));
		DOM.append(button, $('span', {}, label));
		this.editorDisposables.add(DOM.addDisposableListener(button, DOM.EventType.CLICK, async () => {
			if (handler) {
				handler();
				return;
			}
			if (!commandId) {
				return;
			}
			await this.commandService.executeCommand(commandId, argument);
			if (refreshAfterCommand) {
				await this.refreshDashboard();
			}
		}));
	}

	private renderErrorState(message: string): void {
		const container = DOM.append(this.contentContainer!, $('.omni-proxy-state omni-proxy-state-error'));
		DOM.append(container, $('div.omni-proxy-state-title', {}, localize('omniProxy.error.stateTitle', 'Could not load OmniProxy')));
		DOM.append(container, $('div.omni-proxy-state-message', {}, message));
		this.appendCommandButton(container, localize('omniProxy.error.retry', 'Retry'), Codicon.refresh, undefined, undefined, false, () => { void this.refreshDashboard(); });
	}

	private renderEmptyState(container: HTMLElement, icon: ThemeIcon, label: string): void {
		const state = DOM.append(container, $('.omni-proxy-state'));
		const iconEl = DOM.append(state, $('div.omni-proxy-state-icon'));
		iconEl.classList.add(...ThemeIcon.asClassNameArray(icon));
		DOM.append(state, $('div.omni-proxy-state-message', {}, label));
	}

	private filterProviders(providers: readonly OmniProxyDashboardProvider[]): readonly OmniProxyDashboardProvider[] {
		return providers.filter(provider => {
			if (this.configuredOnly && provider.connectionCount === 0) {
				return false;
			}
			if (!this.providerSearchValue.trim()) {
				return true;
			}
			const query = this.providerSearchValue.trim().toLowerCase();
			return provider.name.toLowerCase().includes(query)
				|| provider.id.toLowerCase().includes(query)
				|| provider.category.toLowerCase().includes(query);
		});
	}

	private formatTimestamp(value: string): string {
		try {
			return new Date(value).toLocaleString();
		} catch {
			return value;
		}
	}

	private formatDuration(value: number): string {
		if (!Number.isFinite(value) || value <= 0) {
			return '0s';
		}
		if (value < 60_000) {
			return `${Math.floor(value / 1000)}s`;
		}
		if (value < 3_600_000) {
			return `${Math.floor(value / 60_000)}m`;
		}
		return `${Math.floor(value / 3_600_000)}h`;
	}

	private formatNumber(value: number): string {
		return new Intl.NumberFormat().format(value);
	}

	private formatCurrency(value: number): string {
		return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 4 }).format(value);
	}

	private formatUnknown(value: unknown): string {
		if (value === null || value === undefined) {
			return localize('omniProxy.unknown.none', 'None');
		}
		if (typeof value === 'string') {
			return value;
		}
		if (typeof value === 'number') {
			return Number.isFinite(value) ? String(value) : localize('omniProxy.unknown.notAvailable', 'Not available');
		}
		if (typeof value === 'boolean') {
			return value ? localize('omniProxy.bool.true', 'Enabled') : localize('omniProxy.bool.false', 'Disabled');
		}
		if (Array.isArray(value)) {
			return value.map(item => this.formatUnknown(item)).join(', ');
		}
		return JSON.stringify(value);
	}

	private humanizeKey(key: string): string {
		return key
			.replace(/([a-z])([A-Z])/g, '$1 $2')
			.replace(/[_-]+/g, ' ')
			.replace(/\b\w/g, match => match.toUpperCase());
	}
}
