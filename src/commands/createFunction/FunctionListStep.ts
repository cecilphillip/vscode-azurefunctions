/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardExecuteStep, AzureWizardPromptStep, IAzureQuickPickItem, IAzureQuickPickOptions, IWizardOptions } from 'vscode-azureextensionui';
import { ProjectLanguage, ProjectRuntime, TemplateFilter, templateFilterSetting } from '../../constants';
import { ext } from '../../extensionVariables';
import { getAzureWebJobsStorage } from '../../funcConfig/local.settings';
import { localize } from '../../localize';
import { IFunctionTemplate } from '../../templates/IFunctionTemplate';
import { TemplateProvider } from '../../templates/TemplateProvider';
import { nonNullProp } from '../../utils/nonNull';
import { getWorkspaceSetting, updateWorkspaceSetting } from '../../vsCodeConfig/settings';
import { addBindingSettingSteps } from '../addBinding/settingSteps/addBindingSettingSteps';
import { AzureWebJobsStorageExecuteStep } from '../appSettings/AzureWebJobsStorageExecuteStep';
import { AzureWebJobsStoragePromptStep } from '../appSettings/AzureWebJobsStoragePromptStep';
import { JavaPackageNameStep } from '../createNewProject/javaSteps/JavaPackageNameStep';
import { DotnetFunctionCreateStep } from './dotnetSteps/DotnetFunctionCreateStep';
import { DotnetFunctionNameStep } from './dotnetSteps/DotnetFunctionNameStep';
import { DotnetNamespaceStep } from './dotnetSteps/DotnetNamespaceStep';
import { IFunctionWizardContext } from './IFunctionWizardContext';
import { JavaFunctionCreateStep } from './javaSteps/JavaFunctionCreateStep';
import { JavaFunctionNameStep } from './javaSteps/JavaFunctionNameStep';
import { ScriptFunctionCreateStep } from './scriptSteps/ScriptFunctionCreateStep';
import { ScriptFunctionNameStep } from './scriptSteps/ScriptFunctionNameStep';
import { TypeScriptFunctionCreateStep } from './scriptSteps/TypeScriptFunctionCreateStep';

export class FunctionListStep extends AzureWizardPromptStep<IFunctionWizardContext> {
    public hideStepCount: boolean = true;

    private _triggerSettings: { [key: string]: string | undefined };
    private _isProjectWizard: boolean;

    private constructor(triggerSettings: { [key: string]: string | undefined } | undefined, isProjectWizard: boolean | undefined) {
        super();
        // tslint:disable-next-line: strict-boolean-expressions
        this._triggerSettings = triggerSettings || {};
        this._isProjectWizard = !!isProjectWizard;
    }

    public static async create(wizardContext: IFunctionWizardContext, options: IFunctionListStepOptions): Promise<FunctionListStep> {
        if (options.templateId) {
            const language: ProjectLanguage = nonNullProp(wizardContext, 'language');
            const runtime: ProjectRuntime = nonNullProp(wizardContext, 'runtime');
            const templateProvider: TemplateProvider = await ext.templateProviderTask;
            const templates: IFunctionTemplate[] = await templateProvider.getTemplates(language, runtime, wizardContext.projectPath, TemplateFilter.All, wizardContext.actionContext.properties);
            const foundTemplate: IFunctionTemplate | undefined = templates.find((t: IFunctionTemplate) => t.id === options.templateId);
            if (foundTemplate) {
                wizardContext.functionTemplate = foundTemplate;
            } else {
                throw new Error(localize('templateNotFound', 'Could not find template with language "{0}", runtime "{1}", and id "{2}".', wizardContext.language, wizardContext.runtime, options.templateId));
            }
        }

        return new FunctionListStep(options.triggerSettings, options.isProjectWizard);
    }

    public async getSubWizard(wizardContext: IFunctionWizardContext): Promise<IWizardOptions<IFunctionWizardContext> | undefined> {
        const template: IFunctionTemplate | undefined = wizardContext.functionTemplate;
        if (template) {
            const promptSteps: AzureWizardPromptStep<IFunctionWizardContext>[] = [];
            switch (wizardContext.language) {
                case ProjectLanguage.Java:
                    promptSteps.push(new JavaPackageNameStep(), new JavaFunctionNameStep());
                    break;
                case ProjectLanguage.CSharp:
                case ProjectLanguage.FSharp:
                    promptSteps.push(new DotnetFunctionNameStep(), new DotnetNamespaceStep());
                    break;
                default:
                    promptSteps.push(new ScriptFunctionNameStep());
                    break;
            }

            // Add settings to wizardContext that were programatically passed in
            for (const key of Object.keys(this._triggerSettings)) {
                wizardContext[key.toLowerCase()] = this._triggerSettings[key];
            }

            addBindingSettingSteps(template.userPromptedSettings, promptSteps);

            const executeSteps: AzureWizardExecuteStep<IFunctionWizardContext>[] = [];
            switch (wizardContext.language) {
                case ProjectLanguage.Java:
                    executeSteps.push(await JavaFunctionCreateStep.createStep(wizardContext.actionContext));
                    break;
                case ProjectLanguage.CSharp:
                case ProjectLanguage.FSharp:
                    executeSteps.push(await DotnetFunctionCreateStep.createStep(wizardContext.actionContext));
                    break;
                case ProjectLanguage.TypeScript:
                    executeSteps.push(new TypeScriptFunctionCreateStep());
                    break;
                default:
                    executeSteps.push(new ScriptFunctionCreateStep());
                    break;
            }

            if (!template.isHttpTrigger && !await getAzureWebJobsStorage(wizardContext.projectPath)) {
                promptSteps.push(new AzureWebJobsStoragePromptStep());
                executeSteps.push(new AzureWebJobsStorageExecuteStep());
            }

            const title: string = localize('createFunction', 'Create new {0}', template.name);
            return { promptSteps, executeSteps, title };
        } else {
            return undefined;
        }
    }

