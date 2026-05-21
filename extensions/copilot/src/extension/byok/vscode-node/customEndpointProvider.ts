/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IChatMLFetcher } from '../../../platform/chat/common/chatMLFetcher';
import { IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { IDomainService } from '../../../platform/endpoint/common/domainService';
import { EndpointEditToolName, IChatModelInformation, ModelSupportedEndpoint } from '../../../platform/endpoint/common/endpointProvider';
import { ILogService } from '../../../platform/log/common/logService';
import { IFetcherService } from '../../../platform/networking/common/fetcherService';
import { IChatWebSocketManager } from '../../../platform/networking/node/chatWebSocketManager';
import { IExperimentationService } from '../../../platform/telemetry/common/nullExperimentationService';
import { ITokenizerProvider } from '../../../platform/tokenizer/node/tokenizer';
import { IStringDictionary } from '../../../util/vs/base/common/collections';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { BYOKModelCapabilities, resolveModelInfo } from '../common/byokProvider';
import { OpenAIEndpoint } from '../node/openAIEndpoint';
import { AbstractOpenAICompatibleLMProvider, LanguageModelChatConfiguration, OpenAICompatibleLanguageModelChatInformation } from './abstractLanguageModelChatProvider';
import { byokKnownModelToAPIInfoWithEffort } from './byokModelInfo';
import { IBYOKStorageService } from './byokStorageService';

export type CustomEndpointApiType = 'chat-completions' | 'responses' | 'messages';

export function resolveCustomEndpointUrl(modelId: string, url: string, apiType?: CustomEndpointApiType): string {
	// The fully resolved url was already passed in
	if (hasExplicitApiPath(url)) {
		return url;
	}

	// Remove the trailing slash
	if (url.endsWith('/')) {
		url = url.slice(0, -1);
	}

	const defaultApiPath = apiTypeToPath(apiType);

	// Check if URL already contains any version pattern like /v1, /v2, etc
	const versionPattern = /\/v\d+$/;
	if (versionPattern.test(url)) {
		return `${url}${defaultApiPath}`;
	}

	// For standard OpenAI-compatible endpoints, just append the standard path
	return `${url}/v1${defaultApiPath}`;
}

function apiTypeToPath(apiType: CustomEndpointApiType | undefined): string {
	switch (apiType) {
		case 'responses': return '/responses';
		case 'messages': return '/messages';
		case 'chat-completions':
		default:
			return '/chat/completions';
	}
}

export function hasExplicitApiPath(url: string): boolean {
	return url.includes('/responses') || url.includes('/chat/completions') || url.includes('/messages');
}

function inferApiTypeFromUrl(url: string): CustomEndpointApiType {
	if (url.includes('/messages')) {
		return 'messages';
	}
	if (url.includes('/responses')) {
		return 'responses';
	}
	return 'chat-completions';
}

function apiTypeToSupportedEndpoints(apiType: CustomEndpointApiType): ModelSupportedEndpoint[] | undefined {
	switch (apiType) {
		case 'responses':
			return [ModelSupportedEndpoint.ChatCompletions, ModelSupportedEndpoint.Responses];
		case 'messages':
			return [ModelSupportedEndpoint.Messages];
		case 'chat-completions':
		default:
			return undefined;
	}
}

export interface CustomEndpointModelProviderConfig extends LanguageModelChatConfiguration {
	url?: string;
	apiType?: CustomEndpointApiType;
	models?: CustomEndpointModelConfig[];
}

interface _CustomEndpointModelConfig {
	name: string;
	url: string;
	apiType?: CustomEndpointApiType;
	maxInputTokens: number;
	maxOutputTokens: number;
	toolCalling: boolean;
	vision: boolean;
	thinking?: boolean;
	streaming?: boolean;
	editTools?: EndpointEditToolName[];
	requestHeaders?: Record<string, string>;
	zeroDataRetentionEnabled?: boolean;
	supportsReasoningEffort?: string[];
	reasoningEffortFormat?: 'chat-completions' | 'responses';
}

export interface CustomEndpointModelConfig extends _CustomEndpointModelConfig {
	id: string;
}

interface CustomEndpointDiscoveredModel {
	id: string;
	root?: string;
	name: string;
	capabilities: BYOKModelCapabilities;
}

export class CustomEndpointBYOKModelProvider extends AbstractOpenAICompatibleLMProvider<CustomEndpointModelProviderConfig> {

	public static readonly providerName = 'CustomEndpoint';
	public static readonly providerId = this.providerName.toLowerCase();

	constructor(
		_byokStorageService: IBYOKStorageService,
		@ILogService logService: ILogService,
		@IFetcherService fetcherService: IFetcherService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IConfigurationService configurationService: IConfigurationService,
		@IExperimentationService expService: IExperimentationService,
	) {
		super(CustomEndpointBYOKModelProvider.providerId, CustomEndpointBYOKModelProvider.providerName, undefined, _byokStorageService, fetcherService, logService, instantiationService, configurationService, expService);
	}

	protected override async configureDefaultGroupWithApiKeyOnly(): Promise<string | undefined> {
		// No-op: Custom Endpoint models are configured via the JSON snippet flow, not by an API-key-only prompt.
		return;
	}

	protected override async getAllModels(silent: boolean, apiKey: string | undefined, configuration: CustomEndpointModelProviderConfig | undefined): Promise<OpenAICompatibleLanguageModelChatInformation<CustomEndpointModelProviderConfig>[]> {
		if (configuration?.url) {
			return super.getAllModels(silent, apiKey, configuration);
		}
		const models: OpenAICompatibleLanguageModelChatInformation<CustomEndpointModelProviderConfig>[] = [];
		if (Array.isArray(configuration?.models)) {
			const reconciledModels = await this.reconcileConfiguredModels(configuration.models, apiKey, silent);
			for (const modelConfig of reconciledModels) {
				models.push({
					...byokKnownModelToAPIInfoWithEffort(this._name, modelConfig.id, modelConfig),
					url: modelConfig.url
				});
			}
		}
		return models;
	}

	protected override async createOpenAIEndPoint(model: OpenAICompatibleLanguageModelChatInformation<CustomEndpointModelProviderConfig>): Promise<OpenAIEndpoint> {
		const modelConfiguration = model.configuration?.models?.find(m => m.id === model.id);
		const apiTypeOverride = modelConfiguration?.apiType ?? model.configuration?.apiType;
		const url = resolveCustomEndpointUrl(model.id, model.url, apiTypeOverride);
		const apiType: CustomEndpointApiType = apiTypeOverride ?? inferApiTypeFromUrl(url);
		const modelCapabilities = {
			maxInputTokens: model.maxInputTokens,
			maxOutputTokens: model.maxOutputTokens,
			toolCalling: !!model.capabilities?.toolCalling || false,
			vision: !!model.capabilities?.imageInput || false,
			name: model.name,
			url,
			thinking: modelConfiguration?.thinking ?? false,
			streaming: modelConfiguration?.streaming,
			requestHeaders: modelConfiguration?.requestHeaders,
			zeroDataRetentionEnabled: modelConfiguration?.zeroDataRetentionEnabled,
			supportsReasoningEffort: modelConfiguration?.supportsReasoningEffort,
			reasoningEffortFormat: modelConfiguration?.reasoningEffortFormat
		};
		const modelInfo = resolveModelInfo(model.id, this._name, undefined, modelCapabilities);
		const supportedEndpoints = apiTypeToSupportedEndpoints(apiType);
		if (supportedEndpoints) {
			modelInfo.supported_endpoints = supportedEndpoints;
		}
		return this._instantiationService.createInstance(CustomEndpointOAIEndpoint, modelInfo, model.configuration?.apiKey ?? '', url);
	}

	protected getModelsBaseUrl(configuration: CustomEndpointModelProviderConfig | undefined): string | undefined {
		return configuration?.url;
	}

	private async reconcileConfiguredModels(
		models: readonly CustomEndpointModelConfig[],
		apiKey: string | undefined,
		silent: boolean
	): Promise<CustomEndpointModelConfig[]> {
		const discoveryCache = new Map<string, CustomEndpointDiscoveredModel[] | null>();
		const resolvedModels: CustomEndpointModelConfig[] = [];

		for (const model of models) {
			let resolvedModel = model;
			if (!model.id.includes('/')) {
				const discoveredModels = await this.getDiscoveredModelsForUrl(model.url, apiKey, silent, discoveryCache);
				const canonical = this.findCanonicalDiscoveredModel(discoveredModels, model.id);
				if (canonical) {
					resolvedModel = {
						...model,
						id: canonical.id,
						name: canonical.name,
						toolCalling: canonical.capabilities.toolCalling,
						vision: canonical.capabilities.vision,
						maxInputTokens: canonical.capabilities.maxInputTokens,
						maxOutputTokens: canonical.capabilities.maxOutputTokens,
						thinking: canonical.capabilities.thinking,
						streaming: canonical.capabilities.streaming,
						editTools: canonical.capabilities.editTools,
						requestHeaders: canonical.capabilities.requestHeaders,
						zeroDataRetentionEnabled: canonical.capabilities.zeroDataRetentionEnabled,
						supportsReasoningEffort: canonical.capabilities.supportsReasoningEffort,
						reasoningEffortFormat: canonical.capabilities.reasoningEffortFormat,
					};
				}
			}
			resolvedModels.push(resolvedModel);
		}

		return resolvedModels;
	}

	private async getDiscoveredModelsForUrl(
		url: string,
		apiKey: string | undefined,
		silent: boolean,
		cache: Map<string, CustomEndpointDiscoveredModel[] | null>
	): Promise<CustomEndpointDiscoveredModel[] | null> {
		if (cache.has(url)) {
			return cache.get(url)!;
		}

		if (!apiKey && silent) {
			cache.set(url, null);
			return null;
		}

		try {
			const response = await this._fetcherService.fetch(`${url.replace(/\/$/, '')}/models`, {
				method: 'GET',
				headers: {
					'Content-Type': 'application/json',
					...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
				},
				callSite: 'byok-customendpoint-canonical-models',
			});
			const data = await response.json();
			const result = this.parseDiscoveredModels(data);
			cache.set(url, result);
			return result;
		} catch (error) {
			this._logService.warn(error, `[CustomEndpoint] Failed to discover canonical model ids for ${url}`);
			cache.set(url, null);
			return null;
		}
	}

	private parseDiscoveredModels(data: unknown): CustomEndpointDiscoveredModel[] {
		const resultObject = this.asDictionary(data);
		const entries = Array.isArray(data)
			? data
			: Array.isArray(resultObject?.data)
				? resultObject.data
				: Array.isArray(resultObject?.models)
					? resultObject.models
					: [];

		return entries
			.map(entry => this.parseDiscoveredModel(entry))
			.filter((entry): entry is CustomEndpointDiscoveredModel => !!entry);
	}

	private parseDiscoveredModel(entry: unknown): CustomEndpointDiscoveredModel | undefined {
		const model = this.asDictionary(entry);
		if (!model || typeof model.id !== 'string') {
			return undefined;
		}

		const capabilities = this.asDictionary(model.capabilities);
		return {
			id: model.id,
			root: typeof model.root === 'string' ? model.root : undefined,
			name: typeof model.display_name === 'string'
				? model.display_name
				: typeof model.name === 'string'
					? model.name
					: model.id,
			capabilities: {
				name: typeof model.display_name === 'string'
					? model.display_name
					: typeof model.name === 'string'
						? model.name
						: model.id,
				toolCalling: typeof model.toolCalling === 'boolean'
					? model.toolCalling
					: typeof capabilities?.tool_calling === 'boolean'
						? capabilities.tool_calling
						: true,
				vision: typeof model.vision === 'boolean'
					? model.vision
					: typeof capabilities?.vision === 'boolean'
						? capabilities.vision
						: false,
				maxInputTokens: typeof model.maxInputTokens === 'number'
					? model.maxInputTokens
					: typeof model.max_input_tokens === 'number'
						? model.max_input_tokens
						: typeof model.context_window === 'number'
							? model.context_window
							: typeof model.context_length === 'number'
								? model.context_length
								: 128000,
				maxOutputTokens: typeof model.maxOutputTokens === 'number'
					? model.maxOutputTokens
					: typeof model.max_output_tokens === 'number'
						? model.max_output_tokens
						: typeof model.max_tokens === 'number'
							? model.max_tokens
							: 16000,
				thinking: typeof capabilities?.thinking === 'boolean' ? capabilities.thinking : undefined,
				supportsReasoningEffort: typeof capabilities?.reasoning === 'boolean' && capabilities.reasoning ? ['medium'] : undefined,
			},
		};
	}

	private findCanonicalDiscoveredModel(
		discoveredModels: readonly CustomEndpointDiscoveredModel[] | null,
		configuredId: string
	): CustomEndpointDiscoveredModel | undefined {
		if (!discoveredModels?.length) {
			return undefined;
		}

		const exact = discoveredModels.find(model => model.id === configuredId);
		if (exact) {
			return exact;
		}

		const rootMatches = discoveredModels.filter(model => model.root === configuredId);
		if (rootMatches.length === 1) {
			return rootMatches[0];
		}

		const suffixMatches = discoveredModels.filter(model => model.id.endsWith(`/${configuredId}`));
		if (suffixMatches.length === 1) {
			return suffixMatches[0];
		}

		return undefined;
	}

	private asDictionary(value: unknown): IStringDictionary<unknown> | undefined {
		return typeof value === 'object' && value !== null ? value as IStringDictionary<unknown> : undefined;
	}
}

/**
 * Custom-endpoint specific subclass that:
 * 1. Bypasses the `UseAnthropicMessagesApi` experiment flag — the user explicitly
 *    selected the Messages API for their endpoint, so we honor that unconditionally.
 * 2. Sends Anthropic-style auth (`x-api-key`) and `anthropic-version` plus beta
 *    headers when the Messages API is in use, instead of `Authorization: Bearer`.
 *    Users can still override any header via the model's `requestHeaders` setting.
 */
export class CustomEndpointOAIEndpoint extends OpenAIEndpoint {
	constructor(
		modelMetadata: IChatModelInformation,
		apiKey: string,
		modelUrl: string,
		@IDomainService domainService: IDomainService,
		@IChatMLFetcher chatMLFetcher: IChatMLFetcher,
		@ITokenizerProvider tokenizerProvider: ITokenizerProvider,
		@IInstantiationService instantiationService: IInstantiationService,
		@IConfigurationService configurationService: IConfigurationService,
		@IExperimentationService expService: IExperimentationService,
		@IChatWebSocketManager chatWebSocketService: IChatWebSocketManager,
		@ILogService logService: ILogService,
	) {
		super(modelMetadata, apiKey, modelUrl, domainService, chatMLFetcher, tokenizerProvider, instantiationService, configurationService, expService, chatWebSocketService, logService);
	}

	protected override get useMessagesApi(): boolean {
		return !!this.modelMetadata.supported_endpoints?.includes(ModelSupportedEndpoint.Messages);
	}

	public override getExtraHeaders(): Record<string, string> {
		const headers: Record<string, string> = {
			'Content-Type': 'application/json'
		};
		if (this.useMessagesApi) {
			headers['x-api-key'] = this._apiKey;
			headers['anthropic-version'] = '2023-06-01';
			Object.assign(headers, this.getAnthropicBetaHeader());
		} else if (this._modelUrl.includes('openai.azure')) {
			headers['api-key'] = this._apiKey;
		} else {
			headers['Authorization'] = `Bearer ${this._apiKey}`;
		}
		for (const [key, value] of Object.entries(this._customHeaders)) {
			headers[key] = value;
		}
		return headers;
	}
}
