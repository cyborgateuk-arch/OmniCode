/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import * as nls from '../../../../../nls.js';
import { registerIcon } from '../../../../../platform/theme/common/iconRegistry.js';
import { EditorInputCapabilities, IUntypedEditorInput } from '../../../../common/editor.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { OMNI_PROXY_MANAGEMENT_EDITOR_INPUT_ID } from './omniProxyManagement.js';

const omniProxyManagementEditorIcon = registerIcon('omni-proxy-management-editor-label-icon', Codicon.serverEnvironment, nls.localize('omniProxyManagementEditorLabelIcon', 'Icon of the OmniProxy management editor label.'));

export class OmniProxyManagementEditorInput extends EditorInput {

	static readonly ID: string = OMNI_PROXY_MANAGEMENT_EDITOR_INPUT_ID;

	readonly resource = undefined;

	override get capabilities(): EditorInputCapabilities {
		return super.capabilities | EditorInputCapabilities.Singleton | EditorInputCapabilities.RequiresModal;
	}

	override matches(otherInput: EditorInput | IUntypedEditorInput): boolean {
		return super.matches(otherInput) || otherInput instanceof OmniProxyManagementEditorInput;
	}

	override get typeId(): string {
		return OmniProxyManagementEditorInput.ID;
	}

	override getName(): string {
		return nls.localize('omniProxyManagementEditorInputName', 'OmniProxy');
	}

	override getIcon(): ThemeIcon {
		return omniProxyManagementEditorIcon;
	}

	override async resolve(): Promise<null> {
		return null;
	}
}
