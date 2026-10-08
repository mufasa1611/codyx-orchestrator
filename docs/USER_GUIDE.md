# Codyx User Guide

[Back to overview](../README.md) &middot; [Downloads](https://install.kingkung.men/downloads) &middot; [Update migration](../MIGRATION.md) &middot; [Feedback](https://install.kingkung.men/feedback)

Practical reference for the public compiled application. Commands and integrations can vary by version; `codyx --help` and each command's `--help` are the reference for your installed build.

## Command Reference

### Start and Configure

| Command | Purpose |
| :--- | :--- |
| `codyx` | Open the interactive terminal workspace. |
| `codyx run "your task"` | Run a prompt from the command line. |
| `codyx web` | Start the local Web UI. |
| `codyx serve` | Start a headless HTTP server; review deployment security before exposing it. |
| `codyx setup` | Open the setup wizard. |
| `codyx setup models` | Select a provider preset and model. |
| `codyx setup models --list` | List setup provider presets. |
| `codyx models` | List available model IDs. |
| `codyx providers list` | List stored provider authentication entries. |
| `codyx providers login` | Connect a provider using an available authentication method. |
| `codyx doctor` | Diagnose installation and environment problems. |

### Sessions and Agents

| Command | Purpose |
| :--- | :--- |
| `codyx session list` | List sessions visible to the current instance. |
| `codyx -s SESSION_ID` | Resume a session in the terminal workspace. |
| `codyx export SESSION_ID` | Export session data as JSON to standard output. |
| `codyx import session.json` | Import a session JSON file. |
| `codyx agent list` | Show available agents and their permissions. |
| `codyx agent create` | Create an agent definition interactively. |
| `codyx run --agent plan "your task"` | Run a task using a named agent. |
| `codyx stats` | Show recorded local usage statistics. |

Replace `SESSION_ID` with an actual ID. Exports can contain private conversation and file content; review them before sharing. Usage statistics are not a substitute for the provider's billing records.

<details>
<summary><strong>More commands for advanced users</strong></summary>

| Command | Purpose |
| :--- | :--- |
| `codyx mcp --help` | Configure and inspect MCP integrations. |
| `codyx acp --help` | Run the Agent Client Protocol interface. |
| `codyx plugin --help` | Install a plugin and update configuration. |
| `codyx plugins` | Inspect installed plugins and dependency health. |
| `codyx users --help` | Inspect server account management commands. |
| `codyx github --help` | Inspect GitHub integration commands. |
| `codyx pr --help` | Inspect pull-request workflow options. |
| `codyx debug --help` | Inspect diagnostic commands. |
| `codyx upgrade --help` | Inspect update options for the installed distribution. |
| `codyx uninstall --help` | Review uninstall options before removing an installation. |

Managed Windows installations should normally use the launcher's update and repair actions. Do not mix npm, source-checkout, and compiled-installer instructions for the same installation.

</details>

### Try a Focused Task

Run these from the project directory you want Codyx to work with:

```bash
codyx run "Explain the project structure and identify the test commands. Do not edit files."
codyx run --agent plan "Plan how to add validation to the settings form."
```

To select a model explicitly, use `--model provider/model` with an exact ID returned by `codyx models`. Task quality and tool reliability depend on the model, context, and permissions.

## TUI Slash Commands

Type `/` in the terminal prompt to browse available commands. These are TUI commands, not operating-system shell commands.

| Command | Action |
| :--- | :--- |
| `/new` | Start a new session; does not delete previous history. |
| `/sessions` | Browse and switch sessions; aliases include `/resume` and `/continue`. |
| `/models` | Choose a model. |
| `/agents` | Choose an available agent. |
| `/connect` | Connect an AI provider. This is different from Web UI **Connect PC**. |
| `/mcps` | Manage enabled MCP connections. |
| `/variants` | Choose a model variant when the provider offers one. |
| `/permissions` | Choose the permission level. |
| `/status` | Inspect connection and system status. |
| `/themes` | Choose a terminal theme. |
| `/help` | Show terminal help. |
| `/exit` | Exit; aliases include `/quit` and `/q`. |

Other commands may appear based on the active session, connected services, or extensions.

## Models and Local Engines

### Guided Setup

**Windows launcher, v2.0.0.45 and later:**

1. Finish installation and email verification. The launcher opens **Connect your models**.
2. For online models, press **Connect OpenRouter in browser**. Sign in or create your OpenRouter account, approve Codyx, then return to the launcher. No API-key copying is needed.
3. For models already on your PC, press **Find installed models**, select one, and press **Use selected installed model**. Use **Choose existing GGUF file** for another folder.
4. To download a local model, select a recommendation and press **Set up Ollama** or **Set up llama.cpp**. Confirm the download. Existing engines are reused.
5. Keep the local-backup checkbox selected for online-first operation, or clear it for local-first operation. Without a tested primary connection, selecting an existing local model makes it primary.
6. After the chat-and-tool test succeeds, press **Continue to workspace**. Return to **Model connections** later to change or retest connections.

Models that exceed the conservative RAM estimate are excluded from the selection. A listed model is not guaranteed to support agent tools until its test passes. Hosted Ollama cloud entries are not offline models and are excluded. Split GGUF files must remain together; select their first part.

An OpenRouter quota error is not a missing-Ollama error. Wait for the provider allowance to renew or choose a tested local connection. No paid fallback or developer API key is supplied.

**Terminal setup and older launchers:**

1. Run `codyx setup models`.
2. Choose an online provider or a local engine preset.
3. For local options, review the detected engine, version, memory, and model recommendations.
4. Follow the displayed installation, engine-update, or model-download instructions where needed.
5. Run `codyx models` and select the configured model.

Setup uses hardware estimates to recommend fitting local models. GPU memory, quantization, context size, and other running applications can change the practical limit. Start with a smaller compatible model if a larger one is slow or runs out of memory.

### Local Choices

**Ollama:** the engine and model are separate downloads. The model must be installed and the engine reachable. Existing installed models can appear in the setup list. Do not start a duplicate engine if one is already running.

**llama.cpp / GGUF:** choose a compatible GGUF file and configure the local engine endpoint. A model file alone is not a running server. Tool use also depends on the model, chat template, and engine configuration.

**Other compatible servers:** advanced provider configuration can connect to supported OpenAI-compatible endpoints. Use the actual endpoint and model ID advertised by your server, not a placeholder copied from an example.

### Online Models and Fallback

Use `/connect` or `codyx providers login` to configure a supported provider. Select models from the application rather than relying on an old list of free model names. Availability, quotas, billing, and account requirements can change.

Configured fallback may move between eligible online models and a configured local model. A shared provider quota can affect several models at once. A local fallback requires a working engine and a model that fits the host machine. On a hosted Web UI, "local" inference normally means the **server's** local engine, not automatically the visitor's PC.

For a privacy-sensitive task, review the selected provider and fallback configuration before sending project context. Selecting a local model does not disable network-capable tools or plugins.

## Accounts, History, and Connected Computers

### Find the Right History

- **Local TUI:** uses the current local profile and project context.
- **Local Web UI:** uses the account and server instance you opened.
- **Hosted Web UI:** uses your account on that particular server; another account or server has a different session scope.

If history looks empty, check the account, server address, project selection, and active filters first. Do not delete databases or reinstall just to look for sessions. Export and import can help with intentional transfers; review sensitive content before moving it.

### Connect a PC

For a local Web UI, choose **Connect PC** and use the local connection option offered by the application. A browser alone does not grant unrestricted access to your drives.

For a hosted Web UI:

1. Sign in to the intended server and choose **Connect PC**.
2. Copy the newly generated connector command from that server.
3. Run it on the computer whose files you want to access.
4. Confirm the connection and inspect the available drives and folders.

Pairing codes are temporary and belong to the server that issued them. If a code expires or is rejected, generate a new one; do not keep retrying the old code or substitute another server's address. Keep the connector running while using that connection. Only connect computers you are authorized to access.

## Agents, Permissions, and Extensions

Built-in working roles include `build`, `plan`, `general`, and `explore`. Additional names depend on installed definitions. Inspect them with `codyx agent list`; use `codyx agent create` for guided creation.

Custom agents can specialize in Windows, SSH, Docker, systemd, Proxmox, backup inspection, or research. Such profiles need corresponding tools, credentials, and target access. A fresh compiled installation does not necessarily include every development profile.

### Set Permissions Deliberately

The TUI offers Restricted, Standard, and Full permission modes. Standard asks before mutations; Full is intended for trusted work where you accept reduced prompting. Individual agents and configured rules also affect the tools they can use.

Review file edits and shell commands before allowing them. Back up important work and use version control where possible. An AI-generated plan or successful tool call is not proof that a change is correct.

### Extend the Application

| Extension | Purpose |
| :--- | :--- |
| Agent definitions | Custom instructions, role selection, and permission rules. |
| Skills | Reusable task instructions and supporting resources. |
| Local tools | Project-specific operations loaded from tool definitions. |
| Plugins | Additional application behavior and integrations. |
| MCP | Connections to external tool and data servers. |
| ACP | Integration with compatible agent clients. |

Only install extensions you trust. Their code and external services can access information allowed by your configuration. Never publish real credentials in examples or agent files.

## Configuration

Use the setup UI and model selector first. Advanced project configuration can live in `.cody/cody.jsonc`. User-level and installer-generated settings can also apply; their locations depend on the installation and environment.

A minimal project permission example:

```jsonc
{
  "permission": {
    "edit": "ask",
    "bash": "ask"
  }
}
```

Merge changes into existing configuration rather than replacing a working file. Do not paste multiple provider examples with conflicting model IDs. Keep secrets out of version control and use the supported provider authentication flow.

<details>
<summary><strong>Model discovery and environment settings</strong></summary>

| Variable | Purpose |
| :--- | :--- |
| `CODY_REFRESH_MODELS=1` | Request fresh local model discovery. |
| `CODY_SKIP_MODEL_DISCOVERY=1` | Skip local discovery for the process. |
| `XDG_DATA_HOME` | Override the data root; changing it can make existing sessions appear absent. |

Refresh discovery for one PowerShell launch:

```powershell
$env:CODY_REFRESH_MODELS = "1"
try { codyx } finally { Remove-Item Env:CODY_REFRESH_MODELS -ErrorAction SilentlyContinue }
```

Windows compiled application files normally live under `%LOCALAPPDATA%\Programs\Codyx-Orchestrator`. Installer verification state is separate under `%LOCALAPPDATA%\codyx-installer`. Application configuration and conversation storage are not necessarily inside the program directory. Do not move or delete them without a backup.

</details>

## How It Fits Together

| Layer | Responsibility |
| :--- | :--- |
| Terminal, CLI, Web UI | Different ways to work with projects and sessions. |
| Session and agent runtime | Context, tool calls, permissions, and delegated work. |
| Provider connections | Requests to your online service or local inference engine. |
| Tools and integrations | Files, approved commands, plugins, and connected services. |
| Storage | State for the selected instance; session storage uses SQLite. |

The application uses a TypeScript/Bun runtime, a SolidJS-based Web UI and terminal interface, and HTTP/WebSocket communication. End users of the Windows compiled installer do not need to build these components.

`codyx serve` is an advanced server entry point, not a complete secure public deployment recipe. A shared deployment needs correctly configured authentication, TLS, account isolation, permissions, persistent storage, backups, and an update policy. Do not expose an unconfigured development server directly to the internet. Public downloads do not grant access to the private development repository.

## Troubleshooting

| Symptom | First checks |
| :--- | :--- |
| A model keeps thinking | Check provider status, quota, context size, and local engine load. Cancel before retrying if needed. |
| Chat works but tools fail | Check tool-call support, chat template, engine version, and permissions. Try a configured tool-capable model. |
| Local model is slow | Choose a smaller fitting model and shorter context; check memory and acceleration. |
| Sessions are missing | Check the current account, server, project, and data directory. |
| Pairing is invalid or expired | Generate a new code on the intended server and use its displayed command. |
| Connected drives are missing | Check the selected computer, connector process, OS access, and connection status. |
| Browser stops after closing the launcher | Its local Web server stops with it. Keep the launcher open. |
| Update does not replace an old launcher | Close active work, use the supported update path, or run the current installer once. See [migration](../MIGRATION.md). |
| CLI command is not recognized | Reopen the terminal after installation and check `codyx --help`. |
| Windows warns about a download | Verify its origin and checksum. Do not disable protection or run an untrusted file just to proceed. |

Start with `codyx doctor` for diagnostics. Use the launcher's repair action where available. Before sharing a log, remove keys, email verification details, private paths, and conversation content.

## Help and Policies

[Feedback](https://install.kingkung.men/feedback) &middot; [Issues](https://github.com/mufasa1611/codyx-orchestrator/issues) &middot; [Privacy](https://install.kingkung.men/privacy) &middot; [License](../LICENSE) &middot; [Security reporting](../SECURITY.md)

For support, include the installed version, operating system, Stable/Beta channel, and a short reproduction. Do not share passwords, API keys, pairing codes, or private transcripts.