    public async prompt(wizardContext: IFunctionWizardContext): Promise<void> {
        // tslint:disable-next-line: strict-boolean-expressions
        let templateFilter: TemplateFilter = getWorkspaceSetting<TemplateFilter>(templateFilterSetting, wizardContext.projectPath) || TemplateFilter.Verified;

        while (!wizardContext.functionTemplate) {
            const placeHolder: string = this._isProjectWizard ?
                localize('selectFirstFuncTemplate', "Select a template for your project's first function") :
                localize('selectFuncTemplate', 'Select a template for your function');
            const result: IFunctionTemplate | TemplatePromptResult = (await ext.ui.showQuickPick(this.getPicks(wizardContext, templateFilter), { placeHolder })).data;
            if (result === 'skipForNow') {
                wizardContext.actionContext.properties.templateId = 'skipForNow';
                break;
            } else if (result === 'changeFilter') {
                templateFilter = await promptForTemplateFilter();
                // can only update setting if it's open in a workspace
                if (!this._isProjectWizard || wizardContext.openBehavior === 'AlreadyOpen') {
                    await updateWorkspaceSetting(templateFilterSetting, templateFilter, wizardContext.projectPath);
                }
            } else {
                wizardContext.functionTemplate = result;
            }
        }

        wizardContext.actionContext.properties.templateFilter = templateFilter;
    }

    public shouldPrompt(wizardContext: IFunctionWizardContext): boolean {
        return !wizardContext.functionTemplate;
    }

    private async getPicks(wizardContext: IFunctionWizardContext, templateFilter: TemplateFilter): Promise<IAzureQuickPickItem<IFunctionTemplate | TemplatePromptResult>[]> {
        const language: ProjectLanguage = nonNullProp(wizardContext, 'language');
        const runtime: ProjectRuntime = nonNullProp(wizardContext, 'runtime');

        const provider: TemplateProvider = await ext.templateProviderTask;
        let templates: IFunctionTemplate[] = await provider.getTemplates(language, runtime, wizardContext.projectPath, templateFilter, wizardContext.actionContext.properties);
        templates = templates.sort((a, b) => sortTemplates(a, b, templateFilter));

        const picks: IAzureQuickPickItem<IFunctionTemplate | TemplatePromptResult>[] = templates.map(t => { return { label: t.name, data: t }; });

        if (this._isProjectWizard) {
            picks.unshift({
                label: localize('skipForNow', '$(clock) Skip for now'),
                data: 'skipForNow',
                suppressPersistence: true
            });
        }

        picks.push({
            label: localize('selectFilter', '$(gear) Change template filter'),
            description: localize('currentFilter', 'Current: {0}', templateFilter),
            data: 'changeFilter',
            suppressPersistence: true
        });

        return picks;
    }
}

interface IFunctionListStepOptions {
    isProjectWizard: boolean;
    templateId: string | undefined;
    triggerSettings: { [key: string]: string | undefined } | undefined;
}

type TemplatePromptResult = 'changeFilter' | 'skipForNow';

async function promptForTemplateFilter(): Promise<TemplateFilter> {
    const picks: IAzureQuickPickItem<TemplateFilter>[] = [
        { label: TemplateFilter.Verified, description: localize('verifiedDescription', '(Subset of "Core" that has been verified in VS Code)'), data: TemplateFilter.Verified },
        { label: TemplateFilter.Core, data: TemplateFilter.Core },
        { label: TemplateFilter.All, data: TemplateFilter.All }
    ];

    const options: IAzureQuickPickOptions = { suppressPersistence: true, placeHolder: localize('selectFilter', 'Select a template filter') };
    return (await ext.ui.showQuickPick(picks, options)).data;
}

/**
 * If templateFilter is verified, puts HttpTrigger at the top since it's the most popular
 * Otherwise sort alphabetically
 */
function sortTemplates(a: IFunctionTemplate, b: IFunctionTemplate, templateFilter: TemplateFilter): number {
    if (templateFilter === TemplateFilter.Verified) {
        const regExp: RegExp = /httptrigger($|[^a-z])/i;
        if (regExp.test(a.id)) {
            return -1;
        } else if (regExp.test(b.id)) {
            return 1;
        }
    }

    return a.name.localeCompare(b.name);
}
