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
@tildacloud/cli/0.1.0 darwin-arm64 node-v20.12.2
$ tilda --help [COMMAND]
USAGE
  $ tilda COMMAND
...
```
<!-- usagestop -->
# Commands
<!-- commands -->
* [`tilda hello PERSON`](#tilda-hello-person)
* [`tilda hello world`](#tilda-hello-world)
* [`tilda help [COMMAND]`](#tilda-help-command)
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

## `tilda hello PERSON`

Say hello

```
USAGE
  $ tilda hello PERSON -f <value>

ARGUMENTS
  PERSON  Person to say hello to

FLAGS
  -f, --from=<value>  (required) Who is saying hello

DESCRIPTION
  Say hello

EXAMPLES
  $ tilda hello friend --from oclif
  hello friend from oclif! (./src/commands/hello/index.ts)
```

_See code: [src/commands/hello/index.ts](https://github.com/TildaCloud/cli/blob/v0.1.0/src/commands/hello/index.ts)_

## `tilda hello world`

Say hello world

```
USAGE
  $ tilda hello world

DESCRIPTION
  Say hello world

EXAMPLES
  $ tilda hello world
  hello world! (./src/commands/hello/world.ts)
```

_See code: [src/commands/hello/world.ts](https://github.com/TildaCloud/cli/blob/v0.1.0/src/commands/hello/world.ts)_

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
