<p align="center">
  <a href="https://install.kingkung.men/downloads"><img src="readme/logo.png" alt="Codyx Orchestrator" width="375"></a>
</p>

<h1 align="center">Codyx-Orchestrator</h1>
<h3 align="center">A multi-agent assistant for your projects</h3>
<p align="center">Code, explore, and automate with local or online models.<br>Choose a terminal workspace or a browser-based Web UI.</p>
<p align="center"><sub>Built by M. Farid (Mufasa)</sub></p>

<p align="center">
  <a href="https://install.kingkung.men/downloads"><img src="https://img.shields.io/badge/Download-Windows_launcher-087EA4?style=for-the-badge" alt="Download the Windows launcher"></a>
  <a href="docs/USER_GUIDE.md"><img src="https://img.shields.io/badge/Read-User_guide-16856A?style=for-the-badge" alt="Read the user guide"></a>
  <a href="https://install.kingkung.men/feedback"><img src="https://img.shields.io/badge/Share-Feedback-C44176?style=for-the-badge" alt="Send feedback"></a>
</p>

<p align="center">
  <a href="https://github.com/mufasa1611/codyx-orchestrator/releases"><img src="https://img.shields.io/github/v/release/mufasa1611/codyx-orchestrator?include_prereleases&label=newest&color=087EA4" alt="Newest release, including Beta"></a>
  <a href="https://github.com/mufasa1611/codyx-orchestrator/releases/latest"><img src="https://img.shields.io/github/v/release/mufasa1611/codyx-orchestrator?label=stable&color=16856A" alt="Stable release"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-596579" alt="MIT license"></a>
</p>

<p align="center">
  <a href="#get-started">Get started</a> &middot;
  <a href="#your-workspaces">Workspaces</a> &middot;
  <a href="#models-and-providers">Models</a> &middot;
  <a href="#agents-and-tools">Agents</a> &middot;
  <a href="#updates-and-repair">Updates</a> &middot;
  <a href="#help-and-feedback">Help</a>
</p>

---

## Get Started

**New to Codyx? Start with the Windows launcher.** It installs compiled application files without requiring a source checkout, Git, or a separate Bun installation.

