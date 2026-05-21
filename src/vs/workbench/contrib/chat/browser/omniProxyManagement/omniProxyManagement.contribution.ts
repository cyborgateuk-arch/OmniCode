/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize, localize2 } from '../../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { IInstantiationService, ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { registerIcon } from '../../../../../platform/theme/common/iconRegistry.js';
import { IEditorPaneRegistry, EditorPaneDescriptor } from '../../../../browser/editor.js';
import { EditorExtensions, IEditorFactoryRegistry, IEditorSerializer } from '../../../../common/editor.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../common/contributions.js';
import { OmniProxyManagementEditor } from './omniProxyManagementEditor.js';
import { OmniProxyManagementEditorInput } from './omniProxyManagementEditorInput.js';
import { CONTEXT_OMNI_PROXY_MANAGEMENT_EDITOR, OPEN_OMNI_PROXY_MANAGEMENT_COMMAND_ID, OMNI_PROXY_MANAGEMENT_EDITOR_INPUT_ID, REFRESH_OMNI_PROXY_MANAGEMENT_COMMAND_ID } from './omniProxyManagement.js';

const omniProxyRefreshIcon = registerIcon('omni-proxy-refresh', Codicon.refresh, localize('omniProxyRefreshIcon', 'Icon for refreshing the OmniProxy dashboard.'));
const omniProxyOpenIcon = registerIcon('omni-proxy-open', Codicon.serverEnvironment, localize('omniProxyOpenIcon', 'Icon for opening the OmniProxy dashboard.'));

Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(
		OmniProxyManagementEditor,
		OmniProxyManagementEditor.ID,
		localize('omniProxyManagementEditor', 'OmniProxy')
	),
	[
		new SyncDescriptor(OmniProxyManagementEditorInput)
	]
);

class OmniProxyManagementEditorInputSerializer implements IEditorSerializer {

	canSerialize(_editorInput: EditorInput): boolean {
		return true;
	}

	serialize(_input: OmniProxyManagementEditorInput): string {
		return '';
	}

	deserialize(instantiationService: IInstantiationService): OmniProxyManagementEditorInput {
		return instantiationService.createInstance(OmniProxyManagementEditorInput);
	}
}

Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).registerEditorSerializer(OMNI_PROXY_MANAGEMENT_EDITOR_INPUT_ID, OmniProxyManagementEditorInputSerializer);

class OmniProxyManagementActionsContribution implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.omniProxyManagementActions';

	constructor() {
		this.registerActions();
	}

	private registerActions(): void {
		registerAction2(class extends Action2 {
			constructor() {
				super({
					id: OPEN_OMNI_PROXY_MANAGEMENT_COMMAND_ID,
					title: localize2('openOmniProxyManagement', 'Open OmniProxy'),
					f1: true,
					icon: omniProxyOpenIcon,
				});
			}

			async run(accessor: ServicesAccessor) {
				return accessor.get(IEditorService).openEditor(new OmniProxyManagementEditorInput(), { pinned: true });
			}
		});

		registerAction2(class extends Action2 {
			constructor() {
				super({
					id: REFRESH_OMNI_PROXY_MANAGEMENT_COMMAND_ID,
					title: localize2('refreshOmniProxyManagement', 'Refresh OmniProxy'),
					f1: false,
					icon: omniProxyRefreshIcon,
					menu: [{
						id: MenuId.EditorTitle,
						when: CONTEXT_OMNI_PROXY_MANAGEMENT_EDITOR,
						group: 'navigation',
						order: 1
					}, {
						id: MenuId.ModalEditorEditorTitle,
						when: CONTEXT_OMNI_PROXY_MANAGEMENT_EDITOR,
						group: 'navigation',
						order: 1
					}]
				});
			}

			async run(accessor: ServicesAccessor) {
				const editorPane = accessor.get(IEditorService).activeEditorPane;
				if (editorPane instanceof OmniProxyManagementEditor) {
					await editorPane.refreshDashboard();
				}
			}
		});
	}
}

registerWorkbenchContribution2(OmniProxyManagementActionsContribution.ID, OmniProxyManagementActionsContribution, WorkbenchPhase.AfterRestored);
