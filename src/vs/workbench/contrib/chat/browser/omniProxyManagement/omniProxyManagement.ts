/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RawContextKey } from '../../../../../platform/contextkey/common/contextkey.js';

export const OMNI_PROXY_MANAGEMENT_EDITOR_ID = 'workbench.editor.omniProxyManagement';
export const OMNI_PROXY_MANAGEMENT_EDITOR_INPUT_ID = 'workbench.input.omniProxyManagement';
export const OPEN_OMNI_PROXY_MANAGEMENT_COMMAND_ID = 'workbench.action.omniProxy.manage';
export const REFRESH_OMNI_PROXY_MANAGEMENT_COMMAND_ID = 'workbench.action.omniProxy.refresh';
export const OMNI_PROXY_SELECTED_SECTION_STORAGE_KEY = 'omniProxyManagement.selectedSection';
export const CONTEXT_OMNI_PROXY_MANAGEMENT_EDITOR = new RawContextKey<boolean>('inOmniProxyManagementEditor', false);

export const enum OmniProxyManagementSection {
	Home = 'home',
	Providers = 'providers',
	Combos = 'combos',
	BatchTesting = 'batchTesting',
	Costs = 'costs',
	Analytics = 'analytics',
	Cache = 'cache',
	Limits = 'limits',
	Media = 'media',
}
