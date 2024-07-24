import minimist from "minimist"
import {cyan, green, red, reset, yellow} from "kolorist"
import prompts from "prompts"
import * as fs from "node:fs"
import * as path from "node:path"

function formatTargetDir(targetDir: string | undefined) {
    return targetDir?.trim().replace(/\/+$/g, '')
}

function isEmpty(path: string) {
    const files = fs.readdirSync(path)
    return files.length === 0 || (files.length === 1 && files[0] === '.git')
}

function emptyDir(dir: string) {
    if (!fs.existsSync(dir)) {
        return
    }
    for (const file of fs.readdirSync(dir)) {
        if (file === '.git') {
            continue
        }
        fs.rmSync(path.resolve(dir, file), { recursive: true, force: true })
    }
}

function isValidPackageName(projectName: string) {
    return /^(?:@[a-z\d\-*~][a-z\d\-*._~]*\/)?[a-z\d\-~][a-z\d\-._~]*$/.test(
        projectName,
    )
}

function toValidPackageName(projectName: string) {
    return projectName
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/^[._]/, '')
        .replace(/[^a-z\d\-~]+/g, '-')
}

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

async function init() {
    const argTargetDir = formatTargetDir(argv._[0])
    const argTemplate = argv.template ?? argv.t

    const help = argv.help
    if (help) {
        console.log(helpMessage)
        return
    }

    let targetDir = argTargetDir || defaultTargetDir
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
                        const frameworkColor = template.color
                        return {
                            title: frameworkColor(template.display || template.name),
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
        console.log(`\nUpdating project: ${root}`)
        const pkgFile = path.resolve(root, 'package.json')
        const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf-8'))
        pkg.dependencies = {
            ...pkg.dependencies,
            postcss: '8.4.x'
        }
        fs.writeFileSync(pkgFile, JSON.stringify(pkg, null, 2))
    } else {
        const chosenTemplate = template?.name ?? argTemplate
        console.log(`\nScaffolding project in ${root}...`)
        console.log(`\nUsing template: ${chosenTemplate}`)

        const pkg = { name: packageName || getProjectName(), version: '0.0.0' }
        fs.writeFileSync(path.resolve(root, 'package.json'), JSON.stringify(pkg, null, 2))
    }
}

init().catch((e) => {
    console.error(e)
})