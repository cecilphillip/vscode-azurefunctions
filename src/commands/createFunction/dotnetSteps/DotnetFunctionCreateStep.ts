/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import { IActionContext } from 'vscode-azureextensionui';
import { ProjectRuntime } from '../../../constants';
import { executeDotnetTemplateCommand } from '../../../templates/executeDotnetTemplateCommand';
import { IFunctionTemplate } from '../../../templates/IFunctionTemplate';
import { cpUtils } from '../../../utils/cpUtils';
import { dotnetUtils } from '../../../utils/dotnetUtils';
import { nonNullProp } from '../../../utils/nonNull';
import { FunctionCreateStepBase } from '../FunctionCreateStepBase';
import { getBindingSetting } from '../IFunctionWizardContext';
import { getFileExtension, IDotnetFunctionWizardContext } from './IDotnetFunctionWizardContext';

export class DotnetFunctionCreateStep extends FunctionCreateStepBase<IDotnetFunctionWizardContext> {
    private constructor() {
        super();
    }

    public static async createStep(actionContext: IActionContext): Promise<DotnetFunctionCreateStep> {
        await dotnetUtils.validateDotnetInstalled(actionContext);
        return new DotnetFunctionCreateStep();
    }

    public async executeCore(wizardContext: IDotnetFunctionWizardContext): Promise<string> {
        const template: IFunctionTemplate = nonNullProp(wizardContext, 'functionTemplate');

        const functionName: string = nonNullProp(wizardContext, 'functionName');
        const args: string[] = [];
        args.push('--arg:name');
        args.push(cpUtils.wrapArgInQuotes(functionName));

        args.push('--arg:namespace');
        args.push(cpUtils.wrapArgInQuotes(nonNullProp(wizardContext, 'namespace')));

        for (const setting of template.userPromptedSettings) {
            const value: string | undefined = getBindingSetting(wizardContext, setting);
            // NOTE: Explicitly checking against undefined. Empty string is a valid value
            if (value !== undefined) {
                args.push(`--arg:${setting.name}`);
                args.push(cpUtils.wrapArgInQuotes(value));
            }
        }

        const runtime: ProjectRuntime = nonNullProp(wizardContext, 'runtime');
        await executeDotnetTemplateCommand(runtime, wizardContext.projectPath, 'create', '--identity', template.id, ...args);

        return path.join(wizardContext.projectPath, functionName + getFileExtension(wizardContext));
    }
}
