/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append } from '../../../../../../base/browser/dom.js';
import { Button } from '../../../../../../base/browser/ui/button/button.js';
import { WorkbenchActionExecutedClassification, WorkbenchActionExecutedEvent } from '../../../../../../base/common/actions.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Disposable, IDisposable } from '../../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { localize } from '../../../../../../nls.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { defaultButtonStyles } from '../../../../../../platform/theme/browser/defaultStyles.js';
import { IChatEntitlementService } from '../../../../../services/chat/common/chatEntitlementService.js';
import { MANAGE_CHAT_COMMAND_ID } from '../../../common/constants.js';
import { IChatErrorDetailsPart, IChatRendererContent } from '../../../common/model/chatViewModel.js';
import { IChatContentPart } from './chatContentParts.js';

export class ChatAnonymousRateLimitedPart extends Disposable implements IChatContentPart {

	readonly domNode: HTMLElement;

	constructor(
		private readonly content: IChatErrorDetailsPart,
		@ICommandService commandService: ICommandService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IChatEntitlementService chatEntitlementService: IChatEntitlementService
	) {
		super();

		this.domNode = $('.chat-rate-limited-widget');

		const icon = append(this.domNode, $('span'));
		icon.classList.add(...ThemeIcon.asClassNameArray(Codicon.info));

		const messageContainer = append(this.domNode, $('.chat-rate-limited-message'));

		const message = append(messageContainer, $('div'));
		message.textContent = localize('anonymousRateLimited', "The current model isn't available. Choose or configure an OmniCode model to continue.");

		const signInButton = this._register(new Button(messageContainer, { ...defaultButtonStyles, supportIcons: true }));
		signInButton.label = localize('manageModels', "Manage models");
		signInButton.element.classList.add('chat-rate-limited-button');

		this._register(signInButton.onDidClick(async () => {
			const commandId = MANAGE_CHAT_COMMAND_ID;
			telemetryService.publicLog2<WorkbenchActionExecutedEvent, WorkbenchActionExecutedClassification>('workbenchActionExecuted', { id: commandId, from: 'chat-response' });

			await commandService.executeCommand(commandId);
		}));
	}

	hasSameContent(other: IChatRendererContent): boolean {
		return other.kind === this.content.kind && !!other.errorDetails.isRateLimited;
	}

	addDisposable(disposable: IDisposable): void {
		this._register(disposable);
	}
}