| Download | Choose this when |
| :--- | :--- |
| **[Windows launcher](https://install.kingkung.men/downloads/windows)** | You want the newest available launcher. This can be a Beta. |
| [Stable channel](https://install.kingkung.men/downloads/windows?channel=stable) | You want the current stable release. |
| [Beta channel](https://install.kingkung.men/downloads/windows?channel=beta) | You want to try prerelease improvements. |
| [All platforms and assets](https://github.com/mufasa1611/codyx-orchestrator/releases) | You need a specific version, architecture, or CLI archive. |

### Your First Launch

1. Open **`codyx-installer-launcher-windows-x64.exe`**.
2. Choose **Stable** or **Beta**, review the license, and start installation.
3. Enter your display name and email, then enter the verification code sent to you.
4. Configure a model. For local models, review the engine and hardware recommendations.
5. Open the **Terminal** or **Web UI** workspace and select your project.

You do not need a GitHub account or GitHub token to download or update public releases.

> [!TIP]
> **Already installed? Keep your existing installation.** Close active jobs and use the launcher's update action. If an older launcher cannot upgrade, run the newest installer once. You do not need to uninstall first.

> [!IMPORTANT]
> Download the explicitly named **installer** or **CLI** asset. GitHub's automatic **Source code** archives contain public documentation, not the application. The older `codyx-launcher-windows-x64.exe` is a different, source-based launcher; it is not the recommended installer.

## What You Can Do

| Work | How Codyx helps |
| :--- | :--- |
| **Understand a project** | Explore files, trace behavior, and ask questions with project context. |
| **Plan and implement** | Discuss a change, use agents and tools, then review the result. |
| **Keep work organized** | Switch projects, resume sessions, and track task progress. |
| **Choose your models** | Use configured online providers or a local model that fits your computer. |
| **Automate repeatable tasks** | Use CLI prompts, session exports, and tool integrations. |
| **Extend your workflow** | Configure agents, skills, plugins, custom tools, and MCP connections. |

Tools run with the permissions and access you grant. Review proposed commands and changes, especially on important projects or remote computers.

## Your Workspaces

### Terminal

The TUI is an interactive terminal workspace with model and agent selection, session history, themes, and slash commands. The local terminal normally uses your local profile and projects.

```bash
codyx
```

### Web UI

Use the browser-based workspace for projects, sessions, model selection, and connected computers. The launcher can host it inside its window or open it using **Open in browser**.

```bash
codyx web
```

An authenticated Web UI account has its own session scope. A hosted server's history is not automatically the same as your local TUI history. Keep the launcher open while using the local Web server it started.

### Command Line

Run a focused task without entering the full-screen interface. The launcher's **Open CMD terminal** action opens a separate command window on Windows.

```bash
codyx run "Explain this project's structure. Do not change any files."
```

**Connecting a computer:** use **Connect PC** in the Web UI and follow the instructions for that server. For a remote server, run the displayed connector command on the computer you want to connect. Use a fresh pairing code from the same server. See [accounts, history, and PC connections](docs/USER_GUIDE.md#accounts-history-and-connected-computers).

## Models and Providers

**Choose where inference runs.** A local model uses your computer; an online model sends requests to its provider. Changing providers does not make their pricing or privacy policies identical.

| Option | What to expect |
| :--- | :--- |
| **Ollama** | Local model management and inference. Setup detects installed engines and presents model choices. |
| **llama.cpp / GGUF** | Local inference with compatible GGUF model files and a configured engine. |
| **Online providers** | Integrations include OpenRouter, OpenAI, Anthropic, Google, and others available in your build. Authentication may be required. |
| **Compatible endpoints** | Advanced users can configure supported OpenAI-compatible services, including local endpoints. |

```bash
codyx setup models
codyx models
```

Local recommendations consider available hardware; there is no single best local model for every PC. Memory, GPU capacity, model size, context length, and tool support all affect the experience.

> [!NOTE]
> Free online models can change, become unavailable, or reach provider quotas. Codyx does not promise unlimited free access. Configured fallback can try another eligible provider or a ready local model, but the local engine and model must actually be available. Review fallback choices if you want local-only processing.

[Model setup and troubleshooting](docs/USER_GUIDE.md#models-and-local-engines)

## Agents and Tools

Different agents can handle planning, implementation, and exploration. Built-in roles include:

| Agent | Role |
| :--- | :--- |
| `build` | Main working agent; uses tools according to configured permissions. |
| `plan` | Planning-focused mode with edit tools disabled. |
| `general` | Subagent for multi-step work and research within its available tools. |
| `explore` | Subagent for locating files and understanding code. |

Custom profiles can add specialist workflows such as infrastructure inspection or web research. These require their own tools and configuration; not every profile from a development checkout is bundled in every release.

Use `/agents` in the TUI or `codyx agent list` to see what is actually available. [Agent and extension guide](docs/USER_GUIDE.md#agents-permissions-and-extensions)

## Updates and Repair

- **Keep your channel:** Stable and Beta are separate choices. A new Beta does not replace the Stable release.
- **Check manually:** use the launcher's update action when you want to check immediately.
- **Repair a problem:** use its repair action when available, or run `codyx doctor` for diagnostics.
- **Keep your work:** finish active jobs before updating; back up important configuration and sessions.
- **Older installations:** follow the [migration guide](MIGRATION.md) if the launcher or a Git-based installation cannot update.

Supported launcher update paths check release-manifest hashes and can replace the installed launcher. Very old launchers may need a one-time download of the current installer. Git checkouts of the old source cannot update into this documentation repository.

## Platform Availability

| Platform | Public distribution |
| :--- | :--- |
| **Windows** | Compiled x64 installer/launcher; CLI archives for published Windows targets. |
| **Linux** | CLI archives for published x64/ARM64 and libc variants. |
| **macOS** | CLI archives for published Apple Silicon and Intel targets. |
| **Android** | Use only an APK explicitly listed on the download page or in a release. Otherwise, use a supported browser connection to a Web UI server. |

The Windows launcher is not a Linux, macOS, or Android application. Check the assets for your chosen release; a platform's presence in the development project does not guarantee a published installer.

## Privacy and Control

**Local and online models have different data boundaries.** Online providers receive the context sent to them. Network tools, plugins, connected computers, and hosted servers introduce their own data flows, even when the selected model is local.

The Windows installer requests a display name and email verification. Read the [privacy notice](https://install.kingkung.men/privacy) for registration data, service operation, and contact details. Do not put API keys, verification codes, private transcripts, or personal system details in public issues.

This repository contains **public documentation, compiled releases, and update manifests**. Development source and its history are maintained privately. End users do not need access to that repository.

## Explore the Guide

| Reference | Find out about |
| :--- | :--- |
| [Everyday commands](docs/USER_GUIDE.md#command-reference) | Setup, models, agents, sessions, exports, and diagnostics. |
| [TUI slash commands](docs/USER_GUIDE.md#tui-slash-commands) | Sessions, providers, permissions, themes, and help. |
| [Configuration](docs/USER_GUIDE.md#configuration) | Project settings, permissions, and model discovery. |
| [How it fits together](docs/USER_GUIDE.md#how-it-fits-together) | Interfaces, tools, model providers, and storage. |
| [Troubleshooting](docs/USER_GUIDE.md#troubleshooting) | Slow models, missing history, pairing, and updates. |

## Help and Feedback

[Installer website](https://install.kingkung.men/) &middot; [Feedback](https://install.kingkung.men/feedback) &middot; [GitHub issues](https://github.com/mufasa1611/codyx-orchestrator/issues) &middot; [Privacy](https://install.kingkung.men/privacy) &middot; [Security reporting](SECURITY.md)

For a bug report, include your Codyx version, operating system, release channel, and steps to reproduce. Remove personal data and secrets from logs and screenshots. Public documentation improvements and clear feature requests are welcome.

<details>
<summary><strong>Acknowledgements and license</strong></summary>

Built by **M. Farid (Mufasa)**, with thanks to the upstream projects and open-source maintainers whose work supports Codyx.

The project's acknowledgements include [James Long](https://github.com/jlongster), [Brendan Allan](https://github.com/Brendonovich), [David Hill](https://github.com/iamdavidhill), [Adam](https://github.com/adamdotdevin), [Aiden Cline](https://github.com/rekram1-node), [Kit Langton](https://github.com/kitlangton), [Frank](https://github.com/fwang), [Jay](https://github.com/jayair), and [Dax](https://github.com/thdxr).

See the [MIT license](LICENSE) and [installer license page](https://install.kingkung.men/license). Preserve the copyright and third-party notices included with downloaded software.

</details>
