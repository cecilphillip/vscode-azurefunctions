/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { window } from 'vscode';
import { AzureWizard, IActionContext } from 'vscode-azureextensionui';
import { ProjectLanguage, projectLanguageSetting, projectOpenBehaviorSetting, projectRuntimeSetting } from '../../constants';
import { addLocalFuncTelemetry } from '../../funcCoreTools/getLocalFuncCoreToolsVersion';
import { localize } from '../../localize';
import { convertStringToRuntime, getGlobalSetting, getWorkspaceSetting } from '../../vsCodeConfig/settings';
import { IFunctionWizardContext } from '../createFunction/IFunctionWizardContext';
import { FolderListStep } from './FolderListStep';
import { NewProjectLanguageStep } from './NewProjectLanguageStep';
import { OpenBehaviorStep } from './OpenBehaviorStep';
import { OpenFolderStep } from './OpenFolderStep';

export async function createNewProject(
    actionContext: IActionContext,
    projectPath?: string,
    language?: ProjectLanguage,
    runtime?: string,
    openFolder: boolean = true,
    templateId?: string,
    functionName?: string,
    triggerSettings?: { [key: string]: string | undefined }): Promise<void> {
    addLocalFuncTelemetry(actionContext);

    // tslint:disable-next-line: strict-boolean-expressions
    language = language || getGlobalSetting(projectLanguageSetting);
    runtime = runtime || getGlobalSetting(projectRuntimeSetting);

    const wizardContext: Partial<IFunctionWizardContext> = { actionContext, functionName, language, runtime: convertStringToRuntime(runtime) };

    if (projectPath) {
        FolderListStep.setProjectPath(wizardContext, projectPath);
    }

    if (!openFolder) {
        wizardContext.openBehavior = 'DontOpen';
    } else {
        wizardContext.openBehavior = getWorkspaceSetting(projectOpenBehaviorSetting);
        actionContext.properties.openBehaviorFromSetting = String(!!wizardContext.openBehavior);
    }

    const wizard: AzureWizard<IFunctionWizardContext> = new AzureWizard(wizardContext, {
        title: localize('createNewProject', 'Create new project'),
        promptSteps: [new FolderListStep(), new NewProjectLanguageStep(templateId, triggerSettings), new OpenBehaviorStep()],
        executeSteps: [new OpenFolderStep()]
    });
    await wizard.prompt(actionContext);
    await wizard.execute(actionContext);

    // don't wait
    window.showInformationMessage(localize('finishedCreating', 'Finished creating project.'));
}
