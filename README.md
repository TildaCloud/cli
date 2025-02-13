@tildacloud/cli
=================

A new CLI generated with oclif


[![oclif](https://img.shields.io/badge/cli-oclif-brightgreen.svg)](https://oclif.io)
[![Version](https://img.shields.io/npm/v/@tildacloud/cli.svg)](https://npmjs.org/package/@tildacloud/cli)
[![Downloads/week](https://img.shields.io/npm/dw/@tildacloud/cli.svg)](https://npmjs.org/package/@tildacloud/cli)


<!-- toc -->
* [Usage](#usage)
* [Commands](#commands)
<!-- tocstop -->
# Usage
<!-- usage -->
```sh-session
$ npm install -g @tildacloud/cli
$ tilda COMMAND
running command...
$ tilda (--version)
@tildacloud/cli/0.50.0 darwin-arm64 node-v20.18.2
$ tilda --help [COMMAND]
USAGE
  $ tilda COMMAND
...
```
<!-- usagestop -->
# Commands
<!-- commands -->
* [`tilda build`](#tilda-build)
* [`tilda build astro`](#tilda-build-astro)
* [`tilda build nextjs`](#tilda-build-nextjs)
* [`tilda build nuxt`](#tilda-build-nuxt)
* [`tilda build qwik`](#tilda-build-qwik)
* [`tilda build static`](#tilda-build-static)
* [`tilda build svelte`](#tilda-build-svelte)
* [`tilda deploy`](#tilda-deploy)
* [`tilda deployment-key create`](#tilda-deployment-key-create)
* [`tilda help [COMMAND]`](#tilda-help-command)
* [`tilda login`](#tilda-login)
* [`tilda logout`](#tilda-logout)
* [`tilda plugins`](#tilda-plugins)
* [`tilda plugins add PLUGIN`](#tilda-plugins-add-plugin)
* [`tilda plugins:inspect PLUGIN...`](#tilda-pluginsinspect-plugin)
* [`tilda plugins install PLUGIN`](#tilda-plugins-install-plugin)
* [`tilda plugins link PATH`](#tilda-plugins-link-path)
* [`tilda plugins remove [PLUGIN]`](#tilda-plugins-remove-plugin)
* [`tilda plugins reset`](#tilda-plugins-reset)
* [`tilda plugins uninstall [PLUGIN]`](#tilda-plugins-uninstall-plugin)
* [`tilda plugins unlink [PLUGIN]`](#tilda-plugins-unlink-plugin)
* [`tilda plugins update`](#tilda-plugins-update)

## `tilda build`

Build the application

```
USAGE
  $ tilda build --apiOrigin <value> --serverDir <value> --projectDir <value> --serverEntryFile <value>
    [--json] [--inlineIdentityJson <value>] [--rootStaticDir <value>...] [--underscoreNamedStaticDir <value>]

FLAGS
  --apiOrigin=<value>                 (required) [default: https://tilda.net] API origin
  --inlineIdentityJson=<value>        Private key config. Must be of type { privateKey: string, keyId: number }
  --projectDir=<value>                (required) Relative path project directory
  --rootStaticDir=<value>...          Relative path to static files directory that will be served from root (/)
  --serverDir=<value>                 (required) Relative path to server files directory
  --serverEntryFile=<value>           (required) Relative path to server entry file
  --underscoreNamedStaticDir=<value>  Relative path to static files directory that will be served from relative path
                                      with "." replaced with "_"

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Build the application
```

_See code: [src/commands/build/index.ts](https://github.com/TildaCloud/cli/blob/v0.50.0/src/commands/build/index.ts)_

## `tilda build astro`

Build an Astro project

```
USAGE
  $ tilda build astro --apiOrigin <value> --projectDir <value> --buildCommand <value> [--json]
    [--inlineIdentityJson <value>]

FLAGS
  --apiOrigin=<value>           (required) [default: https://tilda.net] API origin
  --buildCommand=<value>        (required) [default: npm run build] Astro build command
  --inlineIdentityJson=<value>  Private key config. Must be of type { privateKey: string, keyId: number }
  --projectDir=<value>          (required) [default: /Users/raeesbhatti/Projects/TildaCloud/cli] Relative path project
                                directory

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Build an Astro project
```

_See code: [src/commands/build/astro/index.ts](https://github.com/TildaCloud/cli/blob/v0.50.0/src/commands/build/astro/index.ts)_

## `tilda build nextjs`

Build Next.js project

```
USAGE
  $ tilda build nextjs --apiOrigin <value> --projectDir <value> --buildCommand <value> [--json]
    [--inlineIdentityJson <value>]

FLAGS
  --apiOrigin=<value>           (required) [default: https://tilda.net] API origin
  --buildCommand=<value>        (required) [default: npm run build] Next.js build command
  --inlineIdentityJson=<value>  Private key config. Must be of type { privateKey: string, keyId: number }
  --projectDir=<value>          (required) [default: /Users/raeesbhatti/Projects/TildaCloud/cli] Relative path project
                                directory

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Build Next.js project
```

_See code: [src/commands/build/nextjs/index.ts](https://github.com/TildaCloud/cli/blob/v0.50.0/src/commands/build/nextjs/index.ts)_

## `tilda build nuxt`

Build Nuxt project

```
USAGE
  $ tilda build nuxt --apiOrigin <value> --projectDir <value> --buildCommand <value> [--json]
    [--inlineIdentityJson <value>]

FLAGS
  --apiOrigin=<value>           (required) [default: https://tilda.net] API origin
  --buildCommand=<value>        (required) [default: npm run build] Nuxt build command
  --inlineIdentityJson=<value>  Private key config. Must be of type { privateKey: string, keyId: number }
  --projectDir=<value>          (required) [default: /Users/raeesbhatti/Projects/TildaCloud/cli] Relative path project
                                directory

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Build Nuxt project
```

_See code: [src/commands/build/nuxt/index.ts](https://github.com/TildaCloud/cli/blob/v0.50.0/src/commands/build/nuxt/index.ts)_

## `tilda build qwik`

Build Qwik City project

```
USAGE
  $ tilda build qwik --apiOrigin <value> --projectDir <value> --buildCommand <value> [--json]
    [--inlineIdentityJson <value>]

FLAGS
  --apiOrigin=<value>           (required) [default: https://tilda.net] API origin
  --buildCommand=<value>        (required) [default: npm run build] Qwik City build command
  --inlineIdentityJson=<value>  Private key config. Must be of type { privateKey: string, keyId: number }
  --projectDir=<value>          (required) [default: /Users/raeesbhatti/Projects/TildaCloud/cli] Relative path project
                                directory

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Build Qwik City project
```

_See code: [src/commands/build/qwik/index.ts](https://github.com/TildaCloud/cli/blob/v0.50.0/src/commands/build/qwik/index.ts)_

## `tilda build static`

Build a static website

```
USAGE
  $ tilda build static --apiOrigin <value> --projectDir <value> --buildCommand <value> --rootStaticDir <value>
    [--json] [--inlineIdentityJson <value>] [--skipAppBuild]

FLAGS
  --apiOrigin=<value>           (required) [default: https://tilda.net] API origin
  --buildCommand=<value>        (required) [default: npm run build] Application build command
  --inlineIdentityJson=<value>  Private key config. Must be of type { privateKey: string, keyId: number }
  --projectDir=<value>          (required) [default: /Users/raeesbhatti/Projects/TildaCloud/cli] Relative path project
                                directory
  --rootStaticDir=<value>       (required) Relative path to static files directory that will be served from root (/)
  --skipAppBuild                Skip running build command

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Build a static website
```

_See code: [src/commands/build/static/index.ts](https://github.com/TildaCloud/cli/blob/v0.50.0/src/commands/build/static/index.ts)_

## `tilda build svelte`

Build Svelte project

```
USAGE
  $ tilda build svelte --apiOrigin <value> --projectDir <value> --buildCommand <value> [--json]
    [--inlineIdentityJson <value>]

FLAGS
  --apiOrigin=<value>           (required) [default: https://tilda.net] API origin
  --buildCommand=<value>        (required) [default: npm run build] Svelte build command
  --inlineIdentityJson=<value>  Private key config. Must be of type { privateKey: string, keyId: number }
  --projectDir=<value>          (required) [default: /Users/raeesbhatti/Projects/TildaCloud/cli] Relative path project
                                directory

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Build Svelte project
```

_See code: [src/commands/build/svelte/index.ts](https://github.com/TildaCloud/cli/blob/v0.50.0/src/commands/build/svelte/index.ts)_

## `tilda deploy`

Build the application

```
USAGE
  $ tilda deploy --apiOrigin <value> --projectDir <value> --project <value> --site <value> --runtime <value>
    [--json] [--inlineIdentityJson <value>]

FLAGS
  --apiOrigin=<value>           (required) [default: https://tilda.net] API origin
  --inlineIdentityJson=<value>  Private key config. Must be of type { privateKey: string, keyId: number }
  --project=<value>             (required) Project slug
  --projectDir=<value>          (required) [default: .] Relative path to project directory
  --runtime=<value>             (required) [default: nodejs20.x] Runtime
  --site=<value>                (required) Site slug

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Build the application
```

_See code: [src/commands/deploy/index.ts](https://github.com/TildaCloud/cli/blob/v0.50.0/src/commands/deploy/index.ts)_

## `tilda deployment-key create`

Create a deployment key

```
USAGE
  $ tilda deployment-key create --apiOrigin <value> --project <value> [--json] [--inlineIdentityJson <value>] [--site
    <value>]

FLAGS
  --apiOrigin=<value>           (required) [default: https://tilda.net] API origin
  --inlineIdentityJson=<value>  Private key config. Must be of type { privateKey: string, keyId: number }
  --project=<value>             (required) Project slug
  --site=<value>                Site slug

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Create a deployment key
```

_See code: [src/commands/deployment-key/create/index.ts](https://github.com/TildaCloud/cli/blob/v0.50.0/src/commands/deployment-key/create/index.ts)_

## `tilda help [COMMAND]`

Display help for tilda.

```
USAGE
  $ tilda help [COMMAND...] [-n]

ARGUMENTS
  COMMAND...  Command to show help for.

FLAGS
  -n, --nested-commands  Include all nested commands in the output.

DESCRIPTION
  Display help for tilda.
```

_See code: [@oclif/plugin-help](https://github.com/oclif/plugin-help/blob/v6.2.13/src/commands/help.ts)_

## `tilda login`

Log in to Tilda

```
USAGE
  $ tilda login --apiOrigin <value> [--json] [--inlineIdentityJson <value>]

FLAGS
  --apiOrigin=<value>           (required) [default: https://tilda.net] API origin
  --inlineIdentityJson=<value>  Private key config. Must be of type { privateKey: string, keyId: number }

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Log in to Tilda
```

_See code: [src/commands/login/index.ts](https://github.com/TildaCloud/cli/blob/v0.50.0/src/commands/login/index.ts)_

## `tilda logout`

Log in to Tilda

```
USAGE
  $ tilda logout --apiOrigin <value> [--json] [--inlineIdentityJson <value>] [--force]

FLAGS
  --apiOrigin=<value>           (required) [default: https://tilda.net] API origin
  --force                       Force logout
  --inlineIdentityJson=<value>  Private key config. Must be of type { privateKey: string, keyId: number }

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Log in to Tilda
```

_See code: [src/commands/logout/index.ts](https://github.com/TildaCloud/cli/blob/v0.50.0/src/commands/logout/index.ts)_

## `tilda plugins`

List installed plugins.

```
USAGE
  $ tilda plugins [--json] [--core]

FLAGS
  --core  Show core plugins.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  List installed plugins.

EXAMPLES
  $ tilda plugins
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v5.4.10/src/commands/plugins/index.ts)_

## `tilda plugins add PLUGIN`

Installs a plugin into tilda.

```
USAGE
  $ tilda plugins add PLUGIN... [--json] [-f] [-h] [-s | -v]

ARGUMENTS
  PLUGIN...  Plugin to install.

FLAGS
  -f, --force    Force npm to fetch remote resources even if a local copy exists on disk.
  -h, --help     Show CLI help.
  -s, --silent   Silences npm output.
  -v, --verbose  Show verbose npm output.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Installs a plugin into tilda.

  Uses npm to install plugins.

  Installation of a user-installed plugin will override a core plugin.

  Use the TILDA_NPM_LOG_LEVEL environment variable to set the npm loglevel.
  Use the TILDA_NPM_REGISTRY environment variable to set the npm registry.

ALIASES
  $ tilda plugins add

EXAMPLES
  Install a plugin from npm registry.

    $ tilda plugins add myplugin

  Install a plugin from a github url.

    $ tilda plugins add https://github.com/someuser/someplugin

  Install a plugin from a github slug.

    $ tilda plugins add someuser/someplugin
```

## `tilda plugins:inspect PLUGIN...`

Displays installation properties of a plugin.

```
USAGE
  $ tilda plugins inspect PLUGIN...

ARGUMENTS
  PLUGIN...  [default: .] Plugin to inspect.

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Displays installation properties of a plugin.

EXAMPLES
  $ tilda plugins inspect myplugin
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v5.4.10/src/commands/plugins/inspect.ts)_

## `tilda plugins install PLUGIN`

Installs a plugin into tilda.

```
USAGE
  $ tilda plugins install PLUGIN... [--json] [-f] [-h] [-s | -v]

ARGUMENTS
  PLUGIN...  Plugin to install.

FLAGS
  -f, --force    Force npm to fetch remote resources even if a local copy exists on disk.
  -h, --help     Show CLI help.
  -s, --silent   Silences npm output.
  -v, --verbose  Show verbose npm output.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Installs a plugin into tilda.

  Uses npm to install plugins.

  Installation of a user-installed plugin will override a core plugin.

  Use the TILDA_NPM_LOG_LEVEL environment variable to set the npm loglevel.
  Use the TILDA_NPM_REGISTRY environment variable to set the npm registry.

ALIASES
  $ tilda plugins add

EXAMPLES
  Install a plugin from npm registry.

    $ tilda plugins install myplugin

  Install a plugin from a github url.

    $ tilda plugins install https://github.com/someuser/someplugin

  Install a plugin from a github slug.

    $ tilda plugins install someuser/someplugin
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v5.4.10/src/commands/plugins/install.ts)_

## `tilda plugins link PATH`

Links a plugin into the CLI for development.

```
USAGE
  $ tilda plugins link PATH [-h] [--install] [-v]

ARGUMENTS
  PATH  [default: .] path to plugin

FLAGS
  -h, --help          Show CLI help.
  -v, --verbose
      --[no-]install  Install dependencies after linking the plugin.

DESCRIPTION
  Links a plugin into the CLI for development.
  Installation of a linked plugin will override a user-installed or core plugin.

  e.g. If you have a user-installed or core plugin that has a 'hello' command, installing a linked plugin with a 'hello'
  command will override the user-installed or core plugin implementation. This is useful for development work.


EXAMPLES
  $ tilda plugins link myplugin
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v5.4.10/src/commands/plugins/link.ts)_

## `tilda plugins remove [PLUGIN]`

Removes a plugin from the CLI.

```
USAGE
  $ tilda plugins remove [PLUGIN...] [-h] [-v]

ARGUMENTS
  PLUGIN...  plugin to uninstall

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Removes a plugin from the CLI.

ALIASES
  $ tilda plugins unlink
  $ tilda plugins remove

EXAMPLES
  $ tilda plugins remove myplugin
```

## `tilda plugins reset`

Remove all user-installed and linked plugins.

```
USAGE
  $ tilda plugins reset [--hard] [--reinstall]

FLAGS
  --hard       Delete node_modules and package manager related files in addition to uninstalling plugins.
  --reinstall  Reinstall all plugins after uninstalling.
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v5.4.10/src/commands/plugins/reset.ts)_

## `tilda plugins uninstall [PLUGIN]`

Removes a plugin from the CLI.

```
USAGE
  $ tilda plugins uninstall [PLUGIN...] [-h] [-v]

ARGUMENTS
  PLUGIN...  plugin to uninstall

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Removes a plugin from the CLI.

ALIASES
  $ tilda plugins unlink
  $ tilda plugins remove

EXAMPLES
  $ tilda plugins uninstall myplugin
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v5.4.10/src/commands/plugins/uninstall.ts)_

## `tilda plugins unlink [PLUGIN]`

Removes a plugin from the CLI.

```
USAGE
  $ tilda plugins unlink [PLUGIN...] [-h] [-v]

ARGUMENTS
  PLUGIN...  plugin to uninstall

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Removes a plugin from the CLI.

ALIASES
  $ tilda plugins unlink
  $ tilda plugins remove

EXAMPLES
  $ tilda plugins unlink myplugin
```

## `tilda plugins update`

Update installed plugins.

```
USAGE
  $ tilda plugins update [-h] [-v]

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Update installed plugins.
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v5.4.10/src/commands/plugins/update.ts)_
<!-- commandsstop -->
