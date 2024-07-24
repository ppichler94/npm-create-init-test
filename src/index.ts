import minimist from "minimist"
import {cyan, green, red, reset, yellow} from "kolorist"
import prompts from "prompts"
import * as fs from "node:fs"
import * as path from "node:path"
import {copy, emptyDir, formatTargetDir, isEmpty, isValidPackageName, toValidPackageName} from "./util";

const argv = minimist<{
    template?: string
    help?: boolean
    update?: boolean
}>(process.argv.slice(2), {
    default: { help: false, update: false },
    alias: { h: 'help', t: 'template', u: 'update' },
    string: ['_'],
})
const cwd = process.cwd()

// prettier-ignore
const helpMessage = `\
Usage: create-init-test [OPTION]... [DIRECTORY]

Create a new JavaScript project.
With no arguments, start the CLI in interactive mode.

Options:
  -t, --template NAME        use a specific template
  -u, --update               update the dependencies of an existing project

Available templates:
${yellow   ('vanilla')}
${green    ('vue')}
${cyan     ('demo')}`

const defaultTargetDir = 'my-project'

const TEMPLATES = [
    {
        name: 'vanilla',
        display: 'Vanilla',
        color: yellow
    },
    {
        name: 'vue',
        display: 'Vue',
        color: green
    },
    {
        name: 'demo',
        display: 'Demo',
        color: cyan
    }
]

const TEMPLATE_NAMES = TEMPLATES.map((t) => t.name)

function updatePackageJson(root: string) {
    console.log(`\nUpdating project: ${root}`)
    const pkgFile = path.resolve(root, 'package.json')
    const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf-8'))
    pkg.dependencies = {
        ...pkg.dependencies,
        postcss: '8.4.x'
    }
    fs.writeFileSync(pkgFile, JSON.stringify(pkg, null, 2))
}

function renderTemplate(root: string, chosenTemplate: string, packageName: string) {
    console.log(`\nScaffolding project in ${root}...`)
    console.log(`\nUsing template: ${chosenTemplate}`)

    const templateDir = path.resolve(__dirname, 'template')
    copy(path.join(templateDir, chosenTemplate), root)

    const pkg = JSON.parse(fs.readFileSync(path.resolve(templateDir, 'package.json'), 'utf-8'))
    pkg.dependencies = {
        ...pkg.dependencies,
        postcss: '8.4.x'
    }
    pkg.name = packageName
    fs.writeFileSync(path.resolve(root, 'package.json'), JSON.stringify(pkg, null, 2))
}

async function init() {
    const argTargetDir = formatTargetDir(argv._[0])
    const argTemplate = argv.template ?? argv.t

    const help = argv.help
    if (help) {
        console.log(helpMessage)
        return
    }

    let targetDir = argTargetDir ?? defaultTargetDir
    const getProjectName = () =>
        targetDir === '.' ? path.basename(path.resolve()) : targetDir

    if (argv.update && targetDir !== '.' && !fs.existsSync(targetDir)) {
        return
    }

    let result: prompts.Answers<
        'projectName' | 'overwrite' | 'packageName' | 'template'
    >

    prompts.override({
        overwrite: argv.update ? 'update' : undefined,
    })

    try {
        result = await prompts(
            [
                {
                    type: argTargetDir || argv.update ? null : 'text',
                    name: 'projectName',
                    message: reset('Project name:'),
                    initial: defaultTargetDir,
                    onState: (state) => {
                        console.log(`projectName state change: ${state.value}`)
                        targetDir = formatTargetDir(state.value) || defaultTargetDir
                    },
                },
                {
                    type: () =>
                        !fs.existsSync(targetDir) || isEmpty(targetDir) ? null : 'select',
                    name: 'overwrite',
                    message: () =>
                        (targetDir === '.'
                            ? 'Current directory'
                            : `Target directory "${targetDir}"`) +
                        ` is not empty. Please choose how to proceed:`,
                    initial: 0,
                    choices: [
                        {
                            title: 'Remove existing files and continue',
                            value: 'yes',
                        },
                        {
                            title: 'Cancel operation',
                            value: 'no',
                        },
                        {
                            title: 'Update files',
                            value: 'update',
                        },
                    ],
                },
                {
                    type: (_, { overwrite }: { overwrite?: string }) => {
                        if (overwrite === 'no') {
                            throw new Error(red('✖') + ' Operation cancelled')
                        }
                        return null
                    },
                    name: 'overwriteChecker',
                },
                {
                    type: (_, { overwrite }: { overwrite?: string }) => (isValidPackageName(getProjectName()) || overwrite === 'update' ? null : 'text'),
                    name: 'packageName',
                    message: reset('Package name:'),
                    initial: () => toValidPackageName(getProjectName()),
                    validate: (dir) =>
                        isValidPackageName(dir) || 'Invalid package.json name',
                },
                {
                    type: (_, { overwrite }: { overwrite?: string }) =>
                        (argTemplate && TEMPLATE_NAMES.includes(argTemplate)) || overwrite === 'update' ? null : 'select',
                    name: 'template',
                    message:
                        typeof argTemplate === 'string' && !TEMPLATE_NAMES.includes(argTemplate)
                            ? reset(
                                `"${argTemplate}" isn't a valid template. Please choose from below: `,
                            )
                            : reset('Select a template:'),
                    initial: 0,
                    choices: TEMPLATES.map((template) => {
                        return {
                            title: template.color(template.display || template.name),
                            value: template,
                        }
                    }),
                },
            ],
            {
                onCancel: () => {
                    throw new Error(red('✖') + ' Operation cancelled')
                },
            },
        )
    } catch (cancelled: any) {
        console.log(cancelled.message)
        return
    }

    const { template, overwrite, packageName } = result

    const root = path.join(cwd, targetDir)

    if (overwrite === 'yes') {
        emptyDir(root)
    } else if (!fs.existsSync(root)) {
        fs.mkdirSync(root, { recursive: true })
    }

    if (overwrite === 'update') {
        updatePackageJson(root);
    } else {
        const chosenTemplate = template?.name ?? argTemplate
        renderTemplate(root, chosenTemplate, packageName ?? getProjectName());
    }
}

init().catch((e) => {
    console.error(e)
})
