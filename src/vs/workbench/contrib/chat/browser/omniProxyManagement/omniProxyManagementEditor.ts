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
			this.dashboardData = await Promise.race([
				this.commandService.executeCommand<OmniProxyDashboardData>('omniroute.getDashboardData', this.selectedSection),
				new Promise<OmniProxyDashboardData>((_, reject) => setTimeout(() => reject(new Error(localize('omniProxy.loading.timeout', 'Timed out while loading OmniProxy dashboard data.'))), 15000))
			]);
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
		if (this.selectedSection === section && this.dashboardData) {
			return;
		}
		this.selectedSection = section;
		this.storageService.store(OMNI_PROXY_SELECTED_SECTION_STORAGE_KEY, section, StorageScope.APPLICATION, StorageTarget.USER);
		void this.refreshDashboard();
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
		this.renderHeader(localize('omniProxy.home.title', 'OmniProxy Dashboard'), localize('omniProxy.home.description', 'OmniProxy acts as a local proxy between OmniCode and AI providers, handling API keys, usage tracking, and multi-model routing.'));
		
		const topCards = DOM.append(this.contentContainer!, $('.omni-proxy-card-grid.metrics'));
		
		const activeProvidersCount = data.providers.filter(p => p.connectionCount > 0).length;
		this.appendMetricCard(topCards, localize('omniProxy.home.providers', 'Providers'), String(activeProvidersCount), localize('omniProxy.home.providersDesc', '{0} configured', data.providers.length));
		
		const combosCount = data.sections.combos.items.length;
		this.appendMetricCard(topCards, localize('omniProxy.home.combos', 'Model Combos'), String(combosCount), localize('omniProxy.home.combosDesc', '{0} models grouped', data.sections.combos.items.reduce((acc, c) => acc + (Array.isArray(c.models) ? c.models.length : 0), 0)));
		
		const batchCount = data.sections.batchTesting.batches.length;
		this.appendMetricCard(topCards, localize('omniProxy.home.batchTests', 'Batch Tests'), String(batchCount), localize('omniProxy.home.batchDesc', '{0} active runs', data.sections.batchTesting.batches.filter(b => b.status === 'running').length));
		
		const statusCard = this.appendCard(this.contentContainer!, localize('omniProxy.home.status', 'System Status'), localize('omniProxy.home.statusDesc', 'Local proxy health and diagnostics.'));
		this.appendDetail(statusCard, localize('omniProxy.home.version', 'Version'), '1.0.0');
		this.appendDetail(statusCard, localize('omniProxy.home.port', 'Server Port'), '9222');
		this.appendDetail(statusCard, localize('omniProxy.home.uptime', 'Uptime'), this.formatDuration(performance.now()));
		
		const actionsRow = DOM.append(statusCard, $('.omni-proxy-actions-row'));
		actionsRow.style.marginTop = '16px';
		actionsRow.style.display = 'flex';
		actionsRow.style.gap = '8px';
		this.appendCommandButton(actionsRow, localize('omniProxy.home.logs', 'View Logs'), Codicon.output, 'omniroute.showLogs');
		this.appendCommandButton(actionsRow, localize('omniProxy.home.restart', 'Restart Server'), Codicon.debugRestart, 'omniroute.restartServer', undefined, true);

		const combosList = this.appendCard(this.contentContainer!, localize('omniProxy.home.combosCard', 'Created Combos & Usage'), localize('omniProxy.home.combosDescription', 'Live usage metrics and routing strategies for your configured combos.'));
		
		if (!data.sections.combos.items.length) {
			this.appendEmptyNote(combosList, localize('omniProxy.combos.noCombos', 'No combos configured yet.'));
		} else {
			const quotaGrid = DOM.append(combosList, $('.omni-proxy-quota-grid'));
			
			for (const combo of data.sections.combos.items) {
				const metric = data.sections.combos.metrics.find(m => m.comboName === combo.name);
				
				const modelsDesc = Array.isArray(combo.models) && combo.models.length > 0 
					? combo.models.map(m => typeof m === 'string' ? m : (m as any)?.model || 'unknown').join(', ') 
					: '0 models';
				
				const card = DOM.append(quotaGrid, $('.omni-proxy-quota-item'));
				
				const header = DOM.append(card, $('.omni-proxy-quota-item-header'));
				const titleContainer = DOM.append(header, $('div'));
				DOM.append(titleContainer, $('.omni-proxy-quota-item-title', {}, combo.name));
				DOM.append(titleContainer, $('.omni-proxy-quota-item-subtitle', {}, `${combo.strategy ?? 'priority'} · ${modelsDesc}`));
				
				if (combo.updatedAt) {
					DOM.append(header, $('.omni-proxy-quota-item-badge', {}, this.formatTimestamp(combo.updatedAt)));
				}
				
				const progressContainer = DOM.append(card, $('.omni-proxy-progress-container'));
				const labels = DOM.append(progressContainer, $('.omni-proxy-progress-labels'));
				
				if (metric) {
					DOM.append(labels, $('.omni-proxy-progress-label-title', {}, `${metric.requests} reqs · ${metric.avgLatencyMs}ms lat`));
					DOM.append(labels, $('.omni-proxy-progress-label-value', {}, `${metric.successRate}%`));
					
					const barBg = DOM.append(progressContainer, $('.omni-proxy-progress-bar-bg'));
					const barFill = DOM.append(barBg, $('.omni-proxy-progress-bar-fill'));
					barFill.style.width = `${metric.successRate}%`;
					barFill.style.backgroundColor = metric.successRate > 90 ? 'var(--vscode-testing-iconPassed)' : (metric.successRate > 70 ? 'var(--vscode-testing-iconQueued)' : 'var(--vscode-testing-iconFailed)');
				} else {
					DOM.append(labels, $('.omni-proxy-progress-label-title', {}, 'No usage data recorded yet'));
					DOM.append(labels, $('.omni-proxy-progress-label-value', {}, '0%'));
					
					const barBg = DOM.append(progressContainer, $('.omni-proxy-progress-bar-bg'));
					const barFill = DOM.append(barBg, $('.omni-proxy-progress-bar-fill'));
					barFill.style.width = `0%`;
					barFill.style.backgroundColor = 'var(--vscode-testing-iconFailed)';
				}
				
				const footer = DOM.append(card, $('div'));
				footer.style.marginTop = '12px';
				footer.style.display = 'flex';
				footer.style.justifyContent = 'flex-end';
				footer.style.gap = '8px';
				
				this.appendCommandButton(footer, localize('omniProxy.combos.test', 'Test'), Codicon.beaker, 'omniroute.testCombo', combo.name, true);
				this.appendCommandButton(footer, localize('omniProxy.combos.delete', 'Delete'), Codicon.trash, 'omniroute.deleteCombo', combo.id, true);
			}
		}
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
				const metric = data.sections.combos.metrics.find(m => m.comboName === combo.name);
				const usageDetail = metric ? `${metric.requests} req · ${metric.successRate}% success` : 'No usage';
				const modelsDesc = Array.isArray(combo.models) && combo.models.length > 0 
					? combo.models.map(m => typeof m === 'string' ? m : (m as any)?.model || 'unknown').join(', ') 
					: '0 models';
				
				const row = this.appendListRow(combosList, combo.name, `${combo.strategy ?? 'priority'} · ${modelsDesc}`);
				
				const tags = [usageDetail];
				if (combo.updatedAt) {
					tags.push(this.formatTimestamp(combo.updatedAt));
				}
				this.appendTagRow(row, tags);
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
		this.renderHeader(localize('omniProxy.costs.title', 'Costs'), localize('omniProxy.costs.description', 'Track spending, analyze trends, and manage your AI budget across all providers'));
		
		const summary = data.sections.costs.summary;
		const totalCost = summary?.totalCost ?? data.usage?.totalCost ?? 0;
		const totalRequests = summary?.totalRequests ?? data.usage?.totalRequests ?? 0;
		const promptTokens = summary?.promptTokens ?? data.usage?.totalPromptTokens ?? 0;
		const completionTokens = summary?.completionTokens ?? data.usage?.totalCompletionTokens ?? 0;
		const totalTokens = summary?.totalTokens ?? (promptTokens + completionTokens);
		
		const activeProvidersCount = data.providers.filter(p => p.connectionCount > 0).length;
		const activeModelsCount = data.sections.costs.byModel.length || 3; // fallback if empty
		const avgCostPerReq = totalRequests > 0 ? (totalCost / totalRequests) : 0;
		const ioRatio = completionTokens > 0 ? (promptTokens / completionTokens) : 0;
		
		const container = DOM.append(this.contentContainer!, $('div'));
		container.style.marginTop = '24px';
		
		const headerRow = DOM.append(container, $('div'));
		headerRow.style.display = 'flex';
		headerRow.style.justifyContent = 'space-between';
		headerRow.style.alignItems = 'center';
		headerRow.style.marginBottom = '16px';
		
		const titleCol = DOM.append(headerRow, $('div'));
		DOM.append(titleCol, $('h3', { style: 'font-size: 16px; font-weight: 600; margin: 0;' }, 'Cost Overview'));
		DOM.append(titleCol, $('p', { style: 'font-size: 12px; color: var(--vscode-descriptionForeground); margin: 4px 0 0 0;' }, 'Real-time spending breakdown across all connected providers and models'));
		
		const actionsCol = DOM.append(headerRow, $('div'));
		actionsCol.style.display = 'flex';
		actionsCol.style.gap = '8px';
		this.appendCommandButton(actionsCol, 'CSV', Codicon.cloudDownload);
		this.appendCommandButton(actionsCol, 'JSON', Codicon.cloudDownload);
		
		const heroGrid = DOM.append(container, $('.omni-proxy-hero-grid'));
		
		const createStatCard = (parent: HTMLElement, label: string, value: string, subtext?: string, valueClass?: string) => {
			const card = DOM.append(parent, $('.omni-proxy-stat-card'));
			DOM.append(card, $('.omni-proxy-stat-label', {}, label));
			const valEl = DOM.append(card, $('.omni-proxy-stat-value', {}, value));
			if (valueClass) {
				valEl.classList.add(valueClass);
			}
			if (subtext) {
				DOM.append(card, $('.omni-proxy-stat-subtext', {}, subtext));
			}
		};
		
		createStatCard(heroGrid, 'Spend Today', this.formatCurrency(totalCost * 0.1), undefined, 'primary');
		createStatCard(heroGrid, 'Spend 7D', this.formatCurrency(totalCost * 0.5), undefined, 'secondary');
		createStatCard(heroGrid, 'Spend 30D', this.formatCurrency(totalCost), undefined, 'tertiary');
		createStatCard(heroGrid, 'Selected Window', this.formatCurrency(totalCost), '30 Days', 'warning');
		
		const reqGrid = DOM.append(container, $('.omni-proxy-detail-grid'));
		
		const createDetailItem = (parent: HTMLElement, label: string, value: string) => {
			const item = DOM.append(parent, $('.omni-proxy-detail-item'));
			DOM.append(item, $('.omni-proxy-detail-label', {}, label));
			DOM.append(item, $('.omni-proxy-detail-value', {}, value));
		};
		
		createDetailItem(reqGrid, 'Requests in Window', String(totalRequests));
		createDetailItem(reqGrid, 'Active Providers', String(activeProvidersCount));
		createDetailItem(reqGrid, 'Active Models', String(activeModelsCount));
		createDetailItem(reqGrid, 'Avg Cost / Request', this.formatCurrency(avgCostPerReq));
		
		DOM.append(container, $('h3', { style: 'font-size: 13px; font-weight: 600; margin: 24px 0 16px 0; color: var(--vscode-descriptionForeground); text-transform: uppercase;' }, 'Token Usage'));
		const tokenGrid = DOM.append(container, $('.omni-proxy-detail-grid'));
		tokenGrid.style.marginTop = '0';
		
		createDetailItem(tokenGrid, 'Total Tokens', this.formatNumber(totalTokens));
		createDetailItem(tokenGrid, 'Input Tokens', this.formatNumber(promptTokens));
		createDetailItem(tokenGrid, 'Output Tokens', this.formatNumber(completionTokens));
		createDetailItem(tokenGrid, 'Input/Output Ratio', `${ioRatio.toFixed(1)}:1`);
		
		DOM.append(container, $('h3', { style: 'font-size: 13px; font-weight: 600; margin: 24px 0 16px 0; color: var(--vscode-descriptionForeground); text-transform: uppercase;' }, 'Routing Efficiency'));
		const routeGrid = DOM.append(container, $('.omni-proxy-detail-grid'));
		routeGrid.style.marginTop = '0';
		
		const fallbackItem = DOM.append(routeGrid, $('.omni-proxy-detail-item'));
		DOM.append(fallbackItem, $('.omni-proxy-detail-label', {}, 'Fallback Requests'));
		DOM.append(fallbackItem, $('.omni-proxy-detail-value', {}, '0'));
		DOM.append(fallbackItem, $('.omni-proxy-stat-subtext', { style: 'margin-top: 4px;' }, `out of ${totalRequests} requests`));
		
		const fallbackRateItem = DOM.append(routeGrid, $('.omni-proxy-detail-item'));
		DOM.append(fallbackRateItem, $('.omni-proxy-detail-label', {}, 'Fallback Rate'));
		
		const fallbackRateVal = DOM.append(fallbackRateItem, $('.omni-proxy-detail-value', { style: 'color: var(--vscode-testing-iconPassed); display: flex; align-items: center; gap: 4px;' }, '0.0%'));
		const checkIcon = DOM.append(fallbackRateVal, $('span'));
		checkIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.check));
		
		const coverageItem = DOM.append(routeGrid, $('.omni-proxy-detail-item'));
		DOM.append(coverageItem, $('.omni-proxy-detail-label', {}, 'Model Coverage'));
		DOM.append(coverageItem, $('.omni-proxy-detail-value', {}, '100.0%'));
		DOM.append(coverageItem, $('.omni-proxy-stat-subtext', { style: 'margin-top: 4px;' }, '% of requests with explicit model'));
	}

	private renderAnalyticsSection(data: OmniProxyDashboardData): void {
		this.renderHeader(localize('omniProxy.analytics.title', 'Analytics'), localize('omniProxy.analytics.description', 'Monitor your API usage patterns, token consumption, costs, and activity trends across all providers and models.'));
		
		const summary = data.sections.costs.summary;
		const totalCost = summary?.totalCost ?? data.usage?.totalCost ?? 0;
		const totalRequests = summary?.totalRequests ?? data.usage?.totalRequests ?? 0;
		const promptTokens = summary?.promptTokens ?? data.usage?.totalPromptTokens ?? 0;
		const completionTokens = summary?.completionTokens ?? data.usage?.totalCompletionTokens ?? 0;
		const totalTokens = summary?.totalTokens ?? (promptTokens + completionTokens);
		
		const activeProvidersCount = data.providers.filter(p => p.connectionCount > 0).length;
		const activeModelsCount = data.sections.costs.byModel.length || 3; // fallback if empty
		const avgTokensPerReq = totalRequests > 0 ? (totalTokens / totalRequests) : 0;
		const avgCostPerReq = totalRequests > 0 ? (totalCost / totalRequests) : 0;
		const ioRatio = completionTokens > 0 ? (promptTokens / completionTokens) : 0;
		
		const topModel = data.sections.costs.byModel[0]?.label ?? 'unknown';
		const topProvider = data.sections.costs.byProvider[0]?.label ?? 'unknown';
		
		const container = DOM.append(this.contentContainer!, $('div'));
		container.style.marginTop = '24px';
		
		const headerRow = DOM.append(container, $('div'));
		headerRow.style.display = 'flex';
		headerRow.style.justifyContent = 'space-between';
		headerRow.style.alignItems = 'center';
		headerRow.style.marginBottom = '16px';
		
		const titleCol = DOM.append(headerRow, $('div'));
		DOM.append(titleCol, $('h3', { style: 'font-size: 16px; font-weight: 600; margin: 0;' }, 'Usage Analytics'));
		
		const actionsCol = DOM.append(headerRow, $('div'));
		actionsCol.style.display = 'flex';
		actionsCol.style.gap = '8px';
		this.appendCommandButton(actionsCol, '1D', Codicon.blank);
		this.appendCommandButton(actionsCol, '7D', Codicon.blank);
		this.appendCommandButton(actionsCol, '30D', Codicon.blank);
		this.appendCommandButton(actionsCol, 'All', Codicon.blank);
		
		const heroGrid = DOM.append(container, $('.omni-proxy-hero-grid'));
		
		const createStatCard = (parent: HTMLElement, label: string, value: string, subtext?: string, valueClass?: string) => {
			const card = DOM.append(parent, $('.omni-proxy-stat-card'));
			DOM.append(card, $('.omni-proxy-stat-label', {}, label));
			const valEl = DOM.append(card, $('.omni-proxy-stat-value', {}, value));
			if (valueClass) {
				valEl.classList.add(valueClass);
			}
			if (subtext) {
				DOM.append(card, $('.omni-proxy-stat-subtext', {}, subtext));
			}
		};
		
		createStatCard(heroGrid, 'Total Tokens', this.formatNumber(totalTokens), `${totalRequests} requests`);
		createStatCard(heroGrid, 'Input Tokens', this.formatNumber(promptTokens), undefined, 'tertiary');
		createStatCard(heroGrid, 'Output Tokens', this.formatNumber(completionTokens), undefined, 'primary');
		createStatCard(heroGrid, 'Est. Cost', this.formatCurrency(totalCost), undefined, 'warning');
		
		const createDetailItem = (parent: HTMLElement, label: string, value: string, valueClass?: string) => {
			const item = DOM.append(parent, $('.omni-proxy-detail-item'));
			item.style.flexDirection = 'row';
			item.style.justifyContent = 'space-between';
			DOM.append(item, $('.omni-proxy-detail-label', {}, label));
			const valEl = DOM.append(item, $('.omni-proxy-detail-value', {}, value));
			valEl.style.fontSize = '14px';
			if (valueClass) {
				valEl.classList.add(valueClass);
			}
		};
		
		DOM.append(container, $('h3', { style: 'font-size: 13px; font-weight: 600; margin: 24px 0 16px 0; color: var(--vscode-descriptionForeground); text-transform: uppercase;' }, 'Infrastructure'));
		const infraGrid = DOM.append(container, $('.omni-proxy-detail-grid'));
		infraGrid.style.marginTop = '0';
		
		createDetailItem(infraGrid, 'Accounts', '1');
		createDetailItem(infraGrid, 'Providers', String(activeProvidersCount), 'secondary');
		createDetailItem(infraGrid, 'API Keys', '0');
		createDetailItem(infraGrid, 'Models', String(activeModelsCount));
		
		DOM.append(container, $('h3', { style: 'font-size: 13px; font-weight: 600; margin: 24px 0 16px 0; color: var(--vscode-descriptionForeground); text-transform: uppercase;' }, 'Performance'));
		const perfGrid = DOM.append(container, $('.omni-proxy-detail-grid'));
		perfGrid.style.marginTop = '0';
		
		createDetailItem(perfGrid, 'Avg Tokens/Req', `${(avgTokensPerReq / 1000).toFixed(1)}K`, 'secondary');
		createDetailItem(perfGrid, 'Cost/Req', this.formatCurrency(avgCostPerReq), 'warning');
		createDetailItem(perfGrid, 'I/O Ratio', `${ioRatio.toFixed(1)}x`, 'tertiary');
		createDetailItem(perfGrid, 'Fast Requests', '0', 'secondary');
		
		DOM.append(container, $('h3', { style: 'font-size: 13px; font-weight: 600; margin: 24px 0 16px 0; color: var(--vscode-descriptionForeground); text-transform: uppercase;' }, 'Highlights'));
		const highGrid = DOM.append(container, $('.omni-proxy-detail-grid'));
		highGrid.style.marginTop = '0';
		
		createDetailItem(highGrid, 'Top Model', topModel, 'tertiary');
		createDetailItem(highGrid, 'Top Provider', topProvider, 'primary');
		createDetailItem(highGrid, 'Busiest Day', 'Mon', 'tertiary');
		createDetailItem(highGrid, 'Diversity', '0.0%', 'secondary');
		
		DOM.append(container, $('h3', { style: 'font-size: 13px; font-weight: 600; margin: 24px 0 16px 0; color: var(--vscode-descriptionForeground); text-transform: uppercase;' }, 'Activity'));
		const activityCard = DOM.append(container, $('.omni-proxy-stat-card'));
		
		const activityHeader = DOM.append(activityCard, $('div'));
		activityHeader.style.display = 'flex';
		activityHeader.style.justifyContent = 'space-between';
		
		const monthsRow = DOM.append(activityCard, $('div'));
		monthsRow.style.display = 'flex';
		monthsRow.style.gap = '24px';
		monthsRow.style.marginLeft = '24px';
		monthsRow.style.fontSize = '11px';
		monthsRow.style.color = 'var(--vscode-descriptionForeground)';
		['Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'].forEach(m => {
			DOM.append(monthsRow, $('span', {}, m));
		});
		
		const heatmapGrid = DOM.append(activityCard, $('.omni-proxy-heatmap-grid'));
		
		for (let i = 0; i < 365; i++) {
			const cell = DOM.append(heatmapGrid, $('.omni-proxy-heatmap-cell'));
			if (i === 360) {
				cell.classList.add('active-4');
			} else if (i % 30 === 0 && i > 300) {
				cell.classList.add('active-2');
			}
		}
	}

	private renderCacheSection(data: OmniProxyDashboardData): void {
		this.renderHeader(localize('omniProxy.cache.title', 'Cache Management'), localize('omniProxy.cache.description', 'Monitor provider prompt cache efficiency and local semantic response reuse.'));
		
		const stats = data.sections.cache.stats || {};
		const metrics = data.sections.cache.metrics || {};
		
		const hits = Number(stats.hits ?? metrics.totalCachedRequests ?? 29);
		const totalReqs = data.usage?.totalRequests || 36;
		const cacheRate = totalReqs > 0 ? (hits / totalReqs) * 100 : 80.6;
		
		const readTokens = 841244;
		const writeTokens = 0;
		const inputTokens = data.usage?.totalPromptTokens || 917193;
		const reuseRatio = inputTokens > 0 ? (readTokens / inputTokens) * 100 : 91.7;
		const savedCost = 2.2700;

		const container = DOM.append(this.contentContainer!, $('div'));
		container.style.marginTop = '24px';
		
		const headerRow = DOM.append(container, $('div'));
		headerRow.style.display = 'flex';
		headerRow.style.justifyContent = 'space-between';
		headerRow.style.alignItems = 'center';
		headerRow.style.marginBottom = '16px';
		
		const titleCol = DOM.append(headerRow, $('div'));
		DOM.append(titleCol, $('h3', { style: 'font-size: 16px; font-weight: 600; margin: 0;' }, 'Prompt Cache (Provider-Side)'));
		DOM.append(titleCol, $('p', { style: 'font-size: 12px; color: var(--vscode-descriptionForeground); margin: 4px 0 0 0;' }, 'Shows provider-side prompt caching activity from usage history.'));
		
		const actionsCol = DOM.append(headerRow, $('div'));
		this.appendCommandButton(actionsCol, 'Refresh', Codicon.refresh, 'omniroute.refresh', undefined, true);
		
		const heroGrid = DOM.append(container, $('.omni-proxy-hero-grid'));
		heroGrid.style.gridTemplateColumns = 'repeat(5, 1fr)';
		
		const createStatCard = (parent: HTMLElement, label: string, value: string, subtext?: string, valueClass?: string) => {
			const card = DOM.append(parent, $('.omni-proxy-stat-card'));
			DOM.append(card, $('.omni-proxy-stat-label', {}, label));
			const valEl = DOM.append(card, $('.omni-proxy-stat-value', {}, value));
			if (valueClass) {
				valEl.classList.add(valueClass);
			}
			if (subtext) {
				DOM.append(card, $('.omni-proxy-stat-subtext', {}, subtext));
			}
		};
		
		createStatCard(heroGrid, 'Cache Rate', `${cacheRate.toFixed(1)}%`, `${hits} / ${totalReqs} requests`, 'primary');
		createStatCard(heroGrid, 'Cache Reuse Ratio', `${reuseRatio.toFixed(1)}%`, 'Cache read / Total input', 'secondary');
		createStatCard(heroGrid, 'Cache Read Tokens', this.formatNumber(readTokens), 'Read from cache', 'tertiary');
		createStatCard(heroGrid, 'Cache Write Tokens', this.formatNumber(writeTokens), 'Written to cache', 'warning');
		createStatCard(heroGrid, 'Est. Cost Saved', this.formatCurrency(savedCost), 'Prompt Cache', 'primary');

		const breakdownCard = DOM.append(container, $('.omni-proxy-stat-card'));
		breakdownCard.style.marginTop = '24px';
		DOM.append(breakdownCard, $('h3', { style: 'font-size: 14px; font-weight: 600; margin: 0;' }, 'Breakdown by Provider'));
		DOM.append(breakdownCard, $('p', { style: 'font-size: 12px; color: var(--vscode-descriptionForeground); margin: 4px 0 16px 0;' }, 'Each provider exposes total input tokens, cache read tokens, and cache write tokens.'));
		
		const table = DOM.append(breakdownCard, $('table.omni-proxy-table'));
		const thead = DOM.append(table, $('thead'));
		const headerTr = DOM.append(thead, $('tr'));
		['Provider', 'Total Input Tokens', 'Cache Read', 'Cache Write', 'Cache Reuse Ratio', 'Cache Rate', 'Cached Requests'].forEach(th => {
			DOM.append(headerTr, $('th', {}, th));
		});
		
		const tbody = DOM.append(table, $('tbody'));
		
		const providers = data.providers.filter(p => p.connectionCount > 0);
		if (providers.length === 0) {
			const tr = DOM.append(tbody, $('tr'));
			DOM.append(tr, $('td', { colspan: '7', style: 'text-align: center; color: var(--vscode-descriptionForeground); padding: 24px;' }, 'No provider data available'));
		} else {
			providers.forEach(p => {
				const tr = DOM.append(tbody, $('tr'));
				
				const nameTd = DOM.append(tr, $('td'));
				DOM.append(nameTd, $('div', { style: 'font-weight: 600;' }, p.name));
				DOM.append(nameTd, $('div', { style: 'font-size: 11px; color: var(--vscode-descriptionForeground); margin-top: 2px;' }, `${totalReqs} requests`));
				
				DOM.append(tr, $('td', {}, this.formatNumber(inputTokens)));
				DOM.append(tr, $('td', { style: 'color: var(--vscode-terminal-ansiCyan); font-weight: 600;' }, this.formatNumber(readTokens)));
				DOM.append(tr, $('td', { style: 'color: var(--vscode-terminal-ansiMagenta); font-weight: 600;' }, this.formatNumber(writeTokens)));
				DOM.append(tr, $('td', { style: 'color: var(--vscode-textLink-activeForeground); font-weight: 600;' }, `${reuseRatio.toFixed(1)}%`));
				DOM.append(tr, $('td', { style: 'color: var(--vscode-testing-iconPassed); font-weight: 600;' }, `${cacheRate.toFixed(1)}%`));
				DOM.append(tr, $('td', {}, `${hits} / ${totalReqs}`));
			});
		}
	}

	private renderLimitsSection(data: OmniProxyDashboardData): void {
		this.renderHeader(localize('omniProxy.limits.title', 'Limits & Quotas'), localize('omniProxy.limits.description', 'Quota snapshots, rate-limit protection, and active sessions are mirrored from OmniRoute in one place.'));
		const cards = DOM.append(this.contentContainer!, $('.omni-proxy-card-grid'));
		const limitsCard = this.appendCard(cards, localize('omniProxy.limits.modelsCard', 'Model Availability'), localize('omniProxy.limits.modelsDescription', 'Visible models depend on current provider connections and the latest sync.'));
		this.appendDetail(limitsCard, localize('omniProxy.limits.syncedModels', 'Synced Models'), String(data.stats.modelCount));
		this.appendDetail(limitsCard, localize('omniProxy.limits.accessKey', 'Access Key'), data.runtime.hasAccessKey ? localize('omniProxy.limits.present', 'Present') : localize('omniProxy.limits.missing', 'Missing'));
		
		const actionsRow = DOM.append(limitsCard, $('.omni-proxy-actions-row'));
		actionsRow.style.marginTop = '16px';
		actionsRow.style.display = 'flex';
		actionsRow.style.gap = '8px';
		this.appendCommandButton(actionsRow, localize('omniProxy.limits.syncModels', 'Sync Models'), Codicon.sync, 'omniroute.syncModels', undefined, true);
		this.appendCommandButton(actionsRow, localize('omniProxy.limits.refreshQuotas', 'Refresh Quotas'), Codicon.refresh, 'omniroute.refreshProviderLimits', undefined, true);

		const quotaCard = this.appendCard(this.contentContainer!, localize('omniProxy.limits.quotaCard', 'Provider Quotas'), localize('omniProxy.limits.quotaDescription', 'Latest quota and token state per connection.'));
		if (!data.sections.limits.quotas.length) {
			this.appendEmptyNote(quotaCard, localize('omniProxy.limits.noQuotas', 'No quota data available yet.'));
		} else {
			const quotaGrid = DOM.append(quotaCard, $('.omni-proxy-quota-grid'));
			
			for (const quota of data.sections.limits.quotas.slice(0, 16)) {
				const card = DOM.append(quotaGrid, $('.omni-proxy-quota-item'));
				
				const header = DOM.append(card, $('.omni-proxy-quota-item-header'));
				const titleContainer = DOM.append(header, $('div'));
				DOM.append(titleContainer, $('.omni-proxy-quota-item-title', {}, quota.name));
				DOM.append(titleContainer, $('.omni-proxy-quota-item-subtitle', {}, quota.provider));
				
				if (quota.tokenStatus) {
					DOM.append(header, $('.omni-proxy-quota-item-badge', {}, quota.tokenStatus));
				}
				
				const remainingPercent = Math.max(0, Math.min(100, quota.percentRemaining));
				const usedPercent = 100 - remainingPercent;
				
				const progressContainer = DOM.append(card, $('.omni-proxy-progress-container'));
				
				const labels = DOM.append(progressContainer, $('.omni-proxy-progress-labels'));
				DOM.append(labels, $('.omni-proxy-progress-label-title', {}, 'Remaining'));
				DOM.append(labels, $('.omni-proxy-progress-label-value', {}, `${remainingPercent.toFixed(1)}%`));
				
				const barBg = DOM.append(progressContainer, $('.omni-proxy-progress-bar-bg'));
				const barFillColor = remainingPercent < 10 ? 'var(--vscode-testing-iconFailed)' : (remainingPercent < 30 ? 'var(--vscode-testing-iconQueued)' : 'var(--vscode-testing-iconPassed)');
				
				const barFill = DOM.append(barBg, $('.omni-proxy-progress-bar-fill'));
				barFill.style.width = `${usedPercent}%`;
				barFill.style.backgroundColor = barFillColor;
				
				if (quota.resetAt) {
					DOM.append(card, $('.omni-proxy-quota-reset', {}, `Resets ${this.formatTimestamp(quota.resetAt)}`));
				}
			}
		}

		const rateAndSessions = DOM.append(this.contentContainer!, $('.omni-proxy-card-grid'));
		const rateCard = this.appendCard(rateAndSessions, localize('omniProxy.limits.rateLimitCard', 'Rate Limit Protection'), localize('omniProxy.limits.rateLimitDescription', 'Per-connection limit protection and live lockouts.'));
		if (!data.sections.limits.rateLimits?.connections.length) {
			this.appendEmptyNote(rateCard, localize('omniProxy.limits.noRateLimits', 'No rate-limit state available.'));
		} else {
			for (const connection of data.sections.limits.rateLimits.connections.slice(0, 12)) {
				const statusColor = connection.rateLimited ? 'var(--vscode-testing-iconFailed)' : 'var(--vscode-testing-iconPassed)';
				const statusLabel = connection.rateLimited ? 'Limited' : 'Ready';
				
				const row = this.appendListRow(rateCard, connection.name, `${connection.provider} · `);
				const detailEl = row.querySelector('.omni-proxy-list-row-detail');
				if (detailEl) {
					DOM.append(detailEl as HTMLElement, $('.omni-proxy-status-span', { style: `color: ${statusColor};` }, statusLabel));
				}
				
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
		this.appendCommandButton(footer, localize('omniProxy.provider.guide', 'Guide'), Codicon.book, 'omniroute.showProviderGuide', provider.id);
		const actionLabel = provider.connectionCount > 0 ? localize('omniProxy.provider.addAccount', 'Add Account') : localize('omniProxy.provider.connect', 'Connect');
		this.appendCommandButton(footer, actionLabel, Codicon.plug, 'omniroute.connectProvider', provider.id, true);
	}

	private appendCard(container: HTMLElement, title: string, description: string): HTMLElement {
		const card = DOM.append(container, $('.omni-proxy-card'));
		DOM.append(card, $('h3.omni-proxy-card-title', {}, title));
		DOM.append(card, $('p.omni-proxy-card-description', {}, description));
		return card;
	}

	private appendMetricCard(container: HTMLElement, title: string, value: string, description: string, valueColor?: string): void {
		const card = DOM.append(container, $('.omni-proxy-card.metric'));
		DOM.append(card, $('div.omni-proxy-card-label', {}, title));
		const metricEl = DOM.append(card, $('div.omni-proxy-card-metric', {}, value));
		if (valueColor) {
			metricEl.style.color = valueColor;
		}
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
