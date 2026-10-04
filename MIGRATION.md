# Installation and Update Migration

The public repository keeps its original address for compiled release downloads. Its Git history is new and contains documentation only. Private development history has not been copied here.

## Compiled Installations

Use the launcher's Stable or Beta selector and update action. Newer launchers verify downloaded files against the release manifest. When an old launcher cannot complete the update, download and run the latest Windows installer once. Keep the existing installation and configuration; do not uninstall first.

The exact automatic replacement behavior depends on the launcher version. Close active work before an update. A running program can prevent Windows from replacing its files.

## Old Git-Based Installations

A checkout of the old development repository cannot fast-forward into this new documentation repository. Do not force-reset the checkout or delete your configuration to fix this.

On Windows, use the latest compiled installer from the download page. Keep the old checkout until your models, settings and required sessions have been checked in the installed application. Development and hosted-server operators need authorized access to the private source repository; that is not required for ordinary compiled users.

## Channels

Stable and Beta are separate choices. A prerelease does not automatically replace the Stable release. Existing saved channel choices should be preserved by supported installers.
